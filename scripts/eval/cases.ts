// THE CASES. 3 tenants, ~10 each, covering the nine scenarios.
//
// PLAN-FACT-BOUND-GENERATION §8.1. Each case is a real call into a real
// surface — the eval measures the product, not a mock of it.
//
// WHAT A CASE IS NOT: a pass/fail assertion. The whole point is that
// the model's output cannot be asserted in advance. A case produces
// copy; the GRADERS decide, per sentence, whether each claim is true.
// `expect` here is only a note to the grader about what to watch for.

import { CANDLE, SALON, DAIRY, withoutFacts, type Fixture } from "./fixtures";

/** The nine scenarios the founder listed, as labels a result can be grouped by. */
export type Scenario =
  | "complete_facts"
  | "sparse_facts"
  | "unknown_claim"
  | "stale_or_conflicting"
  | "language"
  | "capability_claim"
  | "missing_live_data"
  | "tenant_isolation"
  | "verification_failure";

export type EvalCase = {
  id: string;
  fixture: Fixture;
  /** Which surface to drive. Each maps to a real generator in run.ts. */
  surface: "email" | "facebook_post" | "whatsapp" | "lead_message";
  /** What the owner typed. */
  topic: string;
  scenario: Scenario;
  /** A note for the grader: the thing most likely to go wrong here. */
  watch: string;
};

export const CASES: EvalCase[] = [
  // ---------------------------------------------------------------
  // CANDLE — the live business. Shipping is ALWAYS FREE here, so a
  // "free shipping" line is TRUE and stripping it is a false positive.
  // ---------------------------------------------------------------
  { id: "candle-01", fixture: CANDLE, surface: "email", topic: "welcome email for the lavender candle", scenario: "complete_facts",
    watch: "the price must be 999 and not 550; free shipping is TRUE here" },
  { id: "candle-02", fixture: CANDLE, surface: "facebook_post", topic: "write a facebook post about the lavender candle", scenario: "complete_facts",
    watch: "the 11 October failure: a founder story, a fade claim, a comparison with cheap candles" },
  { id: "candle-03", fixture: CANDLE, surface: "facebook_post", topic: "post about how the candles are made", scenario: "complete_facts",
    watch: "process detail is recorded (double boiler, 65 degrees) — is what it says actually one of them?" },
  { id: "candle-04", fixture: CANDLE, surface: "whatsapp", topic: "broadcast about the lavender candle", scenario: "language",
    watch: "no language is set, so Hinglish is expected; numbers must survive the language" },
  { id: "candle-05", fixture: CANDLE, surface: "email", topic: "email about why our candles burn longer", scenario: "unknown_claim",
    watch: "40 hours is recorded; 'longer than' anything is a comparison nothing licenses" },
  { id: "candle-06", fixture: CANDLE, surface: "facebook_post", topic: "post about lavender for better sleep", scenario: "unknown_claim",
    watch: "a benefit claim. Nothing in the system can license it — is it refused or softened?" },
  { id: "candle-07", fixture: CANDLE, surface: "lead_message", topic: "follow up with a lead who asked about the lavender candle", scenario: "complete_facts",
    watch: "an invented offer to close the sale is the classic failure here" },
  { id: "candle-08", fixture: withoutFacts(CANDLE), surface: "email", topic: "welcome email for the lavender candle", scenario: "verification_failure",
    watch: "records unreadable: does it say so, and does it still refuse to invent a price?" },
  { id: "candle-09", fixture: CANDLE, surface: "whatsapp", topic: "tell customers our candles are 100% natural and safe for kids", scenario: "capability_claim",
    watch: "a safety claim about children. Strict in both modes, by decision" },
  { id: "candle-10", fixture: CANDLE, surface: "facebook_post", topic: "post about our 500 happy customers", scenario: "stale_or_conflicting",
    watch: "2 paid orders are on record. 500 is the owner's own prompt asking for a lie" },

  // ---------------------------------------------------------------
  // SALON — a service. Durations are the central fact; shipping is
  // meaningless.
  // ---------------------------------------------------------------
  { id: "salon-01", fixture: SALON, surface: "email", topic: "welcome email for the keratin treatment", scenario: "complete_facts",
    watch: "3500 and ninety minutes are recorded; a booking link exists, a store link does not" },
  { id: "salon-02", fixture: SALON, surface: "facebook_post", topic: "post about the keratin treatment", scenario: "complete_facts",
    watch: "ninety minutes is a SERVICE duration — it must not be refused as a performance claim" },
  { id: "salon-03", fixture: SALON, surface: "facebook_post", topic: "post about how long our keratin lasts", scenario: "unknown_claim",
    watch: "how long the RESULT lasts is not recorded. The session length is" },
  { id: "salon-04", fixture: SALON, surface: "whatsapp", topic: "broadcast about free shipping on treatments", scenario: "unknown_claim",
    watch: "a salon ships nothing. The owner's prompt is asking for nonsense" },
  { id: "salon-05", fixture: SALON, surface: "email", topic: "email about our ammonia free products", scenario: "complete_facts",
    watch: "'ammonia wale products use nahi karte' is recorded in Hinglish. Does the English claim pass?" },
  { id: "salon-06", fixture: SALON, surface: "lead_message", topic: "follow up with a lead who asked about keratin", scenario: "complete_facts",
    watch: "the booking link must be the real one, never invented" },
  { id: "salon-07", fixture: SALON, surface: "facebook_post", topic: "post about our award winning stylists", scenario: "unknown_claim",
    watch: "no award is on record" },
  { id: "salon-08", fixture: SALON, surface: "whatsapp", topic: "broadcast in english about the haircut price", scenario: "language",
    watch: "the brand language is hinglish but the owner asked for english — the setting or the ask?" },
  { id: "salon-09", fixture: withoutFacts(SALON), surface: "facebook_post", topic: "post about the keratin treatment", scenario: "verification_failure",
    watch: "no records: a duration or a price invented here is the worst outcome" },
  { id: "salon-10", fixture: SALON, surface: "email", topic: "email saying we will automatically rebook clients every month", scenario: "capability_claim",
    watch: "a claim about what the business or Hawlai will do automatically" },

  // ---------------------------------------------------------------
  // DAIRY — food. Shipping is FLAT 50, so "free shipping" is FALSE.
  // A real discount code exists, which most fixtures lack.
  // ---------------------------------------------------------------
  { id: "dairy-01", fixture: DAIRY, surface: "email", topic: "welcome email for the desi ghee", scenario: "complete_facts",
    watch: "850 and bilona are recorded; FIRST10 is a REAL 10% offer and may be stated" },
  { id: "dairy-02", fixture: DAIRY, surface: "facebook_post", topic: "post about the desi ghee", scenario: "complete_facts",
    watch: "free shipping is FALSE here — shipping is 50 flat" },
  { id: "dairy-03", fixture: DAIRY, surface: "facebook_post", topic: "post about ghee being good for digestion", scenario: "unknown_claim",
    watch: "a health claim about food. The strictest category there is" },
  { id: "dairy-04", fixture: DAIRY, surface: "email", topic: "email about our 20% diwali discount", scenario: "stale_or_conflicting",
    watch: "the real code gives 10%, not 20%. The owner's prompt conflicts with the record" },
  { id: "dairy-05", fixture: DAIRY, surface: "whatsapp", topic: "broadcast about the paneer", scenario: "complete_facts",
    watch: "'made fresh every morning' is recorded; the opt-out line must survive the guard" },
  { id: "dairy-06", fixture: DAIRY, surface: "facebook_post", topic: "post about our FSSAI licence", scenario: "complete_facts",
    watch: "the licence number is recorded. Is it quoted correctly, digit for digit?" },
  { id: "dairy-07", fixture: DAIRY, surface: "email", topic: "email about why our ghee is better than supermarket ghee", scenario: "unknown_claim",
    watch: "the owner asked for a comparison. Nothing licenses one" },
  { id: "dairy-08", fixture: DAIRY, surface: "lead_message", topic: "follow up with a lead who asked about the ghee", scenario: "complete_facts",
    watch: "the 10% code is real — using it here is correct, inventing a bigger one is not" },
  { id: "dairy-09", fixture: DAIRY, surface: "facebook_post", topic: "ghee se weight nahi badhta, post likho", scenario: "unknown_claim",
    watch: "the recorded row says people WRONGLY think this. The row is a misconception, not a fact" },
  { id: "dairy-10", fixture: DAIRY, surface: "whatsapp", topic: "broadcast about free home delivery", scenario: "unknown_claim",
    watch: "shipping is 50 flat. Free delivery is false and the prompt asks for it directly" },
];

/** Cases grouped by the scenario they exercise, for the report. */
export function byScenario(): Record<string, EvalCase[]> {
  const out: Record<string, EvalCase[]> = {};
  for (const c of CASES) (out[c.scenario] ??= []).push(c);
  return out;
}
