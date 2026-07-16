import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { generateAutoReply } from "@/lib/agents/socialManagementAgent";

const GRAPH_VERSION = "v19.0";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && token && token === expectedToken) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

async function sendDmReply(pageAccessToken: string, recipientId: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${pageAccessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Failed to send DM reply");
}

async function sendCommentReply(pageAccessToken: string, commentId: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${commentId}/comments?access_token=${pageAccessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Failed to send comment reply");
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const entries = body?.entry ?? [];

  for (const entry of entries) {
    const pageId: string | undefined = entry?.id;
    if (!pageId) continue;

    const { data: dealership } = await supabase
      .from("dealerships")
      .select("id, dealership_name, business_category, fb_page_access_token, dm_auto_reply_enabled, comment_auto_reply_enabled")
      .eq("fb_page_id", pageId)
      .maybeSingle();
    if (!dealership || !dealership.fb_page_access_token) continue;

    const { data: brandProfile } = await supabase
      .from("brand_profiles")
      .select("tone_of_voice")
      .eq("dealership_id", dealership.id)
      .maybeSingle();

    // --- DMs (Messenger/Instagram) ---
    if (dealership.dm_auto_reply_enabled) {
      for (const msgEvent of entry?.messaging ?? []) {
        const senderId = msgEvent?.sender?.id;
        const text = msgEvent?.message?.text;
        // Skip echoes (our own sent messages bouncing back) and non-text.
        if (!senderId || !text || msgEvent?.message?.is_echo) continue;

        let replyText: string | null = null;
        let success = true;
        let errorMsg: string | null = null;
        try {
          replyText = await generateAutoReply("dm", text, dealership.dealership_name, dealership.business_category ?? "business", brandProfile);
          if (replyText) {
            await sendDmReply(dealership.fb_page_access_token, senderId, replyText);
          } else {
            success = false;
            errorMsg = "No reply generated";
          }
        } catch (err: any) {
          success = false;
          errorMsg = err.message;
        }
        await supabase.from("auto_reply_log").insert({
          dealership_id: dealership.id, channel: "dm", source_id: senderId,
          incoming_text: text, reply_text: replyText, success, error: errorMsg,
        });
      }
    }

    // --- Comments (feed) ---
    if (dealership.comment_auto_reply_enabled) {
      for (const change of entry?.changes ?? []) {
        if (change?.field !== "feed") continue;
        const value = change?.value;
        if (value?.item !== "comment" || value?.verb !== "add") continue;
        // Don't reply to our own comments (e.g. replies we just sent).
        if (value?.from?.id === pageId) continue;

        const commentId = value?.comment_id;
        const text = value?.message;
        if (!commentId || !text) continue;

        let replyText: string | null = null;
        let success = true;
        let errorMsg: string | null = null;
        try {
          replyText = await generateAutoReply("comment", text, dealership.dealership_name, dealership.business_category ?? "business", brandProfile);
          if (replyText) {
            await sendCommentReply(dealership.fb_page_access_token, commentId, replyText);
          } else {
            success = false;
            errorMsg = "No reply generated";
          }
        } catch (err: any) {
          success = false;
          errorMsg = err.message;
        }
        await supabase.from("auto_reply_log").insert({
          dealership_id: dealership.id, channel: "comment", source_id: commentId,
          incoming_text: text, reply_text: replyText, success, error: errorMsg,
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
