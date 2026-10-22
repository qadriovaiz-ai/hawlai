// READING A LEVEL OFF action_levels — S3/P3.
//
// Kept apart from `autonomyLevels.ts` on purpose: that file is pure
// decision logic with no I/O, which is what lets every rule in it be
// tested without a database. This is the one place that touches the
// table, and it has exactly one job — hand the pure logic what the row
// said, or nothing.
//
// EVERY FAILURE READS AS "NOTHING". A missing row, a database error, a
// level this build does not recognise: all come back null, and null
// means L0, which means ask. That is F-01's lesson applied to a new
// table — `facts ? guard() : skip` turned a guard off on a transient
// read error, and the same shape here would turn a GATE off. A site
// that cannot read its own permissions must ask, not act.

import type { AutonomyLevel } from "@/lib/autonomyLevels";

/** The levels this build understands. A row saying anything else is ignored. */
const KNOWN: AutonomyLevel[] = ["L0", "L1"];

/**
 * What `action_levels` holds for this business and action, or null.
 *
 * Null is not an error signal and does not need to be distinguished
 * from one by the caller: both mean the same thing to the only rule
 * that reads it.
 */
export async function readStoredLevel(
  supabase: any,
  dealershipId: string,
  actionKey: string
): Promise<AutonomyLevel | null> {
  try {
    const { data, error } = await supabase
      .from("action_levels")
      .select("level")
      .eq("dealership_id", dealershipId)
      .eq("action_key", actionKey)
      .maybeSingle();
    if (error || !data) return null;
    const level = String((data as any).level ?? "");
    return (KNOWN as string[]).includes(level) ? (level as AutonomyLevel) : null;
  } catch {
    // The table may not exist yet on an environment that has not run
    // migration 209. Reading that as "no level" is correct and is the
    // safe direction: everything keeps asking.
    return null;
  }
}
