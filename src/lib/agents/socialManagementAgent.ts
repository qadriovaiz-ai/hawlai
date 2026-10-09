// Social Media Management Agent — covers the tasks not already
// handled by the existing Social Media page (captions, posting,
// scheduling, influencer outreach) or /dashboard/insights (analytics/
// engagement numbers): reply suggestions, DM automation templates,
// comment replies, community management guidelines, growth strategy,
// and viral trend detection (uses Claude's web_search tool so trends
// are actually current instead of guessed from training data).

import { webSearchTool } from "@/lib/ai/searchCaps";
import { formatDuration } from "../catalog/catalogItem";
import { getModel } from "../models";
import { modelForTask } from "../aiTaskRouter";
import { callClaude, withAiFailure, aiFailureMessage, type AiFailureNote } from "@/lib/ai/claude";
import { soundRule, normaliseLanguage } from "@/lib/content/language";

import { SOCIAL_TASKS, type SocialTaskMeta } from "@/lib/departments/social";
import { parseModelJson } from "@/lib/ai/modelJson";
import { guardOrMark, truthBlock } from "@/lib/claims/factsGate";
import { guardGenerated } from "@/lib/claims/claimCheck";
import { splitStories } from "@/lib/claims/personalStories";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

// Re-exported so every existing server import keeps working; the data
// itself lives in lib/departments so client pickers can read it without
// pulling this agent into their bundle.
export { SOCIAL_TASKS };
export type { SocialTaskMeta };


// Single-reply generator for the REAL auto-reply pipeline (webhook ->
// generate -> send, no human review). Deliberately separate from
// generateSocialTask's reply_suggestions (which gives 3 variants for
// a human to pick from) — auto-send needs exactly one confident,
// safe reply, and a tighter prompt that explicitly avoids committing
// to anything risky (prices, promises, complaint resolutions) since
// nobody reviews this before it goes out.
/**
 * What came back, and when nothing did, why.
 *
 * Was `string | null`, and null meant five different things: the model
 * failed, the reply was unreadable, the guard emptied it, the records
 * were unreadable, or there was simply nothing to say. The handler
 * logged "No reply generated" for all of them, so the owner could not
 * tell a quiet failure from a deliberate withholding.
 */
export type AutoReplyResult =
  | { reply: string; withheld?: never; escalate?: never }
  | {
      reply: null;
      /** What was taken out, when the guard took something out. */
      withheld?: string[];
      /** The sentence the owner reads in the log. */
      escalate: string;
    };

export async function generateAutoReply(
  channel: "dm" | "comment",
  incomingText: string,
  dealershipName: string,
  businessCategory: string,
  brandProfile?: BrandProfile | null,
  productCatalog?: { name: string; price: number; description?: string | null; inventoryCount?: number | null; kind?: "service"; durationMinutes?: number | null; bookingLink?: string | null }[],
  // P3 20a — sourced from the shared getBusinessContext() assembler;
  // this surface had zero access to real business_knowledge before,
  // useful for questions ("are you open Sundays") the catalog alone
  // can't answer.
  knowledgeFacts?: { category: string; title: string; content: string }[] | null,
  // P3 (Personalization) — this specific sender's own history
  // (getLeadMemory, P1 4a), only ever present once resolveDmLead has
  // linked this conversation to a real lead.
  pastInsights?: string[] | null,
  // P3 piece 5 — the assigned persona's goals, shaping what this
  // reply is trying to achieve (support vs. sales vs. front-desk).
  personaGoals?: string | null,
  /**
   * So the call is logged. This fires on every inbound DM and comment
   * with nobody reviewing it, and until 2026-09-27 it was the highest-
   * frequency Claude call in the product that recorded nothing at all.
   */
  logContext?: { supabase: any; dealershipId: string },
  /**
   * The canonical facts (src/lib/claims).
   *
   * F-U1 / G-5 (audit, 8 Oct 2026). This is the highest-frequency
   * customer-facing model call in the product and it had none of the
   * layer every other surface has: no verified facts, no truth rules,
   * no claims guard, and the owner's knowledge rows passed through raw
   * so a customer's private story could be repeated to a stranger. It
   * had a hand-rolled catalogue string instead, which is how it could
   * quote a real price while inventing a discount beside it.
   *
   * Null here means the records could not be read, and this path FAILS
   * CLOSED: no reply at all. Nothing else sends without review.
   */
  facts?: BusinessFacts | null
): Promise<AutoReplyResult> {
  // An auto-reply is sent to a customer with nobody reading it first —
  // if any copy follows the owner's chosen language, this does.
  const brandContext = [
    brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "Keep it warm and natural.",
    soundRule(normaliseLanguage(brandProfile?.preferred_language), brandProfile?.tone_of_voice),
  ].join("\n");

  // Real catalog, when available — this is what turns "I'll get back
  // to you" into an actual instant answer for the very common "how
  // much is this / is this available" DM, without ever inventing a
  // price for something not genuinely in the catalog.
  const catalogContext = productCatalog && productCatalog.length > 0
    ? `\nReal current catalogue (use this for any question about a specific product or service — price, availability, booking):\n${productCatalog.map((p) => `- ${p.name}: ₹${p.price}${p.kind === "service" ? ` (a SERVICE — booked, not bought or shipped${p.durationMinutes ? `, ${formatDuration(p.durationMinutes)}` : ""}; ${p.bookingLink ? `book at ${p.bookingLink}` : "no booking link — offer to help them book in this conversation"})` : p.inventoryCount !== undefined && p.inventoryCount !== null ? (p.inventoryCount > 0 ? ` (in stock)` : ` (out of stock)`) : ""}${p.description ? ` — ${p.description.slice(0, 80)}` : ""}`).join("\n")}`
    : "";

  // A CUSTOMER'S PRIVATE SITUATION IS NOT AN AUTO-REPLY.
  //
  // Every knowledge row went into this prompt in full, and this prompt
  // answers strangers in public comment threads. One of those rows is a
  // real customer writing that her husband had been in an accident and
  // she lit a candle through the waiting at the hospital. The owner
  // wrote it down because it moved her; it is not hers to repeat to
  // someone asking about delivery.
  //
  // The same gate formatFactsForCopy and the website widget already
  // apply (src/lib/claims/personalStories.ts).
  const { usable: usableKnowledge } = splitStories((knowledgeFacts ?? []) as any);
  const knowledgeContext = usableKnowledge.length > 0
    ? `\nReal facts about this business you can state with confidence (only these — don't extend or guess beyond them):\n${usableKnowledge.map((f: any) => `- ${f.title}: ${f.content}`).join("\n")}`
    : "";

  // Comments are public and effectively anonymous per-thread — past
  // insights only apply to DMs, where a real sender identity exists.
  const insightsContext = channel === "dm" && pastInsights && pastInsights.length > 0
    ? `\nWhat's happened with this person before, from past interactions (reference this naturally if relevant, don't repeat something they already said no to):\n${pastInsights.map((i) => `- ${i}`).join("\n")}`
    : "";

  // P3 piece 5 — what this reply is trying to achieve, per the
  // persona the owner assigned to this channel. Advisory framing on
  // top of the hard safety rules below, never a replacement for them.
  const personaContext = personaGoals?.trim()
    ? `\nWhat you're here to do, in priority order:\n${personaGoals.trim()}`
    : "";

  const safety = channel === "comment"
    ? "This reply is PUBLIC on a comment thread — keep it brief, warm, and generic. Never share prices, personal details, or specific commitments publicly, even if the catalog above has the answer; if the comment needs specifics, invite them to DM instead."
    : `This is a private DM auto-reply sent with NO human review before sending. If the question is about a specific product's price/availability AND it's genuinely in the catalog above, answer it directly and confidently — that's a normal, safe question to answer instantly. For anything else (a complaint, a custom request, a product genuinely not in the catalog, or anything you're not confident about), reply with acknowledgement + "our team will get back to you shortly" rather than guessing or promising something specific. Never invent a price or availability for a product not actually listed above.`;

  // FAIL CLOSED, BEFORE THE MODEL CALL.
  //
  // Every other surface degrades when the records cannot be read: the
  // copy comes back marked unverified and a human decides. There is no
  // human here — the reply goes to a customer the moment it exists —
  // so "unverified" has nobody to warn. No reply, and the owner is told
  // in the log that a message is waiting for them.
  if (!facts) {
    return {
      reply: null,
      escalate: "Your store records couldn't be read, so Hawlai didn't auto-reply to this one. Answer it yourself.",
    };
  }

  try {
    const r = await callClaude({
      // Haiku — a safe, single, auto-sent reply is a tightly
      // constrained task (explicitly avoids prices/promises/
      // complaint resolution per the prompt below), and this fires
      // on every incoming DM/comment when the toggle is on. Routed
      // through the AI Task Router (Usage/Pricing spec Section 10)
      // — same Haiku choice, now via the named per-channel mapping.
      model: modelForTask(channel === "dm" ? "dm_auto_reply" : "comment_auto_reply"),
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `You are auto-replying as "${dealershipName}", a ${businessCategory} business in India, to a ${channel === "dm" ? "private DM" : "public comment"}.
${brandContext}${truthBlock(facts, "customer")}${catalogContext}${knowledgeContext}${insightsContext}${personaContext}
${safety}
Incoming message: "${incomingText}"

Return JSON only: {"reply":"the reply text, under 200 characters, no markdown"}`,
      }],
    }, { operation: "auto_reply", logContext });
    // No reply goes out rather than a guessed one.
    if (!r.ok) return { reply: null, escalate: "Hawlai couldn't reach the AI to answer this one. Reply yourself." };
    const text = r.text;
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(text);
    if (!parsedReply.ok) {
      console.error(`[socialManagementAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      return { reply: null, escalate: "The AI's answer couldn't be read, so nothing was sent. Reply yourself." };
    }
    const spoken = String(parsedReply.value?.reply ?? "").trim();
    if (!spoken) {
      return { reply: null, escalate: "The AI returned nothing to send. Reply yourself." };
    }

    // THE GUARD, IN PUBLISH MODE.
    //
    // "publish" and not "draft" for the same reason the website widget
    // uses it: an unverified price flagged for review has nobody to
    // review it. The whole sentence goes rather than reaching the
    // customer with a question mark over it.
    const checked = guardGenerated({ reply: spoken }, facts, "publish");
    const safeReply = String((checked.output as any).reply ?? "").trim();
    if (!safeReply) {
      // The guard emptied it. An auto-reply with its only sentence
      // removed is not a reply.
      return {
        reply: null,
        withheld: checked.removed,
        escalate: `Hawlai had an answer but it claimed something your records don't back, so nothing was sent${checked.removed.length ? ` (${checked.removed[0]})` : ""}. Reply yourself.`,
      };
    }
    if (checked.removed.length) {
      console.error(`[auto-reply] withheld ${checked.removed.length} unsupported claim(s) from a customer reply: ${checked.removed.join("; ")}`);
    }
    return { reply: safeReply };
  } catch (err: any) {
    console.error("[auto-reply] error:", err.message);
    return { reply: null, escalate: "Something went wrong writing the reply, so nothing was sent. Reply yourself." };
  }
}

interface BrandProfile {
  tone_of_voice?: string | null;
  /** The owner's Preferred Ad Language — a setting, obeyed as a rule (lib/content/language.ts). */
  preferred_language?: string | null;
}

/**
 * Which of these tasks a CUSTOMER reads.
 *
 * F-03 (audit, 8 Oct 2026). This agent had no facts parameter at all, no
 * truth rules and no claims guard — while three of its seven tasks
 * produce words that go straight to a customer. A DM reply quoting a
 * price it was never given, or offering a discount that does not exist,
 * had nothing standing in its way.
 *
 * The other four are advice to the OWNER (a growth plan, engagement
 * tips, a community playbook). Running the copy guard over those would
 * strip legitimate guidance — "post three times a week" is not a claim
 * about the business. Same split, same reason, as
 * paidAdsAgent's CUSTOMER_COPY_TASKS.
 */
const CUSTOMER_COPY_TASKS = new Set(["reply_suggestions", "comment_replies", "dm_automation"]);

export async function generateSocialTask(
  taskKey: string,
  dealershipName: string,
  businessCategory: string,
  inputText: string,
  brandProfile?: BrandProfile | null,
  logContext?: { supabase: any; dealershipId: string },
  recentPostsContext?: string | null,
  groundingContext?: string,
  /** Verified business facts (src/lib/claims). Customer-facing tasks are written from them and checked against them. */
  facts?: BusinessFacts | null
): Promise<{ output: any; _fallback?: boolean; _aiFailure?: AiFailureNote; claimsRemoved?: string[] ; _cause?: string; _detail?: string; _malformed?: boolean }> {
  const meta = SOCIAL_TASKS.find((t) => t.key === taskKey);
  if (!meta) return { output: { text: "Unknown task type." }, _fallback: true };

  const fallback = {
    output: { text: aiFailureMessage("bad_request") },
    _fallback: true,
  };

  // Reply suggestions and DM templates are read by customers, so they
  // follow the owner's language setting like any other copy — this
  // generator had no language rule at all.
  const brandContext = [
    brandProfile?.tone_of_voice ? `Brand tone: ${brandProfile.tone_of_voice}.` : "No brand voice set yet — keep it natural, warm, and specific to the business.",
    soundRule(normaliseLanguage(brandProfile?.preferred_language), brandProfile?.tone_of_voice),
  ].join("\n");
  const isTrends = taskKey === "viral_trends";

  try {
    const body: any = {
      model: getModel("standard"),
      max_tokens: isTrends ? 3000 : 1600,
      messages: [{
        role: "user",
        content: `You are a social media manager for an Indian ${businessCategory} business called "${dealershipName}".
${brandContext}${groundingContext ?? ""}${CUSTOMER_COPY_TASKS.has(taskKey) ? truthBlock(facts) : ""}
${recentPostsContext ? `\nActually posted recently (last 10, real — don't repeat these angles/hooks, find fresh ones):\n${recentPostsContext}` : ""}
${meta.needsInput ? `Incoming message to respond to: "${inputText || "(no message provided — write generic examples)"}"` : ""}

Task: ${meta.label}
Requirements: ${meta.instructions}

Return JSON only, no markdown, no preamble. Shape the JSON to match the field names implied above. Be specific to this business — never generic filler.`,
      }],
    };
    if (isTrends) {
      body.tools = [webSearchTool("social_trends")];
    }

    const r = await callClaude(body, { operation: "social_task", logContext });
    if (!r.ok) return withAiFailure(fallback, r.failure);
    // Trend tasks search the web: their replies interleave text blocks with search results.
    const text = (r.data.content ?? [])
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n");
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(text);
    if (!parsedReply.ok) {
      console.error(`[socialManagementAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      // F-22: the fallback used to go back as a plain `_fallback` whose
      // output was a sentence, and the chat then had to notice it was
      // not copy. The parser's own account travels with it now, so the
      // chat can say what actually happened instead of guessing
      // (the system prompt's `_cause` / `_detail` rule).
      return { ...fallback, _cause: parsedReply.cause, _detail: parsedReply.detail, _malformed: true };
    }
    // Advice to the owner is returned as written; words a customer will
    // read are checked against the business's own records first.
    if (!CUSTOMER_COPY_TASKS.has(taskKey)) return { output: parsedReply.value };
    const guarded = guardOrMark(parsedReply.value, facts, "draft");
    return { output: guarded.output, claimsRemoved: guarded.removed };
  } catch (err: any) {
    console.error("[social-management-agent] error:", err.message);
    return fallback;
  }
}
