// ------------------------------------------------------------------
// AI Sales Agent — upgraded from the original FAQ-only chatbot.
// ------------------------------------------------------------------
// Covers all 7 requested tasks in one conversational turn:
//   1. Talks to website visitors (was already here)
//   2. Answers FAQs (was already here)
//   3. Handles objections (new — explicit prompt instruction)
//   4. Recommends based on what the visitor describes (new — reasons
//      over the dealership's offer/messaging context, doesn't invent
//      a product catalog that doesn't exist)
//   5. Qualifies leads (new — asks naturally for name + phone once
//      genuine interest is shown, doesn't force it upfront)
//   6. Books meetings (new — points to the REAL public booking page
//      already built in CRM Marketing, /book/[slug], rather than
//      faking a booking inside the chat)
//   7. Updates CRM (new — when the visitor volunteers name + phone,
//      the API layer creates/updates a real lead row; this agent only
//      decides WHEN that's appropriate, it never writes to the DB
//      itself)
//
// Also fixes a leftover bug: the previous version hardcoded "cars" in
// its system prompt ("Don't discuss anything unrelated to this
// dealership/cars") — a leftover from the AutoPilot AI era, same
// category as other car-specific text fixed earlier this session.
// Now uses the dealership's actual business_category.
// ------------------------------------------------------------------

import { getModel } from "../models";
import { callClaude } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";
import { truthBlock } from "@/lib/claims/factsGate";
import { stripUnsupported, stripUnverifiable } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { splitStories } from "@/lib/claims/personalStories";

interface DealershipContext {
  dealershipName: string;
  city?: string | null;
  businessCategory?: string | null;
  headline?: string | null;
  offerText?: string | null;
  toneOfVoice?: string | null;
  messagingPillars?: string[] | null;
  // P3 20a — sourced from the shared getBusinessContext() assembler;
  // this surface had zero access to real business_knowledge before.
  knowledgeFacts?: { category: string; title: string; content: string }[] | null;
  // P3 piece 5 — the assigned persona's goals, replacing what used to
  // be a hardcoded sales-shaped goals list.
  personaGoals?: string | null;
  hasBookingLink: boolean;
  /**
   * The canonical facts (src/lib/claims) — products, prices, offers,
   * shipping, links.
   *
   * F-15 (audit, 8 Oct 2026). This surface had the owner's knowledge
   * rows and nothing about what the business SELLS, under a prompt that
   * asked it not to guess. A visitor asking "how much is this?" was
   * answered by a model that had never been told the price. It is also
   * the surface with no human between the model and the reader.
   */
  facts?: BusinessFacts | null;
}

function formatKnowledgeFacts(facts?: DealershipContext["knowledgeFacts"]): string {
  if (!facts || facts.length === 0) return "";
  // A CUSTOMER'S PRIVATE SITUATION IS NOT WEBSITE COPY, and this is the
  // surface where a visitor would read it back.
  //
  // Every row went into this prompt in full. One of them is a real
  // customer writing that her husband had been in an accident and she
  // lit a candle through the waiting at the hospital. The owner wrote it
  // down because it moved her; it is not hers to repeat to strangers.
  // The same gate formatFactsForCopy already applies
  // (src/lib/claims/personalStories.ts).
  const { usable } = splitStories(facts as any);
  if (usable.length === 0) return "";
  return `\nReal facts about this business you can state with confidence (only these — don't extend or guess beyond them):\n${usable
    .map((f: any) => `- ${f.title}: ${f.content}`)
    .join("\n")}`;
}

export interface SalesAgentResult {
  reply: string;
  leadCapture: { name: string; phone: string; email?: string; interest?: string } | null;
  suggestBooking: boolean;
}


export async function runSalesAgentTurn(
  context: DealershipContext,
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
  logContext?: { supabase: any; dealershipId: string }
): Promise<SalesAgentResult> {
  const fallback: SalesAgentResult = {
    reply: "Thanks for your question! Please leave your name and number in the form below and our team will get back to you shortly.",
    leadCapture: null,
    suggestBooking: false,
  };

  const category = context.businessCategory || "business";
  // P3 piece 5 — layered ON TOP of the channel-specific mechanics
  // below (lead capture, booking suggestion), not replacing them:
  // those drive this surface's JSON output fields, so swapping them
  // out for persona goals wholesale would break lead capture.
  const personaBlock = context.personaGoals?.trim()
    ? `\n\nWhat you're here to do, in priority order:\n${context.personaGoals.trim()}`
    : "";
  const contextBlock = `Business: ${context.dealershipName}${context.city ? `, ${context.city}` : ""} (${category}).
${context.headline ? `Tagline: ${context.headline}` : ""}
${context.offerText ? `Current offer: ${context.offerText}` : ""}
${context.toneOfVoice ? `Tone to use: ${context.toneOfVoice}` : "Tone: friendly and helpful"}
${context.messagingPillars?.length ? `Key points: ${context.messagingPillars.join("; ")}` : ""}
${context.hasBookingLink ? "A booking page exists — you may suggest booking a meeting when the visitor seems ready." : "No booking page exists yet — don't offer to book a meeting."}${formatKnowledgeFacts(context.knowledgeFacts)}${truthBlock(context.facts, "customer")}`;

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 500,
      system: `You are an AI assistant on ${context.dealershipName}'s website (a ${category} business). You chat with visitors like a helpful, knowledgeable person would — not a generic FAQ bot.
${contextBlock}${personaBlock}

Your job in this conversation, as relevant to what the visitor says:
- Answer questions honestly using the context above. Prices, stock and what is for sale are in the VERIFIED FACTS — quote them exactly when asked. If something genuinely is not there, say so plainly and don't invent a number.
- Recommend what fits their stated needs, based only on the context you have — don't invent products/features that weren't mentioned.
- Handle objections (price, trust, timing) empathetically and honestly — acknowledge the concern before responding to it, never dismiss it.
- Once the visitor shows genuine interest (not just browsing), naturally ask for their name and phone number so the team can follow up — don't demand this on the first message.
- If a booking page exists and the visitor seems ready to move forward (wants to visit, talk to someone, see it in person), suggest booking a meeting.
- Never claim to be a human. Keep replies short (2-4 sentences) and conversational, not corporate.
- Only discuss things relevant to this business — politely redirect anything unrelated.

Return JSON only, no markdown: {"reply": "your conversational reply", "leadCapture": {"name": "...", "phone": "...", "email": "... or omit", "interest": "one short phrase on what they're interested in"} or null if they haven't given both a name and phone number yet in this conversation, "suggestBooking": true or false}`,
      messages: [
        ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: message },
      ],
    }, { operation: "chatbot", logContext });
    if (!r.ok) return fallback;
    const text = r.text;
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(text);
    if (!parsedReply.ok) {
      console.error(`[chatbotAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      return fallback;
    }
    const parsed = parsedReply.value;
    // WITHHELD, NOT FLAGGED. Everywhere else a claims note goes to the
    // owner, who can act on it. Here the reader is a visitor, so there is
    // nobody to show a warning to: an invented discount has to not reach
    // them. "publish" mode, for the same reason DASH there is no review step
    // after this.
    const spoken = String(parsed.reply ?? "").trim();
    const checked = context.facts
      ? stripUnsupported(spoken, context.facts, "publish")
      : stripUnverifiable(spoken);
    const reply = checked.text.trim();
    if (spoken && checked.removed.length) {
      console.error(`[ai-sales-agent] withheld ${checked.removed.length} unsupported claim(s) from a visitor reply: ${checked.removed.join("; ")}`);
    }
    return {
      // A reply emptied by the check becomes the honest hand-off rather
      // than a blank bubble.
      reply: reply || fallback.reply,
      leadCapture: parsed.leadCapture && parsed.leadCapture.name && parsed.leadCapture.phone ? parsed.leadCapture : null,
      suggestBooking: !!parsed.suggestBooking && context.hasBookingLink,
    };
  } catch (err: any) {
    console.error("[ai-sales-agent] error:", err.message);
    return fallback;
  }
}
