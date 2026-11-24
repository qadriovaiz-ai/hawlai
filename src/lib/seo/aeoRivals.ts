// Who gets named for the questions this business does not — G-a / A4a.
//
// ──────────────────────────────────────────────────────────────────
// NOTHING IS MEASURED HERE THAT WAS NOT ALREADY BEING RECORDED.
//
// `aeo_presence` (migration 199) has stored, per run and per question,
// whether the business was mentioned AND who was named instead. The
// trend read it for our own column — "three of four questions named
// you, up from two" — and threw the other column away. This reads the
// column that was already there.
//
// So this is the one GEO piece that needs no vendor, no contract and
// no terms reading: the owner's question is "am I invisible compared
// with the businesses that are not", and the answer has been sitting
// in that table since November.
//
// ──────────────────────────────────────────────────────────────────
// WHAT IT MUST NOT CLAIM, and this is the whole risk in the piece.
//
// The check behind these rows is a Claude model with live web search,
// not a query of ChatGPT, Gemini or Perplexity — `aeoAgent`'s fixed
// DISCLOSURE says exactly that, and it is the most accurate sentence
// in the SEO toolkit. A line in the daily email saying "ChatGPT names
// eight competitors and not you" would be false, and it is the
// obvious way to word this.
//
// So the sentence below names NO engine. It says what was searched and
// what came back, which is all the rows support.
//
// A RIVAL IS AN OBSERVATION, NOT A CONCLUSION. These names came out of
// a search; nothing here checks they are real businesses, competitors,
// or even distinct from each other. They are reported as "named
// alongside or instead of you", never as "your competitors".
// ──────────────────────────────────────────────────────────────────

export type PresenceRead = { question: string; mentioned: boolean; competitors: string[] };

export type RivalSummary = {
  /** Names seen, most-named first, then alphabetically so the order is stable. */
  rivals: { name: string; questions: number }[];
  /** How many of the questions named this business. */
  ours: number;
  /** How many questions the run asked. */
  total: number;
};

/**
 * Who was named, across one run's questions.
 *
 * CASE-FOLDED FOR COUNTING, DISPLAYED AS FIRST SEEN. The same business
 * comes back as "Candle Studio" and "candle studio" across two
 * questions, and counting those separately would report two rivals
 * where there is one — which is the kind of inflated number this
 * codebase's digit walk exists to stop reaching the owner.
 */
export function rivalsNamedInstead(rows: PresenceRead[]): RivalSummary {
  const seen = new Map<string, { name: string; questions: Set<string> }>();
  let ours = 0;

  for (const row of rows ?? []) {
    if (row?.mentioned) ours++;
    for (const raw of row?.competitors ?? []) {
      const name = String(raw ?? "").replace(/\s+/g, " ").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const entry = seen.get(key) ?? { name, questions: new Set<string>() };
      entry.questions.add(String(row?.question ?? ""));
      seen.set(key, entry);
    }
  }

  const rivals = Array.from(seen.values())
    .map((r) => ({ name: r.name, questions: r.questions.size }))
    .sort((a, b) => b.questions - a.questions || a.name.localeCompare(b.name));

  return { rivals, ours, total: (rows ?? []).length };
}

/**
 * The line the owner reads, or nothing.
 *
 * SILENT IN THREE CASES, and each one is a case where a line would be
 * worse than no line:
 *
 *   no run yet          there is nothing to report, and "0 of 0" reads
 *                       like a failure rather than an absence.
 *   named every time    the finding does not exist. A line saying so
 *                       every morning is one the eye learns to skip.
 *   nobody else named   a search that surfaced no business at all says
 *                       something about the search, not about him.
 *
 * NOT SILENT when he was named AND others were too — "you and nine
 * others" is a real finding, and suppressing it would only report the
 * worst case.
 */
export function rivalsLine(summary: RivalSummary): { text: string; numbers: { label: string; value: number; source: string }[] } | null {
  const { rivals, ours, total } = summary;
  if (total === 0 || !rivals.length) return null;
  if (ours >= total) return null;

  const named = rivals.length;
  const top = rivals.slice(0, 3).map((r) => r.name).join(", ");

  // THE NUMBERS ARE DECLARED, or the daily report's digit walk removes
  // this whole block and he hears nothing — the silent failure
  // `withoutUncountedBlocks` exists to make visible.
  const numbers = [
    { label: "Businesses named in answer searches", value: named, source: "aeo_presence.competitors" },
    { label: "Your questions that named you", value: ours, source: "aeo_presence.mentioned" },
    { label: "Questions checked", value: total, source: "aeo_presence.question" },
  ];

  // NO ENGINE IS NAMED. See the header: the rows come from a web
  // search, not from ChatGPT, Gemini or Perplexity.
  const whoElse =
    named === 1
      ? `1 other business was named — ${top}`
      : `${named} other businesses were named, including ${top}`;
  const you =
    ours === 0
      ? "you were not named once"
      : ours === 1
      ? "you were named in 1 of them"
      : `you were named in ${ours} of them`;

  return {
    text: `Across ${total} buyer questions checked in a web search, ${you}. ${whoElse}. This is a search of the open web, not a question put to any AI assistant.`,
    numbers,
  };
}
