import { generateAutoReply } from "@/lib/agents/socialManagementAgent";

const GRAPH_VERSION = "v19.0";

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

// Processes ONE webhook `entry` for DM/comment auto-reply. Safe to call
// on every entry regardless of what it contains — it just no-ops if
// there's no dealership match, no messaging/feed payload, or the
// relevant toggle is off. Meta only allows a single Callback URL per
// Page product, so this needs to live alongside leadgen processing on
// the same URL rather than a separate endpoint.
export async function handleAutoReplyEntry(entry: any, supabase: any) {
  const pageId: string | undefined = entry?.id;
  if (!pageId) return;

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("id, dealership_name, business_category, fb_page_access_token, dm_auto_reply_enabled, comment_auto_reply_enabled")
    .eq("fb_page_id", pageId)
    .maybeSingle();
  if (!dealership || !dealership.fb_page_access_token) return;
  if (!dealership.dm_auto_reply_enabled && !dealership.comment_auto_reply_enabled) return;

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice")
    .eq("dealership_id", dealership.id)
    .maybeSingle();

  if (dealership.dm_auto_reply_enabled) {
    for (const msgEvent of entry?.messaging ?? []) {
      const senderId = msgEvent?.sender?.id;
      const text = msgEvent?.message?.text;
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

  if (dealership.comment_auto_reply_enabled) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "feed") continue;
      const value = change?.value;
      if (value?.item !== "comment" || value?.verb !== "add") continue;
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
