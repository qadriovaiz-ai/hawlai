// Grouping the searches people really made (G2 of
// docs/AUDIT-GROWTH-LOOP.md).
//
// A CORRECTION TO MY OWN AUDIT FIRST, because the founder acted on what
// I wrote. That audit said `competitor_keywords` "invents ten". It does
// — but only for a business with no Search Console connection.
// `REAL_DATA_INSTRUCTIONS` in seoToolkitAgent.ts already swaps the
// static instruction for the real terms with Google's own counts the
// moment a connection exists, and its own comment says so: "With Search
// Console connected there is no need to guess." I overstated it.
//
// WHAT IS GENUINELY MISSING, and what this file is: nothing GROUPS the
// real queries. Even with a connection, a model is handed a flat list
// and returns ten individual terms. "These five searches are the same
// subject, and together they are 180 impressions" is a computed fact
// that nobody computed — and it is the fact that tells an owner whether
// a subject is worth an afternoon.
//
// DETERMINISTIC AND MODEL-FREE, which is the point rather than a saving.
// A model asked to group searches will group them slightly differently
// each time, and a grouping that moves cannot be compared month to
// month — the same reasoning that fixed `aeoQuestions` in code. Same
// queries in, same clusters out, in the same order.
//
// THE WORD LISTS LIVE HERE NOW, and pageProposal.ts imports them, so
// there is one answer to "what does this search say it is about". Two
// copies of that would be the fourth duplicated definition this week.
//
// Pure: no I/O, no model, no React.

/** One search, as Google reported it. */
export type CountedQuery = { query: string; impressions: number; clicks: number; position: number };

/**
 * Words that carry no meaning of their own.
 *
 * INDUSTRY-NEUTRAL BY CONSTRUCTION (rule 3): every one of these is
 * filler in any trade. Not one of them names a product, a category or a
 * place — "near me" is filler everywhere, "candle" would be a leak.
 */
export const STOPWORDS = new Set([
  "a", "an", "and", "the", "of", "for", "in", "on", "at", "to", "near", "me", "my", "best", "top",
  "good", "cheap", "cheapest", "affordable", "is", "it", "how", "much", "does", "cost", "price",
  "where", "buy", "shop", "online", "india", "worth", "which", "what", "who", "are", "you", "your",
]);

/** The words in a search that actually say what it is about. */
export function contentWords(query: string): string[] {
  return String(query ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

export type QueryCluster = {
  /** The word every search in this group shares. */
  subject: string;
  /** Every search in it, strongest first. */
  queries: CountedQuery[];
  /** Counted, summed from Google's own figures. */
  impressions: number;
  clicks: number;
  /** The best (lowest) average position in the group, or null. */
  bestPosition: number | null;
};

/** A subject needs this many searches before calling it a group means anything. */
export const MIN_CLUSTER_SIZE = 2;

/**
 * The searches, grouped by what they are about.
 *
 * HOW, AND WHY GREEDILY. The most common content word becomes a
 * subject, every search containing it joins that group, and the rest are
 * clustered again on what is left. Greedy is the right shape here
 * because the question an owner is asking is "what is the biggest thing
 * I am being searched for", and that is the most common word by
 * definition.
 *
 * TIES BROKEN ALPHABETICALLY, on purpose: without it, two runs over the
 * same data could produce different subjects and a month-to-month
 * comparison would be meaningless. A grouping that moves is worse than
 * no grouping.
 *
 * A SEARCH BELONGS TO ONE GROUP. "soy candle gift box" contains both
 * "soy" and "gift", and counting it twice would make the totals add up
 * to more demand than Google reported — the one thing a counted number
 * must never do.
 */
export function clusterQueries(rows: CountedQuery[], minSize = MIN_CLUSTER_SIZE): QueryCluster[] {
  // NO FILLER FILTER, AND A MUTATION IS WHY.
  //
  // A row whose search is all filler contributes no content words, so it
  // can never be counted, never become a subject and never join a group.
  // It costs one extra pass, which then hits `if (!subject) break`
  // below. Three fixtures failed to find any input where filtering it
  // out changed the answer — redundant code cannot be guarded, so the
  // one condition that actually decides keeps the job.
  const remaining = (rows ?? []).filter((r) => r?.query);
  const out: QueryCluster[] = [];

  // ONE TERMINATION RULE: A PASS THAT REMOVED NOTHING CANNOT BE REPEATED.
  //
  // THE BUG BEHIND IT. The first version's only exit was the splice that
  // takes a group's members out of `remaining`. A mutation that stopped
  // removing them made this spin forever — no throw, no type error, no
  // failing test, just a daily job that never finishes, which is the
  // worst failure shape there is.
  //
  // AND THE THREE-GUARD VERSION THAT FOLLOWED WAS WORSE, which took four
  // mutation passes to see: a spin counter, an empty-subject break and
  // an empty-members break all covered the same condition, so no
  // mutation could reach any one of them through the others and each in
  // turn "survived". Overlapping guards are untestable guards.
  //
  // So there is one rule, at the bottom, with no `continue` to skip past
  // it: every pass either shrinks `remaining` or ends the loop. An empty
  // subject matches no row, removes nothing, and ends it here.
  while (remaining.length > 0) {
    const before = remaining.length;

    // Count every content word across what is left.
    const counts = new Map<string, number>();
    for (const row of remaining) {
      for (const word of new Set(contentWords(row.query))) {
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }

    // The most common, with alphabet as the tie-break.
    let subject = "";
    let best = 0;
    for (const word of [...counts.keys()].sort()) {
      const n = counts.get(word)!;
      if (n > best) {
        best = n;
        subject = word;
      }
    }

    const members: CountedQuery[] = [];
    if (subject) {
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (contentWords(remaining[i].query).includes(subject)) {
          members.unshift(remaining[i]);
          remaining.splice(i, 1);
        }
      }
    }

    // BELOW THE MINIMUM IS NOT A GROUP, and its members are not thrown
    // away — they have been taken out of `remaining` and are simply not
    // reported as a subject. One search is a search, not a subject.
    if (members.length >= minSize) {
      const queries = [...members].sort((a, b) => b.impressions - a.impressions);
      const positions = queries.map((q) => Number(q.position)).filter((p) => Number.isFinite(p) && p > 0);
      out.push({
        subject,
        queries,
        impressions: queries.reduce((n, q) => n + (Number(q.impressions) || 0), 0),
        clicks: queries.reduce((n, q) => n + (Number(q.clicks) || 0), 0),
        bestPosition: positions.length ? Math.min(...positions) : null,
      });
    }

    if (remaining.length >= before) break;
  }

  // Strongest subject first: it is what the owner should read about.
  return out.sort((a, b) => b.impressions - a.impressions || a.subject.localeCompare(b.subject));
}

/** The cluster one search belongs to, or null when it is in none. */
export function clusterFor(clusters: QueryCluster[], query: string): QueryCluster | null {
  const wanted = String(query ?? "").toLowerCase().trim();
  if (!wanted) return null;
  return (clusters ?? []).find((c) => c.queries.some((q) => q.query.toLowerCase().trim() === wanted)) ?? null;
}

/**
 * What the owner reads about one group.
 *
 * EVERY NUMBER IS GOOGLE'S, SUMMED. Nothing here estimates a volume,
 * multiplies by a benchmark or scores anything — the rule
 * `searchQueries.ts` states for itself and the reason it exists.
 */
export function clusterSummary(cluster: QueryCluster): string {
  const n = cluster.queries.length;
  const seen = `${n} searches about "${cluster.subject}" showed you ${cluster.impressions} times in 28 days`;
  if (cluster.clicks === 0) {
    return `${seen} and nobody clicked once.`;
  }
  return `${seen}, with ${cluster.clicks} click${cluster.clicks === 1 ? "" : "s"}.`;
}
