// What a visit suggests about intent — V3.
//
// V1 recorded WHICH page. V2 grouped pages into a visit. This turns one
// visit into a number the owner can rank by: a visitor who opened two
// product pages, came back to one of them and then opened the contact
// page did more than a visitor who read the home page and left.
//
// ─────────────────────────────────────────────────────────────────────
// THIS IS NOT `predicted_conversion_score`, AND MUST NEVER BE FOLDED
// INTO IT
// ─────────────────────────────────────────────────────────────────────
//
// That column means something else: "Predicted likelihood to convert,
// based on response time, engagement, and call outcomes" — it scores how
// well a LEAD WAS HANDLED, and it is on the leads table where the owner
// may already be reading it. This scores WHAT A VISITOR DID, before
// anyone knows who they are. Writing visitor behaviour into that column
// would silently change a figure already in use, so this score is its
// own number and is never written to a lead row.
//
// ─────────────────────────────────────────────────────────────────────
// FOUR THINGS THIS CANNOT KNOW, STATED HERE RATHER THAN IMPLIED
// ─────────────────────────────────────────────────────────────────────
//
// 1. IT IS NOT A PROBABILITY, AND MUST NOT BE WORDED AS ONE. Nothing
//    here has ever been checked against a sale — no business has traded
//    on Hawlai yet (see candle_by_qaaf, 7 November). The points below
//    are a reasoned ordering, not a measured one: they say "this visit
//    did more than that visit", never "this visitor is 70% likely to
//    buy". Every reason carries the event that earned it, so the owner
//    can disagree with the ordering by reading the evidence.
//
// 2. A PAGE WE CANNOT CLASSIFY EARNS NOTHING, AND SAYS SO. `unknownPages`
//    is reported beside the score, because "we could not tell what these
//    pages are" and "they looked at nothing interesting" produce the
//    same low score and are completely different facts. If storefronts
//    are ever served from the custom domains `websites` can already
//    hold, this count rises visibly instead of the score quietly going
//    wrong.
//
// 3. NO DURATION IS NOT A SHORT DURATION. V2's rule, carried forward: a
//    one-event visit has null `measuredSeconds`, and null earns neither
//    the dwell points nor a penalty.
//
// 4. "WORKS FOR ANONYMOUS VISITORS" MEANS WITHOUT A LEAD, NOT WITHOUT
//    CONSENT. No name, email or lead row is needed — that is the point
//    of scoring behaviour. But a visit cannot be grouped at all without
//    a `visitor_id`, which is withheld until cookies are accepted, so
//    this measures consented visitors exactly as V2's visits do. Those
//    are different limits and reading one as the other overstates the
//    coverage.
//
// WHERE THE SIGNAL COMES FROM, AND WHY IT IS MULTI-TENANT (rule 3). No
// trade word appears below. A page's kind comes from two sources,
// neither of them a guess about vocabulary:
//
//   • THIS APPLICATION'S OWN ROUTE TABLE — /site/<slug>/cart,
//     /site/<slug>/checkout, /site/<slug>/products/<id>, /p/<slug>.
//     These are files in src/app, identical for every business.
//   • THE BUSINESS'S OWN DECLARATION — `website_pages.page_type`, which
//     the builder sets per page. One business calls its catalogue
//     "menu", another "listings"; both declare the type `products`. We
//     read the declaration, never the slug.
//
// Matching path words like "/pricing" would have been the industry
// guess: an English-only assumption about URLs that no business here
// agreed to.
//
// Pure: no I/O in the scoring. `readPageKinds` does the reading.

import type { Counted } from "@/lib/growth/audit";
import type { Visit } from "@/lib/growth/visits";

/**
 * What kind of page a visitor was on.
 *
 * The first eight are `website_pages.page_type`'s own values — the
 * business's declaration, not our vocabulary. The next three are this
 * application's own routes. `unknown` is an admission, and is why
 * `custom` is kept distinct from it: `custom` is a page the business
 * declared and we chose not to score, `unknown` is a page we could not
 * place at all.
 */
export type PageKind =
  | "home"
  | "about"
  | "services"
  | "products"
  | "team"
  | "contact"
  | "faq"
  | "custom"
  | "product_detail"
  | "cart"
  | "checkout"
  | "landing"
  | "unknown";

/**
 * What each kind of page is worth.
 *
 * ONE DECLARED TABLE, NOT LITERALS IN A LOOP. Every number the owner can
 * see traces back to a row here, so the ordering can be argued with in
 * one place — the same reason VISIT_GAP_MINUTES is a constant.
 *
 * The reasoning, which is a judgement and not a measurement: reaching
 * checkout is the strongest thing a visitor can do without buying;
 * asking how to get in touch is the strongest thing a visitor can do on
 * a site that sells nothing online. A home page earns nothing because
 * nearly every visitor sees it, so it separates no one from anyone.
 */
export const KIND_POINTS: Record<PageKind, number> = {
  // AT LEAST HIGH_BAND, AND THAT IS AN INVARIANT, not a taste. The
  // strongest single thing a visitor can do must reach the top band on
  // its own: scored at 40 against a band of 50, a week in which someone
  // reached checkout reported "0 visits ranked high", which is true and
  // useless. A test pins it.
  checkout: 50,
  cart: 25,
  contact: 20,
  product_detail: 15,
  products: 10,
  services: 10,
  about: 5,
  faq: 5,
  home: 0,
  team: 0,
  custom: 0,
  landing: 0,
  unknown: 0,
};

/** Coming back to one page inside a single sitting. */
export const REPEAT_POINTS = 10;
/** Each distinct page after the first, up to the cap. */
export const DEPTH_POINTS = 5;
export const DEPTH_CAP = 15;
/** A visit measurably longer than this earns the dwell points. */
export const DWELL_SECONDS = 120;
export const DWELL_POINTS = 10;

/** The most a visit can score, so the number reads on a fixed scale. */
export const MAX_SCORE = 100;

/**
 * Where the bands fall.
 *
 * A CONVENTION, like the thirty-minute gap. Three words are easier to
 * act on than a number, and a band that moved with the data would make
 * two reports incomparable.
 */
export const HIGH_BAND = 50;
export const MEDIUM_BAND = 20;

export type IntentBand = "low" | "medium" | "high";

/** One thing the visitor did, what it was worth, and the proof. */
export type IntentReason = { why: string; points: number; evidence: string };

export type VisitIntent = {
  visitorId: string;
  startedAt: string;
  score: number;
  band: IntentBand;
  /** In the order earned, highest first. A zero-point reason may appear: see unknownPages. */
  reasons: IntentReason[];
  /** Distinct pages in this visit that could not be classified at all. */
  unknownPages: number;
};

const SITE = "/site/";
const LANDING = "/p/";

/**
 * Which kind of page a path is, given what the business declared.
 *
 * `declared` maps a page slug to its `page_type`. A slug that is not in
 * the map returns `unknown` rather than `custom` — a page we have never
 * heard of is not a page the business classified as custom.
 */
export function pageKind(
  path: string | null | undefined,
  declared: Record<string, string> | null | undefined
): PageKind {
  const raw = String(path ?? "").trim();
  if (!raw.startsWith("/")) return "unknown";
  // V1 already stripped the query and the fragment; a trailing slash is
  // still the same page and arrives either way.
  const clean = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;

  if (clean.startsWith(LANDING)) {
    return clean.slice(LANDING.length).includes("/") ? "unknown" : "landing";
  }
  if (!clean.startsWith(SITE)) return "unknown";

  const rest = clean.slice(SITE.length).split("/");
  const after = rest.slice(1).filter((s) => s !== "");
  if (!rest[0]) return "unknown";
  if (after.length === 0) return "home";

  // THIS APPLICATION'S OWN ROUTES, which Next.js matches ahead of the
  // [page] catch-all, so a business page cannot occupy these names.
  if (after.length === 1 && after[0] === "cart") return "cart";
  if (after.length === 1 && after[0] === "checkout") return "checkout";
  if (after.length === 2 && after[0] === "products") return "product_detail";
  if (after.length !== 1) return "unknown";

  // THE BUSINESS'S OWN DECLARATION. Only a value page_type actually has
  // is accepted; anything else in the column is not silently trusted.
  const declaredType = String((declared ?? {})[after[0]] ?? "").trim();
  return isPageKind(declaredType) ? (declaredType as PageKind) : "unknown";
}

const DECLARABLE: PageKind[] = ["home", "about", "services", "products", "team", "contact", "faq", "custom"];

function isPageKind(value: string): boolean {
  return (DECLARABLE as string[]).includes(value);
}

export function bandOf(score: number): IntentBand {
  if (score >= HIGH_BAND) return "high";
  if (score >= MEDIUM_BAND) return "medium";
  return "low";
}

/**
 * Score one visit.
 *
 * A KIND SCORES ONCE PER VISIT, however many times its page was seen —
 * V2's `pages` is distinct, so a visitor reloading a product page six
 * times does not out-score one who opened six different ones. Coming
 * back to a page is scored separately, and once.
 */
export function scoreVisit(visit: Visit, declared: Record<string, string> | null | undefined): VisitIntent {
  const reasons: IntentReason[] = [];
  let unknownPages = 0;
  const scoredKinds = new Set<PageKind>();

  for (const path of visit.pages) {
    const kind = pageKind(path, declared);
    if (kind === "unknown") {
      unknownPages += 1;
      continue;
    }
    if (scoredKinds.has(kind)) continue;
    scoredKinds.add(kind);
    const points = KIND_POINTS[kind];
    if (points > 0) reasons.push({ why: `opened a ${kind.replace(/_/g, " ")} page`, points, evidence: path });
  }

  if (visit.mostSeenPageCount > 1) {
    reasons.push({
      why: "came back to the same page in one sitting",
      points: REPEAT_POINTS,
      evidence: `one page seen ${visit.mostSeenPageCount} times`,
    });
  }

  const extraPages = Math.max(0, visit.pages.length - 1);
  if (extraPages > 0) {
    reasons.push({
      why: "looked at more than one page",
      points: Math.min(DEPTH_CAP, extraPages * DEPTH_POINTS),
      evidence: `${visit.pages.length} pages`,
    });
  }

  // NULL EARNS NOTHING AND COSTS NOTHING. A one-event visit cannot be
  // timed at all; treating that as a short visit would be a claim.
  if (visit.measuredSeconds !== null && visit.measuredSeconds >= DWELL_SECONDS) {
    reasons.push({
      why: "stayed a while",
      points: DWELL_POINTS,
      evidence: `at least ${visit.measuredSeconds} seconds`,
    });
  }

  if (unknownPages > 0) {
    // ZERO POINTS, BUT IT APPEARS. A low score with unclassified pages
    // means "we could not tell", which is not what a low score says on
    // its own.
    reasons.push({
      why: "pages we could not identify, which scored nothing",
      points: 0,
      evidence: `${unknownPages} of ${visit.pages.length} pages`,
    });
  }

  const score = Math.min(MAX_SCORE, reasons.reduce((n, r) => n + r.points, 0));

  return {
    visitorId: visit.visitorId,
    startedAt: visit.startedAt,
    score,
    band: bandOf(score),
    reasons: reasons.sort((a, b) => b.points - a.points),
    unknownPages,
  };
}

export type IntentSummary = {
  scored: number;
  high: number;
  medium: number;
  /** Visits where at least one page could not be classified. */
  withUnknownPages: number;
  /** Highest first. */
  visits: VisitIntent[];
  counted: Counted[];
};

/**
 * Score a set of visits, best first.
 *
 * EVERY FIGURE IS DECLARED. The daily report refuses to print a digit it
 * cannot trace to a `Counted`, and prunes the block rather than the
 * email — so a summary that forgets to declare one loses the whole
 * paragraph.
 */
export function summariseIntent(
  visits: Visit[] | null | undefined,
  declared: Record<string, string> | null | undefined
): IntentSummary {
  const scored = (visits ?? []).map((v) => scoreVisit(v, declared));
  scored.sort((a, b) => b.score - a.score || a.startedAt.localeCompare(b.startedAt));

  const high = scored.filter((v) => v.band === "high").length;
  const medium = scored.filter((v) => v.band === "medium").length;
  const withUnknownPages = scored.filter((v) => v.unknownPages > 0).length;

  return {
    scored: scored.length,
    high,
    medium,
    withUnknownPages,
    visits: scored,
    counted: [
      { label: "visits scored for intent", value: scored.length, source: "page_events" },
      { label: "visits that reached the high band", value: high, source: "page_events" },
      { label: "visits in the middle band", value: medium, source: "page_events" },
      { label: "visits with a page we could not identify", value: withUnknownPages, source: "website_pages" },
    ],
  };
}

/**
 * Read what the business declared each page to be.
 *
 * NULL ON A FAILED READ, NOT AN EMPTY MAP. An empty map classifies every
 * page as unknown, which would score every visit at near zero and read
 * as "nobody was interested" — the same mistake as reporting a failed
 * visits read as a week with no visitors. The caller says nothing
 * instead.
 *
 * A business with no site at all is a different answer: an empty map,
 * because there is genuinely nothing to declare.
 */
export async function readPageKinds(
  supabase: any,
  dealershipId: string
): Promise<Record<string, string> | null> {
  const { data: site, error: siteError } = await supabase
    .from("websites")
    .select("id")
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  if (siteError) return null;
  if (!site?.id) return {};

  const { data, error } = await supabase
    .from("website_pages")
    .select("slug, page_type")
    .eq("website_id", site.id);
  if (error || !Array.isArray(data)) return null;

  const out: Record<string, string> = {};
  for (const row of data) {
    const slug = String(row?.slug ?? "").trim();
    const type = String(row?.page_type ?? "").trim();
    if (slug && type) out[slug] = type;
  }
  return out;
}

/**
 * The sentence the report prints, or null when there is nothing true to
 * say.
 *
 * NO VISITS IS NOT A LINE. "0 visits reached the high band" out of no
 * visits at all is a true number and a misleading sentence, the same
 * judgement that removed "BROKEN" from a business with no website.
 */
export function intentLine(summary: IntentSummary): string | null {
  if (!summary.scored) return null;
  const best = summary.visits[0];
  const head = `Intent: of ${summary.scored} visits, ${summary.high} did enough to rank high and ${summary.medium} middling.`;
  const top = best.reasons.filter((r) => r.points > 0).slice(0, 2).map((r) => r.why);
  const detail = top.length ? ` The strongest ${top.join(" and ")}.` : "";
  const caveat = summary.withUnknownPages
    ? ` ${summary.withUnknownPages} of them included a page we could not identify, so their ranking is an undercount.`
    : "";
  return head + detail + caveat;
}
