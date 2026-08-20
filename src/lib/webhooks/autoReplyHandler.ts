import { generateAutoReply } from "@/lib/agents/socialManagementAgent";
import { resolveDmLead } from "@/lib/leads/dmLeadLinking";
import { getBusinessContext } from "@/lib/businessBrain";
import { getLeadMemory } from "@/lib/businessMemory/getLeadMemory";

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

// Instagram Business Login uses a genuinely different API surface —
// graph.instagram.com (not graph.facebook.com), Bearer auth header
// (not an access_token query param), and the IG_ID/Instagram-scoped
// IDs from that login flow, not Facebook Page IDs. Confirmed against
// Meta's current Instagram Platform docs rather than assumed, since
// getting this wrong fails silently (a 401 that just gets logged).
async function sendInstagramDmReply(accessToken: string, igBusinessId: string, recipientId: string, text: string) {
  const res = await fetch(`https://graph.instagram.com/v26.0/${igBusinessId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Failed to send Instagram DM reply");
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
//
// Handles TWO separate connection types sharing this one entry point:
// Facebook Page-linked accounts (entry.id = Facebook Page ID, sends
// via graph.facebook.com) and Instagram Business Login accounts
// (entry.id = Instagram Business Account ID, sends via
// graph.instagram.com with different auth) — these are genuinely
// different Meta connections, not two names for the same thing, so a
// dealership matches on exactly one of the two lookups below, never
// both.
export async function handleAutoReplyEntry(entry: any, supabase: any) {
  const entryId: string | undefined = entry?.id;
  if (!entryId) return;

  let dealership = (await supabase
    .from("dealerships")
    .select("id, dealership_name, business_category, fb_page_access_token, dm_auto_reply_enabled, comment_auto_reply_enabled")
    .eq("fb_page_id", entryId)
    .maybeSingle()).data;

  let channel: "facebook" | "instagram" = "facebook";
  if (!dealership) {
    const igResult = await supabase
      .from("dealerships")
      .select("id, dealership_name, business_category, instagram_access_token, dm_auto_reply_enabled, comment_auto_reply_enabled")
      .eq("instagram_business_id", entryId)
      .maybeSingle();
    if (igResult.data) {
      dealership = igResult.data;
      channel = "instagram";
    }
  }

  if (!dealership) return;
  const replyToken = channel === "instagram" ? dealership.instagram_access_token : dealership.fb_page_access_token;
  if (!replyToken) return;
  if (!dealership.dm_auto_reply_enabled && !dealership.comment_auto_reply_enabled) return;

  // P3 20a — was its own separate brand_profiles query; now the same
  // shared assembler chat and calls already use, so this surface
  // gains business_knowledge (hours/pricing/policies/FAQs) for the
  // first time — useful for common DM questions ("are you open
  // Sundays") the catalog alone could never answer.
  const businessCtx = await getBusinessContext(supabase, dealership.id);
  const brandProfile = { tone_of_voice: businessCtx.toneOfVoice };

  // Real catalog — capped at 40 products to keep the prompt a
  // reasonable size; a seller with more than that is a genuine edge
  // case worth revisiting, not the common Insta-seller scenario this
  // is built for.
  const { data: products } = await supabase
    .from("products")
    .select("name, price, description, inventory_count")
    .eq("dealership_id", dealership.id)
    .eq("is_active", true)
    .limit(40);
  const productCatalog = (products ?? []).map((p: any) => ({ name: p.name, price: p.price, description: p.description, inventoryCount: p.inventory_count }));

  if (dealership.dm_auto_reply_enabled) {
    for (const msgEvent of entry?.messaging ?? []) {
      const senderId = msgEvent?.sender?.id;
      const text = msgEvent?.message?.text;
      if (!senderId || !text || msgEvent?.message?.is_echo) continue;

      // P2 27a-iii — attributes every DM to a real lead (a "DM-only"
      // lead when no phone is ever volunteered), never left orphaned.
      // Moved ahead of generation (P3 — Personalization) so this
      // sender's own history can inform the reply itself, not just
      // the log entry after the fact.
      let leadId: string | null = null;
      try {
        leadId = await resolveDmLead(supabase, dealership.id, senderId, channel, text);
      } catch (err: any) {
        console.error("[auto-reply] resolveDmLead failed:", err.message);
      }
      const pastInsights = leadId ? await getLeadMemory(supabase, dealership.id, leadId) : [];

      let replyText: string | null = null;
      let success = true;
      let errorMsg: string | null = null;
      try {
        replyText = await generateAutoReply("dm", text, dealership.dealership_name, dealership.business_category ?? "business", brandProfile, productCatalog, businessCtx.knowledgeFacts, pastInsights);
        if (replyText) {
          if (channel === "instagram") {
            await sendInstagramDmReply(replyToken, entryId, senderId, replyText);
          } else {
            await sendDmReply(replyToken, senderId, replyText);
          }
        } else {
          success = false;
          errorMsg = "No reply generated";
        }
      } catch (err: any) {
        success = false;
        errorMsg = err.message;
      }
      await supabase.from("auto_reply_log").insert({
        dealership_id: dealership.id, channel: `dm_${channel}`, source_id: senderId, lead_id: leadId,
        incoming_text: text, reply_text: replyText, success, error: errorMsg,
      });
    }
  }

  // Comment replies stay Facebook-only for now — Instagram comment
  // replies use yet another endpoint shape not built here yet; the
  // DM path above is the one that matters for the Insta-seller
  // product-question use case this was built for.
  if (dealership.comment_auto_reply_enabled && channel === "facebook") {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "feed") continue;
      const value = change?.value;
      if (value?.item !== "comment" || value?.verb !== "add") continue;
      if (value?.from?.id === entryId) continue;

      const commentId = value?.comment_id;
      const text = value?.message;
      if (!commentId || !text) continue;

      let replyText: string | null = null;
      let success = true;
      let errorMsg: string | null = null;
      try {
        replyText = await generateAutoReply("comment", text, dealership.dealership_name, dealership.business_category ?? "business", brandProfile, productCatalog, businessCtx.knowledgeFacts);
        if (replyText) {
          await sendCommentReply(replyToken, commentId, replyText);
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
