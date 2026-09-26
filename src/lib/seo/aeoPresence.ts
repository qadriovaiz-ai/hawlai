// Recording an AEO check, and what changed since the last one
// (migration 199).
//
// Every number here is counted from the business's own stored runs. The
// model judged whether it would be named; this file only compares what
// it judged, run against run, question against question.

import { recordSignal, fingerprintOf } from "@/lib/signals/signals";

export type PresenceRow = { question: string; mentioned: boolean; competitors: string[] };

export type AeoTrend = {
  /** Questions in the latest run, and whether this business was named. */
  now: PresenceRow[];
  mentionedNow: number;
  total: number;
  /** null when there is no earlier run to compare with. */
  mentionedBefore: number | null;
  /** Questions it is named for now and wasn't before. */
  gained: string[];
  /** Questions it was named for before and isn't now. */
  lost: string[];
  /** Said plainly when a comparison isn't possible yet. */
  thin: string | null;
};

const MAX_COMPETITORS = 8;

function tidyCompetitors(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.map((c) => String(c ?? "").trim()).filter(Boolean))).slice(0, MAX_COMPETITORS);
}

/** Stores one run's answers, one row per question. */
export async function recordPresence(
  service: any,
  dealershipId: string,
  rows: PresenceRow[],
  score: number | null,
  now: Date = new Date()
): Promise<string | null> {
  if (!dealershipId || rows.length === 0) return null;
  const runId = crypto.randomUUID();
  try {
    const { error } = await service.from("aeo_presence").insert(
      rows.map((r) => ({
        dealership_id: dealershipId,
        run_id: runId,
        run_at: now.toISOString(),
        question: r.question,
        mentioned: Boolean(r.mentioned),
        competitors: tidyCompetitors(r.competitors),
        score: Number.isFinite(score as number) ? score : null,
      }))
    );
    return error ? null : runId;
  } catch (err: any) {
    console.error("[aeo-presence] recordPresence failed:", err?.message);
    return null;
  }
}

/** The latest run against the one before it. */
export async function aeoTrend(service: any, dealershipId: string): Promise<AeoTrend | null> {
  try {
    const { data } = await service
      .from("aeo_presence")
      .select("run_id, run_at, question, mentioned, competitors")
      .eq("dealership_id", dealershipId)
      .order("run_at", { ascending: false })
      .limit(60);

    const rows = data ?? [];
    if (rows.length === 0) return null;

    // Newest first, so the first run id seen is the latest.
    const runIds: string[] = [];
    for (const r of rows) if (!runIds.includes(r.run_id)) runIds.push(r.run_id);
    const latest = rows.filter((r: any) => r.run_id === runIds[0]);
    const previous = runIds[1] ? rows.filter((r: any) => r.run_id === runIds[1]) : [];

    const now: PresenceRow[] = latest.map((r: any) => ({
      question: r.question,
      mentioned: Boolean(r.mentioned),
      competitors: tidyCompetitors(r.competitors),
    }));
    const before = new Map<string, boolean>(previous.map((r: any) => [r.question, Boolean(r.mentioned)]));

    // Only questions asked in BOTH runs can be compared. A question that
    // didn't exist last time hasn't been gained — it has only been asked.
    const gained = now.filter((r) => r.mentioned && before.get(r.question) === false).map((r) => r.question);
    const lost = now.filter((r) => !r.mentioned && before.get(r.question) === true).map((r) => r.question);

    const mentionedNow = now.filter((r) => r.mentioned).length;
    const comparable = now.filter((r) => before.has(r.question));

    return {
      now,
      mentionedNow,
      total: now.length,
      mentionedBefore: previous.length ? previous.filter((r: any) => r.mentioned).length : null,
      gained,
      lost,
      thin: !previous.length
        ? "This is the first check, so there's nothing to compare it against yet. Run it again in a few weeks."
        : comparable.length === 0
        ? "The questions changed since the last check, so the two runs can't be compared."
        : null,
    };
  } catch (err: any) {
    console.error("[aeo-presence] aeoTrend failed:", err?.message);
    return null;
  }
}

/**
 * The run, filed where the other departments can read it (migration 198).
 *
 * Two different kinds of thing, kept apart on purpose:
 *   counted  — how many of our own fixed questions named us, and whether
 *              that moved. Our rows, our arithmetic.
 *   observed — who the search actually surfaced instead. Someone else's
 *              presence, not a conclusion about them.
 */
export async function recordAeoSignals(service: any, dealershipId: string, trend: AeoTrend): Promise<void> {
  if (!trend || trend.total === 0) return;

  const moved =
    trend.mentionedBefore === null
      ? ""
      : trend.mentionedNow > trend.mentionedBefore
      ? `, up from ${trend.mentionedBefore}`
      : trend.mentionedNow < trend.mentionedBefore
      ? `, down from ${trend.mentionedBefore}`
      : ", unchanged";

  await recordSignal(service, dealershipId, {
    source: "aeo",
    topic: "answer presence",
    summary: `Named in ${trend.mentionedNow} of ${trend.total} buying questions an AI assistant was asked${moved}`,
    evidence: {
      mentioned: trend.mentionedNow,
      questions: trend.total,
      ...(trend.mentionedBefore !== null ? { previously: trend.mentionedBefore } : {}),
      ...(trend.gained.length ? { gained: trend.gained } : {}),
      ...(trend.lost.length ? { lost: trend.lost } : {}),
    },
    confidence: "counted",
    // One standing signal per business, rewritten each run rather than a
    // new row every time the check is run.
    fingerprint: fingerprintOf(["aeo", "answer presence"]),
  });

  // Who the search surfaced instead, for the questions we lose.
  const missing = trend.now.filter((r) => !r.mentioned && r.competitors.length > 0).slice(0, 3);
  for (const row of missing) {
    await recordSignal(service, dealershipId, {
      source: "aeo",
      topic: row.question,
      summary: `Not named for "${row.question}" — ${row.competitors.slice(0, 3).join(", ")} ${row.competitors.length === 1 ? "is" : "are"}`,
      evidence: { question: row.question, competitorsNamed: row.competitors },
      confidence: "observed",
      fingerprint: fingerprintOf(["aeo", row.question]),
    });
  }
}
