// THE INTERVIEW, AS DATA (I2 of docs/PLAN-AUTO-INTERVIEW.md).
//
// WHAT THIS REPLACES. docs/INTERVIEW-A3-L1.md is a question list a
// person reads out in a meeting. This is the same list as a registry,
// so that Hawlai can ask it itself and nobody has to sit in.
//
// WHY A REGISTRY AND NOT THIRTEEN MORE COMPONENT BRANCHES, which is the
// finding that sized this phase: WelcomeChatCard.tsx asks the ten
// onboarding questions with one `useState`, one handler and one JSX
// branch each — about 145 lines a question. Thirteen more the same way
// is another ~1,900 lines, thirteen more pieces of state, and no way to
// check the question set without rendering it. This is the move
// lib/onboarding/steps.ts already made for the step ORDER, applied to
// the questions.
//
// NOTHING HERE IS CLIENT- OR SERVER-ONLY: pure data and pure functions,
// no I/O, no model, no React. The question set can be asserted without
// rendering anything, and a client component can import it.
//
// CLAUDE.md RULE 3 IS THE HARD CONSTRAINT. Every prompt goes to every
// business of every kind, so not one may name a trade, a product or a
// category — and the subtler half, which tests/multiTenantRender.ts
// records: a question can be category-neutral in its WORDS and still
// assume a physical product nobody ships. "How many days does delivery
// take" is meaningless to a coaching centre. So the questions that
// assume a way of trading are gated on `dealerships.business_models`
// (migration 186), which is the industry-agnostic hook this codebase
// already has.
//
// AND ONE DECISION THE FOUNDER MADE, 7 November, which shapes the
// `needsFalsifiable` flag: an answer that fails the check twice is
// STORED AND MARKED WEAK, never blocked. Refusing the owner's own words
// is worse than recording them with a flag the generators can read, and
// an owner who cannot get past a question abandons the interview —
// which is the expensive failure, because a half-filled record looks
// complete to a generator.

import { BUSINESS_MODELS, type BusinessModel } from "@/lib/business/businessModel";
import { OFFER_PROMISES } from "@/lib/claims/offerPromises";

// THE CATEGORIES MOVED TO lib/knowledge/noteShape.ts (I3, 7 November
// 2026), because the answer validator and the facts layer need the same
// list and the same note length. Re-exported here so this file stays
// the one place a question's destination is read from.
export { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from "@/lib/knowledge/noteShape";
import type { KnowledgeCategory } from "@/lib/knowledge/noteShape";

/**
 * What kind of answer this is, which decides the input and the check.
 *
 * `phone` and `address` are their own kinds rather than `short_text`
 * because each collects a value AND the owner's decision about whether
 * it may be published — see migration 221, where both flags default to
 * false.
 */
export type AnswerKind = "phone" | "address" | "hours" | "places" | "yes_no" | "short_text" | "long_text";

/** Where the answer is written. Nothing else may be written to. */
export type Destination =
  | {
      table: "business_listing_facts";
      column: string;
      /** The column holding the owner's publish decision, where there is one. */
      publishColumn?: string;
    }
  | {
      table: "business_knowledge";
      category: KnowledgeCategory;
      /** The row's title — short, and the same every time so a re-answer updates rather than duplicates. */
      title: string;
    };

/** What the interview knows so far, as far as the question order cares. */
export type InterviewContext = {
  /** From dealerships.business_models. Empty means nobody has said yet. */
  models?: BusinessModel[];
  /** Keys already answered, however weakly. */
  answered?: string[];
};

export type InterviewQuestion = {
  /**
   * Stable forever. It is the "asked once, ever" record's key (the
   * founder's decision of 7 November: Tier 3 asks for a fact once and
   * records that it asked), so renaming one re-asks a question the
   * owner has already answered.
   */
  key: string;
  /** 1 = in onboarding. 2 = the resumable facts interview. */
  tier: 1 | 2;
  /** What the owner is asked. Industry-neutral; a test holds it. */
  prompt: string;
  /** One line of why, where the question earns an explanation. */
  help?: string;
  kind: AnswerKind;
  writesTo: Destination;
  /**
   * Whether this answer has to contain something checkable — a number,
   * a unit, a duration, a material, a place — rather than only
   * adjectives. False for every question whose answer is a value
   * (a phone number is not vague) or a yes/no.
   */
  needsFalsifiable: boolean;
  /** Asked only when the business trades this way. Absent means always. */
  when?: (ctx: InterviewContext) => boolean;
};

const sellsThings = (ctx: InterviewContext) => (ctx.models ?? []).includes("products");
const doesServices = (ctx: InterviewContext) => (ctx.models ?? []).includes("services");

// ---------------------------------------------------------------------
// TIER 1 — in onboarding, four questions, approved 7 November.
//
// Only facts the owner certainly knows at minute one and that need no
// judgment. None of these is gated on how the business trades: every
// business has a phone, hours, a service area and an address.
// ---------------------------------------------------------------------

const TIER_1: InterviewQuestion[] = [
  {
    key: "public_phone",
    tier: 1,
    prompt: "What number should a customer call or message you on?",
    help: "You decide separately whether it appears on your public pages.",
    kind: "phone",
    writesTo: { table: "business_listing_facts", column: "public_phone", publishColumn: "publish_phone" },
    needsFalsifiable: false,
  },
  {
    key: "opening_hours",
    tier: 1,
    prompt: "When are you open? Give the opening and closing time for each day, and mark the days you are closed.",
    help: "Two time ranges on one day is how you say you close for lunch.",
    kind: "hours",
    writesTo: { table: "business_listing_facts", column: "opening_hours" },
    needsFalsifiable: false,
  },
  {
    key: "areas_served",
    tier: 1,
    // THE ONE FIELD MOST LIKELY TO BE ANSWERED TOO GENEROUSLY, and the
    // prompt does the work the validator cannot: once an area is on
    // record it is EVIDENCE, because knownText treats a recorded fact
    // as proof.
    prompt: "Which places have you actually served? List the ones you have really sent to or travelled to — not the ones you could.",
    kind: "places",
    writesTo: { table: "business_listing_facts", column: "areas_served" },
    needsFalsifiable: false,
  },
  {
    key: "street_address",
    tier: 1,
    prompt: "What is your address — and do you want the street address shown publicly, or just your city?",
    help: "Many businesses run from home. Your city is already shown either way.",
    kind: "address",
    writesTo: { table: "business_listing_facts", column: "street_address", publishColumn: "publish_street_address" },
    needsFalsifiable: false,
  },
];

// ---------------------------------------------------------------------
// TIER 2 — the resumable facts interview.
//
// A3's B1–B8 from INTERVIEW-A3-L1.md. These are the answers a page or
// an email is written FROM, so these are the ones that have to contain
// something checkable.
// ---------------------------------------------------------------------

const TIER_2: InterviewQuestion[] = [
  {
    key: "delivery_time",
    tier: 2,
    prompt: "How many days does it usually take to reach a customer after they order? Say the normal case, not the best one — and whether nearby and far away differ.",
    kind: "short_text",
    writesTo: { table: "business_knowledge", category: "policy", title: "Delivery time" },
    needsFalsifiable: true,
    when: sellsThings,
  },
  {
    key: "damaged_in_transit",
    tier: 2,
    prompt: "If something arrives damaged, what do you actually do — replace it, refund it, or neither?",
    kind: "short_text",
    writesTo: { table: "business_knowledge", category: "policy", title: "Damaged on arrival" },
    needsFalsifiable: false,
    when: sellsThings,
  },
  {
    key: "ready_or_made",
    tier: 2,
    prompt: "Do you keep things ready, or make them after an order comes in? If you make them, how long does one take?",
    kind: "short_text",
    writesTo: { table: "business_knowledge", category: "general", title: "Ready or made to order" },
    needsFalsifiable: true,
    when: sellsThings,
  },
  {
    key: "appointment_length",
    tier: 2,
    prompt: "How long does one appointment or session take, and how far ahead do people need to book?",
    kind: "short_text",
    writesTo: { table: "business_knowledge", category: "general", title: "Appointment length and notice" },
    needsFalsifiable: true,
    when: doesServices,
  },
  {
    key: "enquiry_response",
    tier: 2,
    // Asked of everyone: it is the most common pre-purchase question for
    // any small business, and nothing in Hawlai knows the answer, so no
    // surface can say it.
    prompt: "When someone messages you with a question, how long do you usually take to reply?",
    kind: "short_text",
    writesTo: { table: "business_knowledge", category: "general", title: "Reply time" },
    needsFalsifiable: true,
  },
  {
    key: "materials_used",
    tier: 2,
    prompt: "What do you actually use or work with? Name it.",
    kind: "long_text",
    writesTo: { table: "business_knowledge", category: "general", title: "What we use" },
    needsFalsifiable: true,
  },
  {
    key: "materials_avoided",
    tier: 2,
    // Often the stronger answer of the two, and the one a customer is
    // comparing on.
    prompt: "Is there anything you deliberately do NOT use, that someone cheaper would?",
    kind: "long_text",
    writesTo: { table: "business_knowledge", category: "general", title: "What we do not use" },
    needsFalsifiable: true,
  },
  {
    key: "certifications",
    tier: 2,
    // "NONE" IS THE VALUABLE ANSWER HERE. With nothing on record, a
    // generator that wants to sound credible reaches for a plausible
    // certification. With "none" on record, it cannot.
    prompt: "Do you have any certification, licence or lab test? If you have none, say none — that is a useful answer.",
    kind: "short_text",
    writesTo: { table: "business_knowledge", category: "general", title: "Certifications" },
    needsFalsifiable: false,
  },
  {
    key: "returns_policy",
    tier: 2,
    prompt: "Do you take returns? Within how many days, in what condition, and how does the money come back?",
    kind: "long_text",
    writesTo: { table: "business_knowledge", category: "policy", title: "Returns and refunds" },
    needsFalsifiable: true,
  },
  {
    key: "price_range",
    tier: 2,
    prompt: "Do you want a price range shown as an answer on your pages — and if so, what is the cheapest and the dearest thing you offer?",
    help: "Your individual prices are already on record. This is about stating a range.",
    kind: "short_text",
    writesTo: { table: "business_knowledge", category: "pricing_note", title: "Price range" },
    needsFalsifiable: true,
  },
  {
    key: "common_doubt",
    tier: 2,
    prompt: "What does someone who decides NOT to buy usually ask or worry about first?",
    kind: "long_text",
    writesTo: { table: "business_knowledge", category: "faq", title: "The doubt we hear most" },
    needsFalsifiable: false,
  },
  {
    key: "why_not_cheaper",
    tier: 2,
    // THE MOST VALUABLE QUESTION AND THE HARDEST TO ANSWER WELL. "Best
    // quality" is an adjective and will be stripped from any copy; a
    // number, a material or a duration survives. The falsifiability
    // check exists mainly for this question.
    prompt: "Someone can get something similar cheaper. Why should they come to you instead? Give one thing that can be checked — a number, a material, a time — not a word like 'better'.",
    kind: "long_text",
    writesTo: { table: "business_knowledge", category: "faq", title: "Why us and not cheaper" },
    needsFalsifiable: true,
  },
];

/**
 * The nine promises, as nine yes/no questions.
 *
 * DERIVED FROM THE LIST THE CLAIMS REVIEW ALREADY WATCHES
 * (lib/claims/offerPromises.ts), not retyped. Asking about a different
 * nine would be worse than not asking: the interview would collect
 * answers nobody checks, and the review would keep flagging promises
 * nobody was asked about. A tenth promise added there appears here.
 *
 * A "NO" IS AS VALUABLE AS A "YES" and that is the point of asking all
 * nine. An absence on record is a promise the guard can refuse; an
 * absence OF a record is a gap a generator fills.
 */
const PROMISE_QUESTIONS: InterviewQuestion[] = OFFER_PROMISES.map((promise) => ({
  key: `promise_${promise.key}`,
  tier: 2 as const,
  prompt: `Do you offer ${promise.name}?`,
  kind: "yes_no" as const,
  writesTo: {
    table: "business_knowledge" as const,
    category: "policy" as const,
    title: `Do we offer ${promise.name}`,
  },
  needsFalsifiable: false,
}));

/** Every question, in the order they are asked. */
export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [...TIER_1, ...TIER_2, ...PROMISE_QUESTIONS];

/** One question by its key, or null — never a guess. */
export function questionByKey(key: string): InterviewQuestion | null {
  return INTERVIEW_QUESTIONS.find((q) => q.key === key) ?? null;
}

/**
 * The questions this business will actually be asked, in order.
 *
 * A QUESTION GATED ON A WAY OF TRADING IS LEFT OUT, NOT ASKED BLANKLY.
 * A business that sells nothing physical is never asked how long
 * delivery takes — the answer would be meaningless and the asking is
 * what makes a product feel like it was built for somebody else.
 */
export function questionsFor(tier: 1 | 2, ctx: InterviewContext = {}): InterviewQuestion[] {
  return INTERVIEW_QUESTIONS.filter((q) => q.tier === tier && (q.when ? q.when(ctx) : true));
}

/**
 * The next question this business has not answered, or null when done.
 *
 * Tier 1 before tier 2, because tier 1 is in onboarding.
 */
export function nextQuestion(ctx: InterviewContext = {}): InterviewQuestion | null {
  const answered = new Set(ctx.answered ?? []);
  for (const tier of [1, 2] as const) {
    const q = questionsFor(tier, ctx).find((x) => !answered.has(x.key));
    if (q) return q;
  }
  return null;
}

/**
 * How much of one tier is answered.
 *
 * DERIVED, NEVER A LITERAL — the same rule steps.ts states for the step
 * count, and for the same reason: a hardcoded total told every new
 * customer the setup was nearly over four screens before it was.
 *
 * THIS IS THE NUMBER THAT MAKES A HALF-FINISHED INTERVIEW SAFE. A
 * half-filled record looks complete to a generator, because knownText
 * reads what is there and cannot know what the owner never reached.
 * "Four of nine answered" is the fact that stops it reading six rows as
 * the whole truth.
 */
export function progressFor(tier: 1 | 2, ctx: InterviewContext = {}): { answered: number; total: number } {
  const questions = questionsFor(tier, ctx);
  const answered = new Set(ctx.answered ?? []);
  return { answered: questions.filter((q) => answered.has(q.key)).length, total: questions.length };
}

/** Whether every question this business is asked has an answer. */
export function isComplete(tier: 1 | 2, ctx: InterviewContext = {}): boolean {
  const { answered, total } = progressFor(tier, ctx);
  return total > 0 && answered === total;
}

/** Every business model a question is gated on, for a test to check them all. */
export const GATED_ON: readonly BusinessModel[] = BUSINESS_MODELS;
