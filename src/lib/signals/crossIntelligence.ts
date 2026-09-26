// When separate departments notice the same thing (Brain, Phase 5b).
//
// This is the chain the vision calls the real Hawlai Brain: market
// research notices customers complaining about price, competitor research
// finds competitors are expensive too, search shows demand for "affordable
// X", AI answers are being asked the same, and content on price performs
// — so the conclusion is worth acting on in a way no single one of those
// would be.
//
// The honest mechanism for that is AGREEMENT BETWEEN INDEPENDENT SOURCES.
// It needs no model and no new data: the signal store already holds what
// each department noticed, with where it came from and how solid it is, so
// convergence is something that can be counted.
//
// TWO RULES KEEP IT FROM BECOMING AN ECHO:
//   1. Sources must be DIFFERENT. Three competitor headlines about
//      delivery are one department noticing one thing three times, not
//      three departments agreeing.
//   2. At least one must be counted or observed. Two inferred readings
//      agreeing is two guesses agreeing, which is not evidence of
//      anything, and is the exact failure mode this whole project keeps
//      refusing to ship.

import type { Confidence, SignalSource, StoredSignal } from "./signals";

export type Convergence = {
  theme: string;
  /** The distinct departments that pointed at it. */
  sources: SignalSource[];
  /** What each of them actually said, in its own words. */
  saying: { source: SignalSource; summary: string; confidence: Confidence }[];
  /** The best standing among them — what the convergence can claim to be. */
  standing: Confidence;
  /** Said plainly when the agreement rests on softer ground than it looks. */
  caveat: string | null;
};

/** Departments that must agree before anything is called a convergence. */
export const MIN_SOURCES = 2;

const STOP = new Set([
  "the", "and", "for", "with", "you", "your", "our", "now", "new", "has", "have", "are", "its", "from", "this", "that",
  "will", "all", "more", "out", "get", "how", "why", "what", "who", "not", "named", "never", "clicked", "times", "time",
  "business", "businesses", "search", "searches", "searched", "people", "position", "found", "reached", "them", "they",
  "offering", "offers", "offer", "announced", "announces", "launch", "launched", "launches", "added", "adds", "started",
  "site", "page", "pages", "content", "buying", "questions", "question", "answer", "answers", "assistant", "google",
  "than", "were", "was", "been", "being", "into", "over", "under", "about", "also", "just", "only", "some", "most",
]);

/** The words in a signal that could name a theme the others might share. */
export function themeWordsOf(signal: StoredSignal): string[] {
  const parts = [signal.summary, signal.topic, ...Object.values(signal.evidence ?? {}).filter((v) => typeof v === "string").map(String)];
  return Array.from(
    new Set(
      parts
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w))
    )
  );
}

const RANK: Record<Confidence, number> = { inferred: 0, observed: 1, counted: 2 };

/**
 * Themes that more than one department has pointed at.
 *
 * Strongest first, where strength means how solid the underlying signals
 * are and how many departments agree — never how striking the sentence is.
 */
export function convergences(signals: StoredSignal[]): Convergence[] {
  const byTheme = new Map<string, StoredSignal[]>();
  for (const s of signals ?? []) {
    for (const word of themeWordsOf(s)) {
      if (!byTheme.has(word)) byTheme.set(word, []);
      byTheme.get(word)!.push(s);
    }
  }

  const out: Convergence[] = [];
  for (const [theme, group] of byTheme) {
    const sources = Array.from(new Set(group.map((s) => s.source)));
    // Rule 1: one department noticing something three times is not
    // agreement, however many rows it wrote.
    if (sources.length < MIN_SOURCES) continue;

    // One signal per source, its strongest, so a chatty department can't
    // dominate the list.
    const saying = sources.map((source) => {
      const best = group.filter((s) => s.source === source).sort((a, b) => RANK[b.confidence] - RANK[a.confidence])[0];
      return { source, summary: best.summary, confidence: best.confidence };
    });

    const standing = saying.reduce<Confidence>((acc, s) => (RANK[s.confidence] > RANK[acc] ? s.confidence : acc), "inferred");
    // Rule 2: two readings agreeing are two guesses agreeing.
    if (standing === "inferred") continue;

    const softest = saying.reduce<Confidence>((acc, s) => (RANK[s.confidence] < RANK[acc] ? s.confidence : acc), "counted");
    out.push({
      theme,
      sources,
      saying,
      standing,
      caveat:
        softest === "inferred"
          ? "One of these is a reading rather than a measurement, so the agreement is weaker than the number of departments makes it look."
          : null,
    });
  }

  return out
    .sort((a, b) => RANK[b.standing] - RANK[a.standing] || b.sources.length - a.sources.length || a.theme.localeCompare(b.theme))
    .slice(0, 5);
}

/**
 * Convergences as prompt text.
 *
 * Says who agreed and what each of them said, so a model can reason from
 * the agreement without being handed a conclusion it would then have to
 * be trusted not to overstate.
 */
export function formatConvergencesForPrompt(list: Convergence[]): string {
  if (list.length === 0) return "";
  const lines = list.flatMap((c) => [
    `- "${c.theme}" — ${c.sources.length} departments point at this${c.caveat ? ` (${c.caveat})` : ""}:`,
    ...c.saying.map((s) => `    · ${s.source} (${s.confidence}): ${s.summary}`),
  ]);
  return [
    "## Where separate departments agree",
    "Two or more parts of Hawlai noticed the same thing independently, which is a firmer footing than any one of them alone. Say what they agree ON and let the reasoning follow from it — do not treat agreement as proof of a cause, and do not restate a reading as a measurement.",
    ...lines,
  ].join("\n");
}
