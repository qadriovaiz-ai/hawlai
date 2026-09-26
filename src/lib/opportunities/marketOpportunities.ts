// Turning what the departments noticed into things worth doing
// (Brain, Phase 2).
//
// The vision asks for an Opportunity Score: Demand × Relevance ×
// Commercial intent × Competition gap × Capability. Multiplying five
// subjective one-to-ten guesses produces a precise-looking number with
// nothing underneath it — "73/100" invites belief it hasn't earned. So
// this does the honest version of the same idea:
//
//   - Demand is COUNTED, from Google's own impressions.
//   - Commercial intent is DECIDED IN CODE, from how the search is
//     worded, not judged by a model.
//   - Capability is COUNTED: does this business actually sell the thing.
//   - Competition gap is OBSERVED, from who search names instead.
//   - Customer relevance is NOT MEASURABLE here, and is said to be
//     unknown rather than filled in to complete the formula.
//
// The output is a band — high, medium, low — which is all the underlying
// evidence can support, plus the figures it rests on. Bands are what the
// existing opportunities feed already understands, so these appear where
// the owner already looks, and resolve themselves when they stop being
// true.

import type { QueryRow } from "@/lib/seo/searchConsole";
import type { StoredSignal } from "@/lib/signals/signals";
import { MIN_IMPRESSIONS, MIN_IMPRESSIONS_NO_CLICKS, NEARLY_THERE } from "@/lib/seo/searchQueries";

export type MarketOpportunity = {
  type: string;
  reference_id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  action_href?: string;
};

/** Impressions at which a term stops being a curiosity. */
export const STRONG_DEMAND = 50;
/** How many competitors must be doing something before it is a pattern. */
export const PATTERN_COMPETITORS = 2;

const BUY_WORDS = /\b(buy|order|shop|price|cost|cheap|affordable|near me|book|booking|delivery|online|sale|discount)\b/i;
const LEARN_WORDS = /\b(how|why|what|which|guide|ideas?|diy|tips?|best way|worth it)\b/i;

/** What the searcher was trying to do, decided from their own words. */
export function intentOf(query: string): "transactional" | "informational" | "unclear" {
  const q = String(query ?? "").toLowerCase();
  const buy = BUY_WORDS.test(q);
  const learn = LEARN_WORDS.test(q);
  if (buy && !learn) return "transactional";
  if (learn && !buy) return "informational";
  // "how much does a candle workshop cost" is both, and is a buyer.
  if (buy && learn) return "transactional";
  return "unclear";
}

const STOP = new Set([
  "the", "and", "for", "with", "you", "your", "our", "now", "new", "has", "have", "are", "its", "from", "this", "that",
  "will", "all", "more", "out", "get", "how", "why", "what", "who", "launch", "launches", "launched", "announces",
  "announced", "offering", "offers", "offer", "adds", "added", "starts", "started", "business", "businesses",
]);

/** The words in a headline that could name a theme. */
function themeWords(text: string): string[] {
  return Array.from(
    new Set(
      String(text ?? "")
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w))
    )
  );
}

/** Whether the catalogue already covers what someone searched for. */
export function catalogueCovers(query: string, items: { name: string }[]): boolean {
  const words = themeWords(query);
  if (words.length === 0) return false;
  return items.some((i) => {
    const name = String(i?.name ?? "").toLowerCase();
    return words.some((w) => name.includes(w));
  });
}

const UNKNOWN_RELEVANCE = "Whether your own customers care about this is not something Hawlai can measure — you'll know better than it does.";

/**
 * Everything worth doing that the evidence actually supports.
 *
 * Nothing here is invented: each opportunity names the figures it rests
 * on, and where a dimension of the vision's formula can't be measured it
 * is said to be unknown rather than guessed at.
 */
export function marketOpportunities(input: {
  queries: QueryRow[];
  signals: StoredSignal[];
  catalogue: { name: string }[];
}): MarketOpportunity[] {
  const out: MarketOpportunity[] = [];
  const queries = input.queries ?? [];
  const catalogue = input.catalogue ?? [];

  // 1. Already being found, and nobody clicks. The clearest opportunity
  // there is: the demand is proven and the loss is at our own door.
  for (const q of queries.filter((r) => r.clicks === 0 && r.impressions >= MIN_IMPRESSIONS_NO_CLICKS).sort((a, b) => b.impressions - a.impressions).slice(0, 3)) {
    out.push({
      type: "search_seen_not_clicked",
      reference_id: q.query,
      title: `"${q.query}" showed you ${q.impressions} times and nobody clicked`,
      description: `Google counted ${q.impressions} impressions and 0 clicks, at average position ${round(q.position)}. The demand is real and already reaching you — what people see when they get there is what isn't working. ${UNKNOWN_RELEVANCE}`,
      priority: q.impressions >= STRONG_DEMAND ? "high" : "medium",
      action_href: "/dashboard/seo",
    });
  }

  // 2. Close to where people actually click.
  for (const q of queries.filter((r) => r.impressions >= MIN_IMPRESSIONS && r.position >= NEARLY_THERE.from && r.position <= NEARLY_THERE.to && r.clicks > 0).sort((a, b) => a.position - b.position).slice(0, 2)) {
    out.push({
      type: "search_nearly_ranking",
      reference_id: q.query,
      title: `"${q.query}" sits at position ${round(q.position)} — just below where people click`,
      description: `${q.impressions} impressions and ${q.clicks} click${q.clicks === 1 ? "" : "s"} in 28 days. Moving a term already this close is cheaper than starting a new one.`,
      priority: "medium",
      action_href: "/dashboard/seo",
    });
  }

  // 3. Real demand for something the catalogue doesn't cover. This is the
  // vision's "commercial opportunity", and it is only stated when the
  // demand is COUNTED and the gap is checked against the real catalogue.
  for (const q of queries
    .filter((r) => r.impressions >= STRONG_DEMAND && intentOf(r.query) === "transactional" && !catalogueCovers(r.query, catalogue))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 2)) {
    out.push({
      type: "demand_without_offer",
      reference_id: q.query,
      title: `People search "${q.query}" ${q.impressions} times and you have nothing named for it`,
      description: `A buying search with ${q.impressions} impressions, and nothing in your catalogue matches its wording. Either you sell it and haven't named it that way, or it's something to consider offering. ${UNKNOWN_RELEVANCE}`,
      priority: "medium",
      action_href: "/dashboard/website",
    });
  }

  // 4. Search names competitors and not this business. Observed, not
  // counted — it is what a search returned, so it is described that way.
  for (const s of input.signals.filter((x) => x.source === "aeo" && x.confidence === "observed").slice(0, 2)) {
    const named = Array.isArray((s.evidence as any)?.competitorsNamed) ? ((s.evidence as any).competitorsNamed as string[]) : [];
    if (named.length === 0) continue;
    out.push({
      type: "not_named_in_answers",
      reference_id: String((s.evidence as any)?.question ?? s.topic),
      title: `AI answers name ${named.slice(0, 2).join(" and ")} for "${(s.evidence as any)?.question ?? s.topic}" — not you`,
      description: `${s.summary}. This is what a live search returned, not a measurement of anything you control. A page that answers that question directly is the usual way in.`,
      priority: "medium",
      action_href: "/dashboard/seo",
    });
  }

  // 5. Several competitors doing the same new thing. ONE competitor
  // announcing something is news; two or more is a pattern worth
  // reacting to, which is why this counts before it speaks.
  const byTheme = new Map<string, Set<string>>();
  for (const s of input.signals.filter((x) => x.source === "competitor_monitor")) {
    const who = String((s.evidence as any)?.competitor ?? s.topic);
    for (const word of themeWords(String((s.evidence as any)?.headline ?? s.summary))) {
      if (!byTheme.has(word)) byTheme.set(word, new Set());
      byTheme.get(word)!.add(who);
    }
  }
  for (const [theme, who] of Array.from(byTheme.entries()).sort((a, b) => b[1].size - a[1].size)) {
    if (who.size < PATTERN_COMPETITORS) continue;
    out.push({
      type: "competitor_pattern",
      reference_id: theme,
      title: `${who.size} competitors have moved on "${theme}"`,
      description: `${Array.from(who).slice(0, 3).join(", ")} — each announced something involving "${theme}". When several do the same thing it usually becomes what customers expect, rather than what makes one of them special. ${UNKNOWN_RELEVANCE}`,
      priority: "medium",
      action_href: "/dashboard/competitor-intel",
    });
    break; // The strongest pattern only: a list of themes is noise.
  }

  return out;
}

function round(n: number): number {
  return Math.round((Number(n) || 0) * 10) / 10;
}
