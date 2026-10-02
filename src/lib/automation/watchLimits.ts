// How many competitors and topics a plan may watch.
//
// WHY A CAP AT ALL, and why this is the one that matters most: each watch
// is a searching Claude call every night, per watch, whether or not
// anyone reads the result. It is the only cost in the product that
// repeats forever without a person asking for it — one watch left on a
// free account bills every day for as long as the account exists.
//
// A watch over the cap is PAUSED, never deleted (migration 207). The
// owner typed that competitor's name; losing it on a plan change would
// be throwing away their work silently, and a paused watch costs nothing
// and comes straight back if they upgrade.

import type { PlanKey } from "@/lib/plans";

/**
 * Approved as "Free 0 / Basic 0 / Pro 1 / Max 3".
 *
 * The product has five tiers — free, basic, growth, pro, agency — so
 * "Pro 1" and "Max 3" are read literally: pro gets one, the top tier
 * gets three. GROWTH IS THE ONE I HAD TO DECIDE: it sits between basic
 * and pro and was not named, and I have given it nothing rather than
 * invent an allowance, because a cap that is too tight shows an upgrade
 * line and a cap that is too loose bills every night. Easy to change —
 * it is this constant and nothing else.
 */
export const WATCH_LIMIT: Record<PlanKey, number> = {
  free: 0,
  basic: 0,
  growth: 0,
  pro: 1,
  agency: 3,
};

export function watchesAllowed(plan: string | null | undefined): number {
  return WATCH_LIMIT[(plan ?? "free") as PlanKey] ?? 0;
}

/** What the owner is told when their plan has no room for another watch. */
export function watchLimitMessage(plan: string | null | undefined): string {
  const allowed = watchesAllowed(plan);
  return allowed === 0
    ? "Daily monitoring isn't included on this plan — it checks every watched competitor and topic overnight, every night. Upgrade to Pro to watch one, or Agency for three."
    : `Your plan watches ${allowed} at a time, checked overnight every night. Upgrade for more, or remove one you've stopped following.`;
}

export type WatchRow = { id: string; created_at?: string | null; paused?: boolean | null };

/**
 * Which watches run tonight and which are held.
 *
 * Oldest first, deterministically: the owner added them in an order and
 * the ones they set up first are the ones they have been reading. A
 * random or newest-first choice would move the pause around between
 * nights, so the same watch would report intermittently — worse than
 * either answer.
 */
export function splitByLimit<T extends WatchRow>(watches: T[], allowed: number): { active: T[]; paused: T[] } {
  const ordered = [...watches].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  return { active: ordered.slice(0, Math.max(0, allowed)), paused: ordered.slice(Math.max(0, allowed)) };
}

/**
 * Bring a business's watches in line with its plan.
 *
 * Idempotent and safe to run on every read: it only writes when a row's
 * paused flag is wrong, so a plan that has not changed costs nothing.
 */
export async function reconcileWatches(supabase: any, dealershipId: string, plan: string | null | undefined): Promise<{ paused: number; resumed: number }> {
  const allowed = watchesAllowed(plan);
  let paused = 0;
  let resumed = 0;

  for (const table of ["competitor_watches", "topic_watches"] as const) {
    const { data } = await supabase.from(table).select("id, created_at, paused").eq("dealership_id", dealershipId);
    const rows = (data ?? []) as WatchRow[];
    if (rows.length === 0) continue;
    const split = splitByLimit(rows, allowed);

    const toPause = split.paused.filter((w) => !w.paused).map((w) => w.id);
    const toResume = split.active.filter((w) => w.paused).map((w) => w.id);
    if (toPause.length) {
      await supabase.from(table).update({ paused: true }).in("id", toPause);
      paused += toPause.length;
    }
    if (toResume.length) {
      await supabase.from(table).update({ paused: false }).in("id", toResume);
      resumed += toResume.length;
    }
  }

  return { paused, resumed };
}
