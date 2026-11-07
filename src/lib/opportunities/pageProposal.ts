// A page the business does not have, for a search people really made.
//
// G3 of docs/AUDIT-GROWTH-LOOP.md — the one hop the founder's vision
// asks for that genuinely did not exist. Everything on either side of it
// was already built: `marketOpportunities.ts` finds the gap from
// Google's own impressions, `POST /api/website-builder/pages` creates a
// page, the claims guard checks copy, and the approval registry asks the
// owner. What was missing was the sentence between them — "so a page
// should exist, and here is what it has to say".
//
// WHAT A PROPOSAL IS ALLOWED TO CONTAIN, and this is the whole design:
//
//   - THE QUERY, as the customer typed it. Not a keyword a model
//     invented one was "probably" being searched for. The audit's own
//     finding was that several things in this product carry the right
//     name and are advice rather than measurement; a proposal built from
//     invented keywords would be the fourth.
//   - THE IMPRESSIONS, counted, from Google.
//   - WHICH RECORDED FACTS BELONG ON IT, by title, from what the owner
//     has actually written down.
//   - WHICH ANSWERS ARE MISSING, named. This is the part that makes the
//     proposal honest: a buying page needs a price, a delivery time and
//     a reason to choose this business, and if the owner has not
//     answered those the proposal says so instead of the page being
//     written around the hole.
//
// WHAT IT MAY NEVER CONTAIN: a selling point, a claim, a statistic or a
// benefit. Not one word of customer-facing copy is written here. The
// page is created EMPTY and unpublished (G3a, migration 223), and the
// words come from the owner or from the generators that already run
// through the claims guard.
//
// CLAUDE.md RULE 3: not a word below names a trade, a product or a
// category. The title comes from the customer's own search, which is
// the only industry-neutral source of a page title there is.
//
// Pure: no I/O, no model, no React.

import { INTERVIEW_QUESTIONS, questionByKey } from "@/lib/onboarding/interview";

/** One search, as Google reported it. */
export type GapQuery = { query: string; impressions: number; clicks: number; position: number };

export type PageProposal = {
  /** The search this page would answer, as it was typed. */
  query: string;
  /** Counted, from Google. */
  impressions: number;
  /** What the page would be called. The customer's own words, tidied. */
  title: string;
  /** Where it would live. */
  slug: string;
  /** Every search this one page would answer, counted. */
  answers: GapQuery[];
  /** Recorded notes that belong on it, by title. */
  haveOnRecord: string[];
  /** Interview questions a buying page needs and nobody has answered. */
  missing: string[];
};

/**
 * Impressions a search needs before it is worth a page of its own.
 *
 * Writing a page is the owner's afternoon. Twenty-odd impressions in
 * four weeks is a curiosity; this is the point at which the demand is
 * worth the work, and it is the same number
 * `marketOpportunities.STRONG_DEMAND` uses for the same judgement.
 */
export const PAGE_WORTH_IT = 50;

/**
 * The questions a page meant to win a buying search has to answer.
 *
 * REGISTRY KEYS, not prose: these are questions the interview already
 * asks (lib/onboarding/interview.ts), so a proposal naming one as
 * missing is naming something the owner can actually go and answer. A
 * test asserts every key here is a real question.
 */
export const BUYING_PAGE_NEEDS = ["price_range", "delivery_time", "why_not_cheaper", "enquiry_response"];

// MOVED TO lib/seo/queryClusters.ts (G2, 7 November 2026), and
// re-exported here so this file stays the one place a proposal is read
// from. There is one answer to "what does this search say it is about",
// and two copies of it would have been the fourth duplicated definition
// this week — after TEXT_PROPS, the nine promises and the 200.
export { contentWords } from "@/lib/seo/queryClusters";
import { contentWords } from "@/lib/seo/queryClusters";

/**
 * A page title, from the search itself.
 *
 * THE CUSTOMER'S OWN WORDS, tidied — the only source of a page title
 * that cannot smuggle one trade's vocabulary in (rule 3). A search is
 * typed in lower case with no punctuation, so it is capitalised as a
 * sentence rather than word-by-word: "Soy candles in Shahjahanpur", not
 * "Soy Candles In Shahjahanpur", which reads like a headline nobody
 * wrote.
 */
export function titleFromQuery(query: string): string {
  const tidy = String(query ?? "").replace(/\s+/g, " ").trim();
  if (!tidy) return "";
  return tidy.charAt(0).toUpperCase() + tidy.slice(1);
}

/**
 * A URL for it, derived and never longer than a URL should be.
 *
 * Returns "" for a search with nothing in it that can be a slug, so a
 * caller cannot end up proposing a page at an empty path.
 */
export function slugFromQuery(query: string): string {
  // NO CONTENT WORDS, NO SLUG — and no fallback to the raw search.
  //
  // FOUND BY A TEST. The first version fell back to the whole search
  // when there was nothing meaningful in it, which turned "the best near
  // me" into a page at /the-best-near-me: a slug manufactured entirely
  // out of filler, for a search that does not say what it is about.
  // A search with no subject cannot name a page, and "" is what makes
  // proposalFor refuse it.
  const words = contentWords(query);
  const slug = words
    .join("-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
  return slug;
}

/** Whether these two searches are asking about the same thing. */
export function sameSubject(a: string, b: string): boolean {
  const left = contentWords(a);
  const right = contentWords(b);
  if (left.length === 0 || right.length === 0) return false;
  // ONE IS CONTAINED IN THE OTHER. Deliberately strict: "soy candles"
  // and "soy candle gift box" are the same subject, while "soy candles"
  // and "scented oils" are not, and nothing here guesses at a middle
  // case. Real grouping of searches is G2's job and it is not pretended
  // at here.
  const small = left.length <= right.length ? left : right;
  const large = left.length <= right.length ? right : left;
  return small.every((w) => large.includes(w));
}

/**
 * The proposal for one gap, or null when there is not enough to propose.
 *
 * NULL RATHER THAN A WEAK PROPOSAL. A page the owner is asked to write
 * is an afternoon of their time; below the threshold, or without a
 * usable title, the honest answer is to say nothing.
 */
export function proposalFor(
  gap: GapQuery,
  context: {
    /** Every gap in the same run, so one page can answer several searches. */
    allGaps?: GapQuery[];
    /** Page slugs the site already has, so an existing page is not proposed again. */
    existingSlugs?: string[];
    /** The owner's recorded notes: title and content. */
    recorded?: { title: string; content: string }[];
    /** Interview questions already answered. */
    answered?: string[];
  } = {}
): PageProposal | null {
  const impressions = Number(gap?.impressions ?? 0);
  if (!Number.isFinite(impressions) || impressions < PAGE_WORTH_IT) return null;

  const title = titleFromQuery(gap?.query ?? "");
  const slug = slugFromQuery(gap?.query ?? "");
  if (!title || !slug) return null;
  // A PAGE THAT ALREADY EXISTS IS NOT A GAP. Proposing one the owner
  // already wrote is the `no_faq` mistake again: a finding that fires
  // against work already done teaches them to ignore findings.
  if ((context.existingSlugs ?? []).includes(slug)) return null;

  const answers = [gap, ...(context.allGaps ?? []).filter((g) => g.query !== gap.query && sameSubject(gap.query, g.query))];

  const words = contentWords(gap.query);
  const haveOnRecord = (context.recorded ?? [])
    .filter((note) => {
      const text = `${note.title} ${note.content}`.toLowerCase();
      return words.some((w) => text.includes(w));
    })
    .map((note) => note.title);

  const answered = new Set(context.answered ?? []);
  const missing = BUYING_PAGE_NEEDS.filter((key) => !answered.has(key) && questionByKey(key));

  return { query: gap.query, impressions, title, slug, answers, haveOnRecord, missing };
}

/**
 * What the owner reads on the card.
 *
 * EVERY NUMBER IN IT IS GOOGLE'S, and every fact in it is the owner's.
 * The sentence about what is missing is the one that keeps this honest:
 * it says the page cannot be finished yet rather than letting it be
 * written around the hole.
 */
export function proposalConfirm(proposal: PageProposal): string {
  const searches =
    proposal.answers.length > 1
      ? `${proposal.answers.length} searches, together ${proposal.answers.reduce((n, a) => n + a.impressions, 0)} times in 28 days`
      : `${proposal.impressions} times in 28 days`;

  const lines = [
    `People searched "${proposal.query}" ${searches} and you have no page for it.`,
    `I'll create "${proposal.title}" as a draft at /${proposal.slug} — nobody can reach it and it won't be in your sitemap until you publish it.`,
  ];

  if (proposal.haveOnRecord.length) {
    lines.push(`What you've already written down that belongs on it: ${proposal.haveOnRecord.slice(0, 4).join(", ")}.`);
  }

  if (proposal.missing.length) {
    const names = proposal.missing
      .map((key) => questionByKey(key)?.writesTo)
      .map((dest) => (dest && "title" in dest ? dest.title : null))
      .filter(Boolean) as string[];
    lines.push(
      `I don't have your ${names.join(", ")} yet, so I can't write the page for you — it will be empty until you tell me those or write it yourself.`
    );
  } else {
    lines.push("I won't write the words: the page starts empty and the copy goes through the usual check.");
  }

  return lines.join(" ");
}

/** Every registry key this file names, for a test to check them all. */
export const NAMED_QUESTION_KEYS = BUYING_PAGE_NEEDS.filter((key) => INTERVIEW_QUESTIONS.some((q) => q.key === key));
