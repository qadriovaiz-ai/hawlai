// ------------------------------------------------------------------
// Customer Retention Agent — Phase 3 basic version
// ------------------------------------------------------------------
// Targets leads already at the "converted" pipeline stage — i.e.
// actual customers — and generates re-engagement content (service
// reminders, referral asks, upsell nudges) rather than the "come buy"
// tone Content Agent uses for fresh leads. Reuses the same
// Brand Profile so tone stays consistent.
// ------------------------------------------------------------------

interface CustomerInfo {
  name: string;
  /** What they bought or signed up for. `vehicle` is the pre-187 column, read as a fallback. */
  interest?: string | null;
  vehicle?: string | null;
}

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
  preferred_language?: string | null;
}

import { leadInterest } from "../leads/leadProfile";
// PHASE 3.5, STEP 2. Sent to an existing customer, and had no check on
// its output at all.
import { generateCopy } from "@/lib/content/generateCopy";
import { type BusinessFacts } from "@/lib/claims/businessFacts";

export async function generateRetentionMessage(
  customer: CustomerInfo,
  brandProfile: BrandProfile | null,
  angle: "service_reminder" | "referral" | "upsell",
  businessCategory: string = "business",
  logContext?: { supabase: any; dealershipId: string },
  // P3 — real cross-interaction memory (getLeadMemory, P1 4a), same
  // addition as contentAgent.ts's generateFollowUpMessage.
  pastInsights?: string[],
  /**
   * The business's own records.
   *
   * WAS A PRE-BUILT PROMPT STRING, which is why this path had no guard:
   * a string can be put in a prompt but it cannot be checked against.
   */
  facts?: BusinessFacts | null,
  revise: boolean = true
): Promise<string> {
  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "friendly and professional"}. Preferred language: ${brandProfile.preferred_language ?? "hinglish"}.`
    : "Default to a warm, professional tone in Hinglish.";

  const angleInstructions: Record<string, string> = {
    service_reminder: "Remind them it may be time for a follow-up service, check-up, or renewal, if relevant to what they bought. Warm, not pushy.",
    referral: "Ask them to refer a friend or family member, mention any referral benefit if relevant to the brand pillars.",
    upsell: "Let them know about upgrade options or add-ons, in a low-pressure way. Only mention an exchange or trade-in offer if the verified facts say the business has one.",
  };

  const bought = leadInterest(customer);
  const fallback = `Hi ${customer.name}, hope all is well${bought ? ` with your ${bought}` : ""}! Just checking in — let us know if there's anything we can help with.`;

  try {
    const copy = await generateCopy({
      topic: `${angle.replace(/_/g, " ")} message for ${customer.name}`,
      businessName: facts?.businessName ?? "this business",
      businessCategory,
      facts,
      // The owner reads this before it goes out.
      mode: "draft",
      revise,
      language: (brandProfile as any)?.preferred_language ?? facts?.brand?.language ?? null,
      operation: "retention_message",
      logContext,
      brief: {
        label: `${angle.replace(/_/g, " ")} message to an existing customer`,
        instructions: `Goal: ${angleInstructions[angle]}
2-4 sentences, casual, max 1 emoji.`,
        brandContext: `You are writing a short WhatsApp-style message for an Indian ${businessCategory} business to send an EXISTING CUSTOMER (already bought from or signed up with this business), not a new lead.
${brandContext}`,
        grounding: `
Customer: ${customer.name}${bought ? `, bought/has: ${bought}` : ""}.${
          pastInsights && pastInsights.length > 0
            ? `
What's happened with this customer before, from past interactions (reference this naturally if relevant, don't repeat something they already said no to):
${pastInsights.map((i) => `- ${i}`).join("\n")}`
            : ""
        }
`,
        shapeHint: `Return JSON only: {"message":"the text"}`,
      },
    });
    if (copy._fallback) return fallback;
    return copy.output.message ?? fallback;
  } catch (err: any) {
    console.error("[retention-agent] generateRetentionMessage error:", err.message);
    return fallback;
  }
}
