// The last two departments join the store (Brain, final piece).
//
// The diagnosis and the positioning comparison were the two engines whose
// findings nothing else could read. Both already count in code — the
// funnel from the business's own rows, the themes from competitors' own
// published words — so this files what they found rather than working
// anything out again.
//
// Two different standings, kept apart for the reason the whole store
// exists: the funnel is COUNTED, because it is this business's own rows
// added up. What competitors say is OBSERVED, because it is their claim
// quoted accurately. And "nobody is saying this, so it's open ground" is
// INFERRED — a reading of an absence, which is the softest thing here and
// is labelled as such.
//
// Runs daily, database-only, no AI call: it is reading two things that
// have already been computed.

import { recordSignal, fingerprintOf } from "@/lib/signals/signals";
import { loadDiagnosis, type Diagnosis } from "./diagnosis";
// The same threshold the diagnosis itself uses, so the sentence and the
// number can never drift apart.
import { AT_RISK_DAYS } from "@/lib/agents/churnAgent";
import { latestPositioning } from "./positioning/run";

/** Competitors a theme needs before "everyone says this" is a fair summary. */
export const MIN_FOR_CROWDED = 2;

export async function runStrategySignals(supabase: any, dealershipId: string): Promise<{ filed: number; skipped?: string }> {
  let filed = 0;
  try {
    const diagnosis = await loadDiagnosis(supabase, dealershipId);
    filed += await fileDiagnosisSignals(supabase, dealershipId, diagnosis);
  } catch (err: any) {
    console.error("[strategy-signals] diagnosis skipped:", err?.message);
  }
  try {
    const run = await latestPositioning(supabase, dealershipId);
    if (run) filed += await filePositioningSignals(supabase, dealershipId, run);
  } catch (err: any) {
    console.error("[strategy-signals] positioning skipped:", err?.message);
  }
  return filed === 0 ? { filed, skipped: "nothing countable yet" } : { filed };
}

/**
 * Where the business is losing people, and what it already knows works.
 *
 * When the funnel is too thin to name a weakest step, THAT is filed — the
 * same discipline as the content performance read. A department that says
 * "I can't tell yet" is more useful to Strategy than one that says
 * nothing, because silence gets filled in.
 */
export async function fileDiagnosisSignals(service: any, dealershipId: string, d: Diagnosis | null): Promise<number> {
  if (!d) return 0;
  let filed = 0;

  const withWeakest = d.funnels.find((f) => f.weakest);
  if (withWeakest?.weakest) {
    const w = withWeakest.weakest;
    await recordSignal(service, dealershipId, {
      source: "diagnosis",
      topic: "weakest step",
      summary: `The biggest drop is ${w.from} → ${w.to}: ${w.rate}% of ${w.entered} get through`,
      evidence: { funnel: withWeakest.name, from: w.from, to: w.to, ratePct: w.rate, entered: w.entered, windowDays: d.window.days },
      confidence: "counted",
      fingerprint: fingerprintOf(["diagnosis", "weakest step"]),
    });
    filed += 1;
  } else {
    const thin = d.funnels.find((f) => f.thin)?.thin;
    await recordSignal(service, dealershipId, {
      source: "diagnosis",
      topic: "weakest step",
      summary: thin ?? "There isn't enough traffic yet to say where people are being lost",
      evidence: { windowDays: d.window.days, steps: d.funnels[0]?.steps.map((s) => ({ label: s.label, count: s.count })) ?? [] },
      confidence: "counted",
      fingerprint: fingerprintOf(["diagnosis", "weakest step"]),
    });
    filed += 1;
  }

  // Only a source with enough leads to rank — the diagnosis already
  // decides that, and this must not second-guess it.
  const best = d.sources.filter((s) => s.ranked && (s.conversion ?? 0) > 0).sort((a, b) => (b.conversion ?? 0) - (a.conversion ?? 0))[0];
  if (best) {
    await recordSignal(service, dealershipId, {
      source: "diagnosis",
      topic: "best source",
      summary: `${best.source} converts best: ${best.won} of ${best.leads} leads became customers (${best.conversion}%)`,
      evidence: { source: best.source, leads: best.leads, won: best.won, conversionPct: best.conversion },
      confidence: "counted",
      fingerprint: fingerprintOf(["diagnosis", "best source"]),
    });
    filed += 1;
  }

  if (d.atRisk.count > 0) {
    await recordSignal(service, dealershipId, {
      source: "diagnosis",
      topic: "customers at risk",
      summary: `${d.atRisk.count} of ${d.atRisk.total} customers haven't been contacted in ${AT_RISK_DAYS}+ days`,
      evidence: { atRisk: d.atRisk.count, total: d.atRisk.total, days: AT_RISK_DAYS },
      confidence: "counted",
      fingerprint: fingerprintOf(["diagnosis", "customers at risk"]),
    });
    filed += 1;
  }

  return filed;
}

/**
 * What competitors actually say, and what nobody is saying.
 *
 * The quotes are theirs: observed, with the page they came from. Open
 * ground is a reading of an absence — nobody claiming something is not
 * evidence that it would work — so it is filed as inferred and will never
 * be allowed to stand as a measurement.
 */
export async function filePositioningSignals(service: any, dealershipId: string, run: any): Promise<number> {
  const positioning = run?.analysis?.positioning;
  const rows: any[] = positioning?.rows ?? [];
  const total = Number(positioning?.competitorCount) || 0;
  if (rows.length === 0 || total === 0) return 0;
  let filed = 0;

  const crowded = rows
    .filter((r) => (r.claimedBy?.length ?? 0) >= MIN_FOR_CROWDED)
    .sort((a, b) => (b.claimedBy?.length ?? 0) - (a.claimedBy?.length ?? 0))[0];
  if (crowded) {
    const example = crowded.examples?.[0];
    await recordSignal(service, dealershipId, {
      source: "positioning",
      topic: crowded.key,
      summary: `${crowded.claimedBy.length} of ${total} competitors claim ${crowded.label}${example?.quote ? ` — ${example.competitor}: "${trim(example.quote)}"` : ""}`,
      evidence: { theme: crowded.key, label: crowded.label, claimedBy: crowded.claimedBy, competitorsCompared: total },
      confidence: "observed",
      sourceUrl: example?.url ?? null,
      fingerprint: fingerprintOf(["positioning", "crowded", crowded.key]),
    });
    filed += 1;
  }

  // White space: few say it AND this business has facts to say it with.
  // Still a reading, because nobody saying something is not proof that
  // saying it would work.
  const white = (positioning.whiteSpace ?? [])[0];
  if (white) {
    const row = rows.find((r) => r.key === white || r.label === white);
    await recordSignal(service, dealershipId, {
      source: "positioning",
      topic: String(row?.key ?? white),
      summary: `Almost nobody among the ${total} competitors claims ${row?.label ?? white}, and this business has facts to claim it with`,
      evidence: { theme: row?.key ?? white, label: row?.label ?? white, claimedBy: row?.claimedBy ?? [], yourFacts: row?.yourFacts ?? [], competitorsCompared: total },
      confidence: "inferred",
      fingerprint: fingerprintOf(["positioning", "white space", String(row?.key ?? white)]),
    });
    filed += 1;
  }

  return filed;
}

function trim(quote: string): string {
  const q = String(quote ?? "").replace(/\s+/g, " ").trim();
  return q.length > 120 ? `${q.slice(0, 117)}…` : q;
}
