import { generateAutoReply } from "@/lib/agents/socialManagementAgent";
import { resolveDmLead } from "@/lib/leads/dmLeadLinking";
import { getBusinessContext } from "@/lib/businessBrain";
import { resolvePersona } from "@/lib/agents/personas";
import { getLeadMemory } from "@/lib/businessMemory/getLeadMemory";
import { INSTAGRAM_TOKEN_SELECT, readInstagramToken, readMetaPageToken } from "@/lib/crypto/oauthSecrets";
import { fetchCatalog, type CatalogProduct } from "@/lib/claims/businessFacts";
import { bookingPageUrl } from "@/lib/catalog/catalogItem";
import { siteUrl } from "@/lib/email/consent";
import { recordDelivery } from "@/lib/webhooks/deliveryLog";
import { recordHealth } from "@/lib/integrations/health";
import { readDmThread } from "@/lib/dm/thread";
import { holdingLine } from "@/lib/dm/holdingLine";
import { shouldSendHoldingLine, tellSellerCustomerIsWaiting } from "@/lib/dm/escalation";
import { recordAnswerGap } from "@/lib/chat/answerGaps";
import { healthFromFailure } from "@/lib/integrations/healthState";
import { SELLER_MODE_TAKES_ORDERS } from "@/lib/dm/sellerMode";
import { handleOrderTurn, type OrderTurn } from "@/lib/dm/orderConversation";
import { buildOrderTurnDeps } from "@/lib/dm/orderTurnDeps";
import { describeMessageShape } from "@/lib/dm/messageShape";
import { fetchCaption, productFromCaption, readPostRef, withPostContext } from "@/lib/dm/postContext";
// The Instagram transport moved to its own module on 28 Nov 2026 (O4′):
// the invoice sends through it too.
import { sendInstagramDmReply, sendInstagramDmImage } from "@/lib/instagram/dm";
import { normaliseLanguage } from "@/lib/content/language";

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



/**
 * Send one order turn's messages, in order, and log what went out — O1,
 * 28 November 2026.
 *
 * ITS OWN FUNCTION, and not tidiness: tests/dmConversationMemory reads
 * the DM loop from the thread read to its first auto_reply_log insert
 * and requires the ordinary reply inside that span. Writing this log
 * inline put an insert first, so the code moved rather than the guard —
 * the same call this codebase made for whatsappNotice.ts.
 *
 * THE TEXT GOES FIRST. The payment request's text carries the UPI ID and
 * the link, so a refused QR image costs one way to pay, not the payment;
 * it is recorded and the turn still counts as sent.
 */
async function sendOrderTurn(
  supabase: any,
  a: { dealershipId: string; replyToken: string; entryId: string; senderId: string; text: string; leadId: string | null; turn: Extract<OrderTurn, { handled: true }> }
) {
  const sent: string[] = [];
  const problems: string[] = a.turn.note ? [a.turn.note] : [];
  let ok = true;
  try {
    for (const m of a.turn.messages) {
      if ("text" in m) {
        await sendInstagramDmReply(a.replyToken, a.entryId, a.senderId, m.text);
        sent.push(m.text);
      } else {
        try {
          await sendInstagramDmImage(a.replyToken, a.entryId, a.senderId, m.imageUrl);
          sent.push("[UPI QR code]");
        } catch (imgErr: any) {
          problems.push(`the QR image wasn't sent: ${imgErr?.message ?? imgErr}`);
        }
      }
    }
    if (sent.length) await recordHealth(supabase, a.dealershipId, "instagram", { state: "working", reason: null });
  } catch (sendErr: any) {
    ok = false;
    problems.push(sendErr?.message ?? String(sendErr));
    await recordHealth(supabase, a.dealershipId, "instagram", healthFromFailure(sendErr?.message));
    // AN ORDER WAS PLACED AND ITS PAYMENT REQUEST DID NOT ARRIVE: the
    // seller must hear it, or the customer waits for a UPI ID nobody sent.
    if (a.turn.orderId) {
      await tellSellerCustomerIsWaiting(supabase, { dealershipId: a.dealershipId, channel: "instagram", senderId: a.senderId, customerSaid: a.text, why: "an order was placed but the payment request couldn't be sent" });
    }
  }
  await supabase.from("auto_reply_log").insert({
    dealership_id: a.dealershipId, channel: "dm_instagram", source_id: a.senderId, lead_id: a.leadId,
    incoming_text: a.text, reply_text: sent.length ? sent.join("\n\n") : null, success: ok,
    error: problems.length ? problems.join(" — ") : null,
  });
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
/**
 * The catalogue a DM or comment reply may quote. A service (migration 188)
 * is booked, not bought: it carries its duration and where to book, and no
 * stock — so a reply never says a workshop is "in stock".
 */
export function autoReplyCatalog(items: CatalogProduct[], bookingPage: string | null) {
  return items.map((p) => ({
    name: p.name,
    price: p.price,
    description: p.description,
    inventoryCount: p.kind === "service" ? null : p.inventory,
    ...(p.kind === "service" ? { kind: "service" as const, durationMinutes: p.durationMinutes ?? null, bookingLink: p.bookingUrl || bookingPage } : {}),
  }));
}

export async function handleAutoReplyEntry(entry: any, supabase: any, source: "meta-leads" | "meta-messaging" = "meta-leads") {
  // EVERY RETURN BELOW RECORDS WHY (migration 226). The behaviour is
  // unchanged — a webhook endpoint should stay quiet to Meta — but
  // being quiet to Meta was also being quiet to the owner, and that is
  // what left the auto-reply toggles on with an empty log for months.
  const entryId: string | undefined = entry?.id;
  if (!entryId) {
    await recordDelivery(supabase, { source, outcome: "no_entry_id", detail: "the webhook entry carried no id" });
    return;
  }

  let dealership = (await supabase
    .from("dealerships")
    .select("id, dealership_name, business_category, fb_page_access_token, fb_page_access_token_encrypted, dm_auto_reply_enabled, comment_auto_reply_enabled")
    .eq("fb_page_id", entryId)
    .maybeSingle()).data;

  let channel: "facebook" | "instagram" = "facebook";
  if (!dealership) {
    const igResult = await supabase
      .from("dealerships")
      .select(`id, dealership_name, business_category, ${INSTAGRAM_TOKEN_SELECT}, dm_auto_reply_enabled, comment_auto_reply_enabled, instagram_selling_enabled, seller_upi_vpa`)
      .eq("instagram_business_id", entryId)
      .maybeSingle();
    if (igResult.data) {
      dealership = igResult.data;
      channel = "instagram";
    }
  }

  if (!dealership) {
    // THE MOST DIAGNOSTIC ROW IN THE TABLE. The id Meta named is kept,
    // so it can be compared with what dealerships.fb_page_id and
    // instagram_business_id actually hold.
    await recordDelivery(supabase, {
      source, entryId, outcome: "no_business_matched",
      detail: "no business has this id as its Facebook page or Instagram business account",
    });
    return;
  }
  // F3: encrypted first, plaintext fallback, null past a known expiry.
  const replyToken = channel === "instagram" ? readInstagramToken(dealership) : readMetaPageToken(dealership);
  if (!replyToken) {
    await recordDelivery(supabase, {
      source, entryId, dealershipId: dealership.id, outcome: "no_reply_token",
      detail: `matched on ${channel}, but the connection has no usable access token`,
    });
    return;
  }
  if (!dealership.dm_auto_reply_enabled && !dealership.comment_auto_reply_enabled) {
    await recordDelivery(supabase, {
      source, entryId, dealershipId: dealership.id, outcome: "both_toggles_off",
      detail: "DM and comment auto-reply are both switched off",
    });
    return;
  }

  // P3 20a — was its own separate brand_profiles query; now the same
  // shared assembler chat and calls already use, so this surface
  // gains business_knowledge (hours/pricing/policies/FAQs) for the
  // first time — useful for common DM questions ("are you open
  // Sundays") the catalog alone could never answer.
  const [businessCtx, persona] = await Promise.all([
    getBusinessContext(supabase, dealership.id),
    resolvePersona(supabase, dealership.id, "dm"), // P3 piece 5 — defaults to support
  ]);
  // An auto-reply goes to a customer unread by anyone here, so the
  // owner's chosen language applies to it like any other copy.
  const brandProfile = { tone_of_voice: businessCtx.toneOfVoice, preferred_language: businessCtx.facts?.brand?.language ?? null };

  // Real catalog — capped at 40 products to keep the prompt a
  // reasonable size; a seller with more than that is a genuine edge
  // case worth revisiting, not the common Insta-seller scenario this
  // is built for.
  // The one catalogue every path shares (src/lib/claims) — same columns,
  // same active rule, same shape as the facts the guard checks copy
  // against. This used to be its own query with its own field list.
  const catalogItems = await fetchCatalog(supabase, dealership.id);
  const bookingPage = catalogItems.some((p) => p.kind === "service")
    ? bookingPageUrl((await supabase.from("dealerships").select("booking_slug").eq("id", dealership.id).maybeSingle()).data?.booking_slug, siteUrl())
    : null;
  const productCatalog = autoReplyCatalog(catalogItems, bookingPage);

  // Whether any customer message or comment in this entry was actually
  // answered — read at the end to tell "handled" from "nothing to do".
  let handledSomething = false;
  // T1, step one (28 Nov 2026): the SHAPE of each DM that had no text — a
  // shared post, a story reply — recorded so T1 is built on a real payload,
  // not a guess. Types and key names only; never a URL, id or content.
  const textlessShapes: string[] = [];
  // AND OF A DM WITH TEXT THAT POINTS AT SOMETHING (28 Nov 2026). A story
  // reply carries the customer's words ("iska price?") AND what they are
  // replying to; recording only text-less DMs missed exactly that one in
  // the founder's first test — it was answered as if it pointed at nothing.
  const contextShapes: string[] = [];

  if (dealership.dm_auto_reply_enabled) {
    for (const msgEvent of entry?.messaging ?? []) {
      const senderId = msgEvent?.sender?.id;
      const rawText = msgEvent?.message?.text;
      if (senderId && !msgEvent?.message?.is_echo) {
        const shape = describeMessageShape(msgEvent?.message);
        if (shape) (rawText ? contextShapes : textlessShapes).push(shape);
      }
      // T1 (28 Nov 2026): A DM THAT POINTS AT A POST — a shared post (no
      // text) or a story reply ("iska price?"). Its caption is read with
      // the shop's own token and, when it carries #HawlaiTag: <product>,
      // the product is named. The reply and the order flow both see it.
      // Before this, a shared post was skipped and a story reply was
      // answered as if it pointed at nothing.
      let text: string | undefined = rawText;
      const postRef = channel === "instagram" && senderId && !msgEvent?.message?.is_echo ? readPostRef(msgEvent?.message) : null;
      if (postRef) {
        const caption = postRef.mediaId ? await fetchCaption(replyToken, postRef.mediaId) : null;
        text = withPostContext(rawText ?? "", postRef, caption, productFromCaption(caption, catalogItems));
      }
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
      // F1 — this sender's earlier turns. Read BEFORE this message is
      // logged below, so the thread is what came before it.
      const thread = await readDmThread(supabase, dealership.id, channel, senderId);

      // ── SELLER MODE, O1 (28 Nov 2026) ─────────────────────────────
      // An order in progress is handled before the ordinary reply. Only
      // while order-taking is live AND this business has Seller Mode on
      // with a UPI ID saved; anything that is not the order — or an order
      // step that fails — falls through to the reply below, unchanged.
      if (channel === "instagram" && SELLER_MODE_TAKES_ORDERS && dealership.instagram_selling_enabled && dealership.seller_upi_vpa) {
        let turn: OrderTurn = { handled: false };
        try {
          turn = await handleOrderTurn(
            text,
            buildOrderTurnDeps(supabase, {
              dealershipId: dealership.id,
              dealershipName: dealership.dealership_name,
              upiVpa: dealership.seller_upi_vpa,
              senderId,
              language: normaliseLanguage(brandProfile.preferred_language),
              catalog: catalogItems,
              turns: thread.turns,
            })
          );
        } catch (orderErr: any) {
          console.error(`[auto-reply] order step failed for ${dealership.id}; answering normally: ${orderErr?.message ?? orderErr}`);
        }
        if (turn.handled) {
          await sendOrderTurn(supabase, { dealershipId: dealership.id, replyToken, entryId, senderId, text, leadId, turn });
          handledSomething = true;
          continue;
        }
      }

      let replyText: string | null = null;
      let success = true;
      let errorMsg: string | null = null;
      try {
        // businessCtx.facts was already gathered for this request and
        // was the one thing this call never received (G-5). Null means
        // the records are unreadable and generateAutoReply refuses.
        const outcome = await generateAutoReply("dm", text, dealership.dealership_name, dealership.business_category ?? "business", brandProfile, productCatalog, businessCtx.knowledgeFacts, pastInsights, persona.goals, { supabase, dealershipId: dealership.id }, businessCtx.facts, thread.turns);
        replyText = outcome.reply;
        if (outcome.reply) {
          // THE SEND IS EVIDENCE ABOUT THE CONNECTION (H2, 27 Nov 2026).
          // Only the send: a reply that could not be WRITTEN says nothing
          // about Instagram or the Page, so it is never recorded here.
          // recordHealth never throws, so this cannot change the outcome.
          const connection = channel === "instagram" ? "instagram" : "meta_page";
          try {
            if (channel === "instagram") {
              await sendInstagramDmReply(replyToken, entryId, senderId, outcome.reply);
            } else {
              await sendDmReply(replyToken, senderId, outcome.reply);
            }
            await recordHealth(supabase, dealership.id, connection, { state: "working", reason: null });
          } catch (sendErr: any) {
            await recordHealth(supabase, dealership.id, connection, healthFromFailure(sendErr?.message));
            throw sendErr;
          }
        } else {
          // ESCALATED, NOT SWALLOWED. "No reply generated" was logged
          // for five different causes, so the owner could not tell a
          // withheld claim from an outage — and either way a customer
          // was left waiting with nobody told.
          success = false;
          // The withheld claims go into `error`, which the owner
          // already sees — auto_reply_log has no column for them and
          // this needs no migration.
          errorMsg = [outcome.escalate ?? "No reply generated.", (outcome.withheld ?? []).join("; ")]
            .filter(Boolean)
            .join(" ");

          // F2 (28 Nov 2026): NEVER SILENT ON EITHER SIDE. The customer gets
          // the honest holding line - once since the last real answer -
          // and the seller is told at once. A failed holding line is
          // recorded, never thrown: the seller is still told.
          if (shouldSendHoldingLine(thread.turns)) {
            const hold = holdingLine(brandProfile.preferred_language);
            try {
              if (channel === "instagram") await sendInstagramDmReply(replyToken, entryId, senderId, hold);
              else await sendDmReply(replyToken, senderId, hold);
              replyText = hold;
              errorMsg = `${errorMsg} - the customer was told the team will reply.`;
            } catch (holdErr: any) {
              errorMsg = `${errorMsg} - the holding reply also failed: ${holdErr?.message ?? holdErr}`;
            }
          }
          await tellSellerCustomerIsWaiting(supabase, { dealershipId: dealership.id, channel, senderId, customerSaid: text, why: outcome.escalate });
        }
        // F2 - the question the records were silent on, from a DM.
        if (outcome.unanswered) {
          await recordAnswerGap(supabase, dealership.id, outcome.unanswered, channel === "instagram" ? "instagram_dm" : "facebook_dm");
        }
      } catch (err: any) {
        success = false;
        errorMsg = err.message;
      }
      await supabase.from("auto_reply_log").insert({
        dealership_id: dealership.id, channel: `dm_${channel}`, source_id: senderId, lead_id: leadId,
        incoming_text: text, reply_text: replyText, success, error: errorMsg,
      });
      handledSomething = true;
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
        // No pastInsights on the comment path — a public comment has
        // no resolved lead identity (resolveDmLead is DM-only, P2
        // 27a-iii), so there's no specific person's history to draw on.
        const outcome = await generateAutoReply("comment", text, dealership.dealership_name, dealership.business_category ?? "business", brandProfile, productCatalog, businessCtx.knowledgeFacts, null, persona.goals, { supabase, dealershipId: dealership.id }, businessCtx.facts);
        replyText = outcome.reply;
        if (outcome.reply) {
          await sendCommentReply(replyToken, commentId, outcome.reply);
        } else {
          success = false;
          // The withheld claims go into `error`, which the owner
          // already sees — auto_reply_log has no column for them and
          // this needs no migration.
          errorMsg = [outcome.escalate ?? "No reply generated.", (outcome.withheld ?? []).join("; ")]
            .filter(Boolean)
            .join(" ");
        }
      } catch (err: any) {
        success = false;
        errorMsg = err.message;
      }
      await supabase.from("auto_reply_log").insert({
        dealership_id: dealership.id, channel: "comment", source_id: commentId,
        incoming_text: text, reply_text: replyText, success, error: errorMsg,
      });
      handledSomething = true;
    }
  }

  // MATCHED, ENABLED, AND STILL NOTHING TO DO is a real and common
  // outcome — a feed change that was not a comment, an echo of the
  // business's own message, a delivery receipt. Recorded separately
  // from the gates above so that "the plumbing works, this particular
  // payload just had nothing in it" is distinguishable from a fault.
  await recordDelivery(supabase, {
    source, entryId, dealershipId: dealership.id,
    outcome: handledSomething ? "handled" : "nothing_to_reply_to",
    detail: textlessShapes.length || contextShapes.length
      ? [
          textlessShapes.length ? `a DM with no text: ${textlessShapes.join(" | ")}` : "",
          contextShapes.length ? `a DM with text and context: ${contextShapes.join(" | ")}` : "",
        ].filter(Boolean).join(" || ")
      : handledSomething
        ? null
        : "matched and enabled, but the entry carried no customer message or comment to answer",
  });
}
