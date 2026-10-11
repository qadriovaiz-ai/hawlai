// ------------------------------------------------------------------
// Content Agent — Phase 1 expansion
// ------------------------------------------------------------------
// So far Content Agent only wrote ad copy (inside adlaunch/route.ts).
// This adds a second capability: personalized WhatsApp / email
// follow-up messages for a specific lead, using the same Brand
// Profile so tone stays consistent across every piece of copy the
// dealership sends out.
//
// This does NOT send anything — no WhatsApp Business API or email
// service is connected yet. It generates text the sales team can
// review and copy-paste. Actual sending is a separate, later piece
// (the Email & WhatsApp Agent).
// ------------------------------------------------------------------

import { detailsForPrompt, leadInterest } from "../leads/leadProfile";

interface LeadInfo {
  name: string;
  /** What they want. `vehicle` is the pre-187 column, read as a fallback. */
  interest?: string | null;
  vehicle?: string | null;
  details?: Record<string, unknown> | null;
  budget?: number | null;
  lead_temperature?: string | null;
  status?: string | null;
  // P3 — real signals that already existed on the leads row but were
  // never actually read by this generator; personalization before
  // this was brand-voice + {name}/{vehicle}/{temperature} substitution
  // only, identical for every lead regardless of what was actually said.
  qualification_reason?: string | null;
}

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
  preferred_language?: string | null;
}

export interface GeneratedMessage {
  subject?: string;
  message: string;
  /** Set when the AI call failed and `message` is the generic template. */
  aiFailure?: AiFailureNote;
  /** Claims the guard took out of this message. Nothing produced these before Phase 3.5. */
  claimsRemoved?: string[];
  /** False when the message read like a template, or was the wrong shape, and a human should look. */
  publishable?: boolean;
}

import { type AiFailureNote } from "@/lib/ai/claude";
// PHASE 3.5, STEP 2. This message is SENT TO A PERSON and had no check
// on its output at all: the facts went into the prompt and nothing
// looked at what came back. Now it goes through the one door.
import { generateCopy } from "@/lib/content/generateCopy";
import { type BusinessFacts } from "@/lib/claims/businessFacts";

export async function generateFollowUpMessage(
  lead: LeadInfo,
  brandProfile: BrandProfile | null,
  channel: "whatsapp" | "email",
  businessCategory: string = "business",
  logContext?: { supabase: any; dealershipId: string },
  // P3 — this lead's own business_memory history (getLeadMemory,
  // P1 4a) — real cross-interaction memory, not just this one row's
  // flat fields. Was already built and wired into live calls; this is
  // the first async/messaging generator to use it too.
  pastInsights?: string[],
  /**
   * The business's own records.
   *
   * WAS A PRE-BUILT PROMPT STRING (`grounding`), which is why this path
   * had no guard: a string can be put in a prompt but it cannot be
   * checked against. The door needs the records themselves.
   */
  facts?: BusinessFacts | null,
  /** false on the autopilot drafting path: no retries, single shot. */
  revise: boolean = true
): Promise<GeneratedMessage> {
  const brandContext = brandProfile
    ? `Brand tone to match: ${brandProfile.tone_of_voice ?? "friendly and professional"}. Key points to weave in if relevant: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}. Preferred language: ${brandProfile.preferred_language ?? "hinglish"}.`
    : "No brand profile set — default to a warm, professional tone in Hinglish.";

  const channelInstructions =
    channel === "whatsapp"
      ? `Write a short WhatsApp message (2-4 sentences, casual, can use 1 emoji max, no formal greeting like "Dear"). Return JSON only: {"message":"the whatsapp text"}`
      : `Write a short professional email (greeting, 2-3 short paragraphs, sign-off). Return JSON only: {"subject":"email subject line","message":"the full email body"}`;

  const interest = leadInterest(lead);
  const details = detailsForPrompt(lead.details);
  const leadContext = `Lead name: ${lead.name}. ${interest ? `Interested in: ${interest}.` : ""} ${details ? `Other details they gave: ${details}.` : ""} ${lead.budget ? `Budget: ₹${lead.budget}.` : ""} Lead temperature: ${lead.lead_temperature ?? "unknown"}. Current stage: ${lead.status ?? "new"}.${lead.qualification_reason ? ` What we know from the last real conversation: ${lead.qualification_reason}` : ""}${pastInsights && pastInsights.length > 0 ? `\nWhat's happened with this lead before, from past interactions (reference this naturally, don't repeat something they already said no to):\n${pastInsights.map((i) => `- ${i}`).join("\n")}` : ""}`;

  const fallback: GeneratedMessage =
    channel === "whatsapp"
      ? { message: `Hi ${lead.name}, thanks for your interest${interest ? ` in ${interest}` : ""}! Would you like a quick call this week to talk it through?` }
      : {
          subject: `Following up on your enquiry${interest ? ` — ${interest}` : ""}`,
          message: `Hi ${lead.name},\n\nThank you for your interest${interest ? ` in ${interest}` : ""}. We'd love to help you find the right fit — would you be available for a quick call this week?\n\nLooking forward to hearing from you.`,
        };

  try {
    const copy = await generateCopy({
      topic: `follow up with ${lead.name}${interest ? ` about ${interest}` : ""}`,
      businessName: facts?.businessName ?? "this business",
      businessCategory,
      facts,
      // The sales team reads this draft before sending it, so an
      // unverified price is flagged rather than deleted.
      mode: "draft",
      revise,
      language: (brandProfile as any)?.preferred_language ?? facts?.brand?.language ?? null,
      operation: "follow_up_message",
      logContext,
      brief: {
        label: `follow-up ${channel} message to a lead`,
        instructions: `${channelInstructions}
The goal: get them to book an appointment/demo/visit or reply.`,
        brandContext: `You are writing for an Indian ${businessCategory} business's sales team to send to ONE named lead.
${brandContext}`,
        grounding: `
${leadContext}
`,
        shapeHint:
          channel === "whatsapp"
            ? `Return JSON only: {"message":"the whatsapp text"}`
            : `Return JSON only: {"subject":"email subject line","message":"the full email body"}`,
      },
    });
    // The template still goes back — callers that send it decide — but
    // marked, so no one mistakes it for a message written for this lead.
    if (copy._aiFailure) return { ...fallback, aiFailure: copy._aiFailure };
    if (copy._fallback) return fallback;
    return {
      subject: copy.output.subject,
      message: copy.output.message ?? fallback.message,
      // What the guard did travels with the message, so a caller that
      // sends it unattended can refuse. Nothing read these before
      // because nothing produced them.
      claimsRemoved: copy.removed.length ? copy.removed : undefined,
      publishable: copy.publishable,
    };
  } catch (err: any) {
    console.error("[content-agent] generateFollowUpMessage error:", err.message);
    return fallback;
  }
}
