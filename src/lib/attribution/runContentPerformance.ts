// The daily read of what kind of content works (Brain, Phase 5a).
//
// Kept apart from performanceBrain.ts so that file stays pure arithmetic
// and can be tested without a database at all.

import { performanceByFormat, recordPerformanceSignals, type PerformanceRead } from "./performanceBrain";

export async function runContentPerformance(supabase: any, dealershipId: string): Promise<PerformanceRead | { skipped: string }> {
  try {
    const read = await performanceByFormat(supabase, dealershipId);
    // Nothing published through Hawlai yet: no signal, because "we have
    // no data" is only worth filing once there is something to have data
    // about.
    if (read.totals.pieces === 0) return { skipped: "nothing published through Hawlai yet" };
    await recordPerformanceSignals(supabase, dealershipId, read);
    return read;
  } catch (err: any) {
    console.error("[content-performance] failed:", err?.message);
    return { skipped: err?.message ?? "unknown error" };
  }
}
