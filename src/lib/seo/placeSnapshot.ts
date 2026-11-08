// Fetching the Maps listing once a month, so the daily check can be free.
//
// The Maps leg of G5 is split in two on purpose, and the split is forced
// by cronGroups.ts's own rule: `signals` is "database-only and fast" and
// runs in front of the emails, so a third-party network call cannot go
// there. The daily local audit lives in signals and the comparison is
// three strings against three strings, which costs nothing. The FETCH is
// what costs — so it runs monthly, in `heavy`, and writes one row that
// the daily comparison reads.
//
// The same shape search_console_sync already uses: the slow half writes,
// the fast half reads.
//
// MONTHLY, AND IT DECIDES THAT ITSELF, because Vercel Hobby allows two
// cron entries and both are used — the constraint monthly_review,
// page_speed and aeo_schedule all work around.
//
// NOT BEHIND A FLAG, unlike G4 and A5, and the difference is real rather
// than a slip. Those two spend on every run: PageSpeed burns quota and
// the AEO check is four live web searches. This one is free for the
// first 1,000 requests a month, which at one request per business is a
// thousand businesses — and it skips entirely for a business with no
// Google listing connected, which is every business today. A flag here
// would mean the comparison never runs for the first real business
// either, and the thing it finds (a listing that disagrees with the
// site) is worth having on day one.

import { fetchPlaceDetails } from "@/lib/google/placeDetails";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";

export type SnapshotRun = {
  day: string;
  /** True only when Google answered and the row was written. */
  fetched: boolean;
  /** Why nothing was fetched, for the log rather than the owner. */
  skipped: string | null;
};

/**
 * Read this business's Maps listing and store what it says.
 *
 * A FAILED READ LEAVES THE PREVIOUS SNAPSHOT ALONE. Overwriting it with
 * nulls would turn "we could not ask Google this month" into "Google has
 * no address for you", and the daily comparison would then report a
 * disagreement that does not exist.
 */
export async function runPlaceSnapshot(
  supabase: any,
  dealershipId: string,
  opts: { now?: Date; fetcher?: typeof fetch } = {}
): Promise<SnapshotRun> {
  const day = indiaToday(opts.now ?? new Date());
  const empty: SnapshotRun = { day, fetched: false, skipped: null };

  if (!day.endsWith("-01")) return { ...empty, skipped: "not the first of the month" };

  const { data: dealership, error } = await supabase
    .from("dealerships")
    .select("google_place_id")
    .eq("id", dealershipId)
    .maybeSingle();
  if (error) return { ...empty, skipped: `could not read the business: ${error.message}` };

  // NO LISTING, NO CALL, AND NO BILL — the common case, and the reason
  // this subsystem needs no flag.
  //
  // THE CHECK IS NOT REPEATED HERE. fetchPlaceDetails refuses an empty
  // id before it touches the network, with the same words, so a guard in
  // this function would be unreachable from any input — and mutation M14
  // proved it: deleting it changed nothing, because the call below still
  // refused. The same overlapping-guard fault as I1, I3, I5, G2 and G5.
  const result = await fetchPlaceDetails(dealership?.google_place_id, opts.fetcher);
  if (!result.ok) {
    console.error(`[place-snapshot] ${dealershipId}: ${result.reason}`);
    return { ...empty, skipped: result.reason };
  }

  const { error: writeError } = await supabase.from("place_snapshots").upsert(
    {
      dealership_id: dealershipId,
      place_id: result.details.placeId,
      place_name: result.details.name,
      place_address: result.details.address,
      place_phone: result.details.phone,
      fetched_at: new Date().toISOString(),
    },
    // dealership_id is the PRIMARY KEY (migration 225), so this conflict
    // target exists — the I5 lesson, where an onConflict named columns
    // with no unique index behind them and would have failed at runtime.
    { onConflict: "dealership_id" }
  );
  if (writeError) {
    console.error(`[place-snapshot] ${dealershipId}: could not store the snapshot: ${writeError.message}`);
    return { ...empty, skipped: `could not store the snapshot: ${writeError.message}` };
  }

  return { day, fetched: true, skipped: null };
}
