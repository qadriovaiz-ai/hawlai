// Which questions get asked that the site does not answer — A6-a.
//
// ──────────────────────────────────────────────────────────────────
// IT WRITES NOTHING, AND THAT IS THE POINT OF SHIPPING IT FIRST.
//
// A6's real risk is the opposite end: deciding a question deserves a
// page, getting it wrong generously, and mass-producing thin pages —
// the most reliable way to damage a small site's search standing, and
// it would be Hawlai doing it unasked. This piece produces a LIST. It
// cannot write a wrong page because it writes no page.
//
// ──────────────────────────────────────────────────────────────────
// THREE SOURCES, AND THEY ARE NOT EQUAL.
//
//   asked         `answer_gaps` (migration 230) — a REAL CUSTOMER
//                 wanted to know something, at the moment they wanted
//                 it, and the records had nothing to tell them. Every
//                 other gap in this product is one the product went
//                 looking for; this is the market naming it. It ranks
//                 first, always.
//   search        `search_queries` — people typed it into Google and
//                 saw this site in the results. Demand, measured.
//   buyer_intent  the four fixed questions `aeoQuestions` derives.
//                 Ours, not the market's, so last.
//
// ──────────────────────────────────────────────────────────────────
// "ALREADY ANSWERED" ERRS TOWARD LISTING, deliberately.
//
// A false "answered" HIDES a real gap and nothing happens. A false
// "not answered" puts a duplicate on a list somebody reads. The second
// is recoverable in a glance, so the test is strict: a question counts
// as answered only when EVERY one of its content words is already on
// the site. That is a high bar, and it is the right way round.
//
// WHAT IS NOT DECIDED HERE: the shape. Whether a question becomes an
// FAQ entry or a paragraph on an existing page is A6-b, and guessing it
// now would be the planner overreaching into the decision this piece
// exists to inform.
// ──────────────────────────────────────────────────────────────────

import { contentWords } from "@/lib/seo/queryClusters";
import { blockText } from "@/lib/seo/metaGaps";
import type { AnswerPlanRow } from "@/lib/seo/answerDraft";

/**
 * Question words the shared stopword list does not carry.
 *
 * ──────────────────────────────────────────────────────────────────
 * `STOPWORDS` IN queryClusters WAS BUILT FOR SEARCH QUERIES, and it
 * shows: it drops "how", "what", "which" and "who", because people
 * type those into Google — and keeps "do", "can", "will", "we" and
 * "they", because people rarely do.
 *
 * A QUESTION IS NOT A SEARCH QUERY. "Do you deliver across the city?"
 * reduced to content words with that list alone keeps "do" — so the
 * strict "every word must be on the site" test failed against a page
 * that literally says "We deliver across the city", and the question
 * would have been listed as unanswered when it was answered.
 *
 * LAYERED HERE RATHER THAN ADDED TO THE SHARED LIST, deliberately:
 * that list also decides how search queries CLUSTER, and widening it
 * would quietly change which queries group together — a change to a
 * different feature, made as a side effect of this one.
 * ──────────────────────────────────────────────────────────────────
 */
const QUESTION_WORDS = new Set([
  "do", "did", "can", "could", "will", "would", "should", "shall", "may",
  "have", "has", "had", "be", "been", "am", "was", "were",
  "i", "we", "us", "they", "them", "there", "this", "that", "these", "those",
  "any", "some", "if", "or", "but", "with", "from", "by", "as", "about",
]);

/** A question's words, with search-query AND question noise removed. */
export function questionWords(question: string): string[] {
  return contentWords(question).filter((w) => !QUESTION_WORDS.has(w));
}

export type AnswerSource = "asked" | "search" | "buyer_intent";

export type Candidate = {
  question: string;
  source: AnswerSource;
  /** Askings for `asked`, impressions for `search`, 0 for ours. */
  demand: number;
  /** Why it is on the list, in the owner's words. */
  why: string;
  /**
   * The interview key, for `asked` candidates only — A6-b/c.
   *
   * ONLY THESE CAN BE ANSWERED. A search term is a phrase somebody
   * typed into Google: there is no interview question behind it and so
   * no stored answer, and pretending otherwise is how a generator
   * would be invited back in.
   */
  key?: string | null;
};

export type PlannerInput = {
  /** From answer_gaps: a question_key and how many customers asked it. */
  asked: { question: string; times: number; key?: string | null }[];
  /** From search_queries. */
  searched: { query: string; impressions: number }[];
  /** The fixed four. */
  buyerIntent: string[];
  /** Every page's block tree, so "already answered" is checkable. */
  pageSections: unknown[];
};

/** Below this, a search query is one person once and not a finding. */
export const MIN_IMPRESSIONS = 5;

/** Longest list worth putting in front of somebody at one time. */
export const MAX_CANDIDATES = 10;

/**
 * Does the site already answer this?
 *
 * EVERY CONTENT WORD, not some. See the header: the strict reading
 * errs toward listing a duplicate rather than hiding a real gap.
 *
 * A QUESTION WITH NO CONTENT WORDS IS NOT ANSWERED. "how much is it"
 * is all stopwords; treating that as answered because nothing had to
 * match would silently drop the commonest question there is.
 */
export function alreadyAnswered(question: string, siteWords: Set<string>): boolean {
  const words = questionWords(question);
  if (!words.length) return false;
  return words.every((w) => siteWords.has(w));
}

/** Every content word on the site, once. */
export function siteVocabulary(pageSections: unknown[]): Set<string> {
  const words = new Set<string>();
  for (const sections of pageSections ?? []) {
    for (const line of blockText(sections)) {
      for (const w of contentWords(line)) words.add(w);
    }
  }
  return words;
}

/**
 * The questions worth answering, best first.
 *
 * ORDER IS SOURCE THEN DEMAND, not demand alone. A question one
 * customer actually asked beats a search term with two hundred
 * impressions, because the first is evidence that somebody wanted an
 * answer and did not get one — and the second may be people who found
 * what they needed.
 *
 * DUPLICATES COLLAPSE TO THE STRONGEST SOURCE. The same question
 * routinely arrives as an `answer_gaps` key AND a search query, and
 * listing it twice would make the list look longer than the problem.
 */
export function planAnswers(input: PlannerInput): Candidate[] {
  const siteWords = siteVocabulary(input.pageSections ?? []);
  const seen = new Set<string>();
  const out: Candidate[] = [];

  const consider = (question: string, source: AnswerSource, demand: number, why: string, interviewKey?: string | null) => {
    const text = String(question ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    // Keyed on the content words, so "do you deliver" and "delivery?"
    // are one question rather than two entries of one problem.
    const key = questionWords(text).join(" ") || text.toLowerCase();
    if (seen.has(key)) return;
    if (alreadyAnswered(text, siteWords)) return;
    seen.add(key);
    out.push({ question: text, source, demand, why, ...(interviewKey ? { key: interviewKey } : {}) });
  };

  for (const row of [...(input.asked ?? [])].sort((a, b) => (b?.times ?? 0) - (a?.times ?? 0))) {
    const times = Number(row?.times ?? 0) || 0;
    consider(
      row?.question,
      "asked",
      times,
      times === 1
        ? "a customer asked this and your records had no answer"
        : `${times} customers asked this and your records had no answer`,
      row?.key ?? null
    );
  }

  for (const row of [...(input.searched ?? [])].sort((a, b) => (b?.impressions ?? 0) - (a?.impressions ?? 0))) {
    const impressions = Number(row?.impressions ?? 0) || 0;
    if (impressions < MIN_IMPRESSIONS) continue;
    consider(row?.query, "search", impressions, `${impressions} searches brought up your site for this`);
  }

  for (const question of input.buyerIntent ?? []) {
    consider(question, "buyer_intent", 0, "a question buyers ask before they choose");
  }

  return out.slice(0, MAX_CANDIDATES);
}

/**
 * The line the owner reads, or nothing.
 *
 * SILENT WHEN THE LIST IS EMPTY, which is the normal state for a
 * business with no Search Console connection and no customer questions
 * on record. "0 questions" every morning is a line the eye learns to
 * skip.
 *
 * IT NAMES THE FIRST ONE. A count on its own — "nine questions your
 * site does not answer" — is a number he cannot act on; the question
 * itself is the thing that tells him whether the list is any good.
 */
export function answerGapLine(
  candidates: Candidate[]
): { text: string; numbers: { label: string; value: number; source: string }[] } | null {
  const list = candidates ?? [];
  if (!list.length) return null;

  const top = list[0];
  const asked = list.filter((c) => c.source === "asked").length;

  // DECLARED, or the daily report's digit walk removes the block and he
  // hears nothing at all about it.
  // THE TOP CANDIDATE'S OWN FIGURE IS DECLARED TOO, and this was a
  // real bug caught by the digit walk in test: `why` carries a number
  // for both non-trivial sources — "2 customers asked this", "90
  // searches brought up your site" — and an undeclared figure costs
  // the WHOLE BLOCK, so he would have heard nothing at all on the
  // mornings the first question came from search.
  const numbers = [
    { label: "Questions your site does not answer", value: list.length, source: "answer_planner" },
    ...(asked ? [{ label: "Of those, asked by a customer", value: asked, source: "answer_gaps" }] : []),
    ...(top.demand
      ? [
          {
            label: top.source === "asked" ? "Customers who asked the first one" : "Searches for the first one",
            value: top.demand,
            source: top.source === "asked" ? "answer_gaps" : "search_queries",
          },
        ]
      : []),
  ];

  const head =
    list.length === 1
      ? "1 question gets asked that your site does not answer"
      : `${list.length} questions get asked that your site does not answer`;
  const fromCustomers = asked
    ? asked === list.length
      ? " — every one of them by a customer"
      : ` — ${asked} of them by a customer`
    : "";

  return {
    text: `${head}${fromCustomers}. The first is "${top.question}", because ${top.why}. Nothing has been written — these are for you to decide on.`,
    numbers,
  };
}

/**
 * Read the three sources and plan, for one business.
 *
 * HERE RATHER THAN IN dailyGrowth, because that file already carries
 * three inline reads and a fourth would bury the report-building it
 * exists for. It returns the line and the candidates: the line is how
 * he finds out, the candidates are what the caller files as a signal.
 *
 * THE QUESTION TEXT IS THE REGISTERED PROMPT, not the customer's
 * words — and that is `answer_gaps`'s own design, not a shortcut. It
 * stores WHICH question the records failed to answer and deliberately
 * not the visitor's sentence, because a visitor's wording routinely
 * carries their name, their number or their situation. So the subject
 * is known and the phrasing is not, and the registered question is the
 * honest stand-in.
 *
 * NEVER THROWS. A business with no Search Console connection and no
 * customer questions on record is the normal case, and it returns an
 * empty list rather than costing the caller anything.
 */
export async function gatherAnswerGaps(
  supabase: any,
  dealershipId: string
): Promise<{
  candidates: Candidate[];
  drafted: AnswerPlanRow[];
  line: ReturnType<typeof answerGapLine>;
  answers: { text: string; numbers: { label: string; value: number; source: string }[] } | null;
}> {
  const empty = { candidates: [] as Candidate[], drafted: [] as AnswerPlanRow[], line: null, answers: null };
  try {
    // SEARCH QUERIES COME THROUGH `topQueries` AND NOWHERE ELSE, and a
    // privacy guard caught the first version of this reading the table
    // directly. That module filters out rows with no `page_filter` —
    // domain-wide leftovers written before scoping existed, which can
    // describe pages that are not this business's. A second door past
    // it would bypass the check silently, which is what
    // tests/searchConsolePrivacy exists to stop.
    const { topQueries } = await import("@/lib/seo/searchQueries");
    const [{ data: gaps }, queries, { data: dealership }] = await Promise.all([
      supabase.from("answer_gaps").select("question_key").eq("dealership_id", dealershipId).limit(500),
      topQueries(supabase, dealershipId, 40),
      supabase.from("dealerships").select("business_category, city").eq("id", dealershipId).maybeSingle(),
    ]);

    const { data: site } = await supabase.from("websites").select("id").eq("dealership_id", dealershipId).limit(1).maybeSingle();
    const { data: pages } = site?.id
      ? await supabase.from("website_pages").select("sections").eq("website_id", site.id)
      : { data: [] };

    // A FAILED PAGE READ IS NOT AN EMPTY SITE. Treating it as one would
    // make every question look unanswered and list all of them.
    if (!Array.isArray(pages)) return empty;

    const times = new Map<string, number>();
    for (const row of gaps ?? []) {
      const key = String((row as any)?.question_key ?? "").trim();
      if (key) times.set(key, (times.get(key) ?? 0) + 1);
    }

    const { questionByKey } = await import("@/lib/onboarding/interview");
    const asked: { question: string; times: number; key: string }[] = [];
    for (const [key, count] of times) {
      // A KEY WITH NO REGISTERED QUESTION IS SKIPPED, not guessed at —
      // the same rule factGaps states: a gap that cannot be turned into
      // a question is a gap nobody can be asked about.
      const registered = questionByKey(key);
      if (registered?.prompt) asked.push({ question: registered.prompt, times: count, key });
    }

    const { aeoQuestionsFor } = await import("@/lib/seo/aeoQuestions");

    const candidates = planAnswers({
      asked,
      searched: (queries ?? []).map((q: any) => ({ query: String(q?.query ?? ""), impressions: Number(q?.impressions ?? 0) || 0 })),
      buyerIntent: aeoQuestionsFor(dealership ?? null, null),
      pageSections: (pages as any[]).map((p) => p?.sections),
    });

    // ── A6-b/c: the answer, where he has already given one ──────────
    //
    // READ ONLY WHEN THERE IS SOMETHING TO ANSWER. A business with no
    // candidates needs neither query, and this runs for every business
    // every morning.
    let drafted: AnswerPlanRow[] = [];
    if (candidates.some((c) => c.key)) {
      const [{ data: knowledge }, { data: listing }] = await Promise.all([
        supabase.from("business_knowledge").select("title, content, is_weak, is_active").eq("dealership_id", dealershipId),
        supabase.from("business_listing_facts").select("*").eq("dealership_id", dealershipId).maybeSingle(),
      ]);
      const { draftAnswers } = await import("@/lib/seo/answerDraft");
      drafted = draftAnswers(candidates, questionByKey, Array.isArray(knowledge) ? knowledge : [], listing ?? null);
    }

    const { draftSummary } = await import("@/lib/seo/answerDraft");
    return { candidates, drafted, line: answerGapLine(candidates), answers: draftSummary(drafted) };
  } catch (err: any) {
    console.error(`[answer-planner] could not plan for ${dealershipId}: ${err?.message ?? err}`);
    return empty;
  }
}
