// Driving the real surfaces, exactly as the product does.
//
// PLAN-FACT-BOUND-GENERATION §8.1. The eval measures the product, so
// each case calls the same function the owner's screen calls, with the
// same mode — not generateCopy directly, which would skip whatever each
// surface does around it (the subject fix, the opt-out line, the link
// rule).
//
// NO logContext IS PASSED. That is the usage-logging argument, and
// passing it would write cost rows into a real database for a test run.
// The harness counts the spend from the API's own usage numbers instead.
//
// NOTHING IS SENT. Each of these returns a draft; none of them has a
// send or a publish inside it.

import type { EvalCase } from "./cases";

export type CaseResult = {
  output: Record<string, unknown>;
  removed: string[];
  /** What the owner would be told, if anything. */
  note: string | null;
  /** True when the model could not be reached, so nothing was written. */
  incomplete?: boolean;
};

export async function runCase(c: EvalCase): Promise<CaseResult> {
  const facts = c.fixture.facts ?? null;
  const name = c.fixture.facts?.businessName ?? c.fixture.label;
  const category = c.fixture.facts?.category ?? "business";

  switch (c.surface) {
    case "email": {
      const { generateEmailContent } = await import("@/lib/agents/emailMarketingAgent");
      const r: any = await generateEmailContent("welcome_email", name, category, c.topic, null, undefined, undefined, facts, "draft");
      return { output: r.output ?? {}, removed: r.claimsRemoved ?? [], note: r.output?._claimsNote ?? null, incomplete: r._incomplete === true };
    }
    case "facebook_post": {
      const { generateContent } = await import("@/lib/agents/contentMarketingAgent");
      const r: any = await generateContent("facebook_post", name, category, c.topic, null, undefined, undefined, facts, "draft", { revise: true });
      return { output: r.output ?? {}, removed: r.claimsRemoved ?? [], note: r.output?._claimsNote ?? null, incomplete: r._incomplete === true };
    }
    case "whatsapp": {
      const { generateWhatsappContent } = await import("@/lib/agents/whatsappMarketingAgent");
      const r: any = await generateWhatsappContent("broadcast", name, category, c.topic, null, undefined, undefined, facts, "draft");
      return { output: r.output ?? {}, removed: r.claimsRemoved ?? [], note: r.output?._claimsNote ?? null, incomplete: r._incomplete === true };
    }
    case "lead_message": {
      const { generateFollowUpMessage } = await import("@/lib/agents/contentAgent");
      const lead = { id: "eval-lead", name: "Ravi", lead_temperature: "warm", status: "new", details: null, budget: null } as any;
      const r: any = await generateFollowUpMessage(lead, null, "whatsapp", category, undefined, undefined, facts);
      return {
        output: { message: r.message, ...(r.subject ? { subject: r.subject } : {}) },
        removed: r.claimsRemoved ?? [],
        note: r.note ?? null,
      };
    }
    default:
      throw new Error(`unknown surface: ${c.surface}`);
  }
}
