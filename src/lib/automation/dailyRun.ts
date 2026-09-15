// How one daily cron invocation works through its subsystems: ONE
// SUBSYSTEM ACROSS EVERY BUSINESS, THEN THE NEXT — in the group's order.
//
// THE LIVE CASE (2026-09-15): candle_by_qaaf had one email-automation run
// on record (10 Sep) and none for the five days after, while four other
// test businesses had theirs. The route ran every subsystem for business
// 1, then every subsystem for business 2, and so on, starting each
// business with daily_autopilot's AI calls. On Vercel Hobby the whole
// invocation gets 60 seconds; businesses late in the list were never
// reached, and a killed invocation logs nothing.
//
// It also meant the order written in cronGroups.ts (auto-posting first,
// commit 056eec8) never took effect: the route called subsystems in its
// own hard-coded order. The order now comes from the group list, and the
// cheap, customer-facing work (emails) happens for every business before
// any AI-heavy work starts.
//
// This makes a cut-off far less likely to hit what matters; it does not
// make a 60-second invocation big enough for everything. The daily job
// list (next change) is the fix for that.

import type { SubsystemKey } from "@/lib/automation/cronGroups";

export type DailyDealership = { id: string; business_category: string | null };

export async function runSubsystemsInOrder<T>(opts: {
  dealerships: DailyDealership[];
  /** In the order they should run. */
  subsystems: SubsystemKey[];
  execute: (subsystem: SubsystemKey, dealership: DailyDealership) => Promise<T>;
}): Promise<Record<string, Partial<Record<SubsystemKey, T>>>> {
  const results: Record<string, Partial<Record<SubsystemKey, T>>> = {};
  for (const d of opts.dealerships) results[d.id] = {};
  for (const subsystem of opts.subsystems) {
    for (const d of opts.dealerships) {
      results[d.id][subsystem] = await opts.execute(subsystem, d);
    }
  }
  return results;
}
