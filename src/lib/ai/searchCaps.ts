// How many web searches one Claude call may run.
//
// Claude's web_search tool bills per search (about ₹0.88 each), and
// `max_uses` is the only thing that bounds it. Six call sites shipped
// without one — AEO check, competitor intel, deep research, social
// trends, and the two nightly monitors — so on each of those the model
// decided how much to spend. The positioning module has always capped
// itself; nothing else did.
//
// TWO NUMBERS, AND THE REASON FOR THE SPLIT:
//
//   3 — the owner asked for this and is waiting for the answer. A
//       thinner answer is a worse product, and it happens once, when
//       they pressed something.
//
//   2 — nobody asked. The nightly monitors run for every watched
//       competitor and topic whether or not the result is ever read, so
//       the cost repeats every day forever and a tighter bound is worth
//       a slightly shallower check.
//
// These are ceilings, not targets: most calls use fewer.

export const SEARCH_CAPS = {
  /** AEO check — asks how a business shows up in AI answers. */
  aeo_check: 3,
  /** Competitor intelligence, run from the Competitors page. */
  competitor_intel: 3,
  /** Deep research, the whole point of which is depth. */
  deep_research: 3,
  /** "What's trending on Reels this month" — one or two searches answers it. */
  social_trends: 2,
  /** Nightly, per watched competitor. */
  competitor_monitor: 2,
  /** Nightly, per watched topic. */
  topic_monitor: 2,
} as const;

export type SearchCapKey = keyof typeof SEARCH_CAPS;

/** The web_search tool, capped. Every search-using call builds its tool through this. */
export function webSearchTool(key: SearchCapKey, extra: Record<string, unknown> = {}) {
  return { type: "web_search_20250305" as const, name: "web_search" as const, max_uses: SEARCH_CAPS[key], ...extra };
}
