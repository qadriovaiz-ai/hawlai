// Recording and reading whether integrations WORK — H1 of
// docs/AUDIT-INTEGRATION-HEALTH.md, 27 November 2026.
//
// ONE PLACE WRITES a connection's state, and every source of evidence goes
// through it: a live check on a status route (H0's Shopify and
// WooCommerce), a probe (H2 onward), and every real use that succeeds or
// fails (the search sync, a DM reply, a page edit). Passive evidence is
// free and the most truthful there is.
//
// THE OWNER IS TOLD ONCE, ON THE WAY DOWN. A move into a broken state
// raises the existing `integration_disconnected` notification — unless it
// was already broken, so a dead connection checked every morning is one
// message, not one a day. That is the rule Search Console's
// tellOwnerItDied already followed, now shared. An unreadable history
// tells him — but only once the new state has been stored, or there
// would be no memory that he was told.
//
// NEVER THROWS. Recording health is bookkeeping beside the real work; a
// failure here must not become the reason a sync or a reply fails. Every
// write's error is READ and logged — this file exists because errors were
// being discarded.

import { isBroken, type Health, type HealthState } from "@/lib/integrations/healthState";
import { integration, type StoredHealth } from "@/lib/integrations/registry";

export type RecordResult = { recorded: boolean; notified: boolean };

/**
 * Write what was just found about one integration for one business.
 *
 * `service` must be the SERVICE client: integration_health has no INSERT
 * or UPDATE policy (migration 239), so an owner's session is refused.
 */
export async function recordHealth(
  service: any,
  dealershipId: string,
  key: string,
  health: Health,
  now: Date = new Date(),
  /**
   * false for a caller that already tells the owner its own way — the
   * search sync's tellOwnerItDied, pinned by tests/searchConsoleDeath.
   * Two notifications for one dead connection would be noise.
   */
  opts: { notify?: boolean } = {}
): Promise<RecordResult> {
  const label = integration(key).label;
  try {
    const { data: previous, error: readError } = await service
      .from("integration_health")
      .select("state")
      .eq("dealership_id", dealershipId)
      .eq("integration", key)
      .maybeSingle();
    if (readError) console.error(`[integration-health] couldn't read ${key} for ${dealershipId}: ${readError.message}`);

    const at = now.toISOString();
    const { error: writeError } = await service.from("integration_health").upsert(
      {
        dealership_id: dealershipId,
        integration: key,
        state: health.state,
        reason: health.state === "working" ? null : health.reason,
        checked_at: at,
        ...(health.state === "working" ? { last_ok_at: at } : {}),
      },
      { onConflict: "dealership_id,integration" }
    );
    if (writeError) {
      console.error(`[integration-health] couldn't record ${key}=${health.state} for ${dealershipId}: ${writeError.message}`);
    }

    // ONCE, ON THE WAY DOWN. Already broken → already told.
    //
    // AND ONLY WHEN THIS WAS WRITTEN. The "already told" memory IS the
    // row: if it could not be stored — the migration not yet run, a
    // refused write — the next check cannot know it already notified, and
    // a broken store would raise a fresh notification on every page load.
    // Silence for one check is cheaper than a notification per refresh.
    let notified = false;
    const wasBroken = !readError && isBroken(previous?.state as HealthState | undefined);
    if (opts.notify !== false && isBroken(health.state) && !wasBroken && !writeError) {
      notified = await tellOwner(service, dealershipId, label, health);
    }
    return { recorded: !writeError, notified };
  } catch (err: any) {
    console.error(`[integration-health] recording ${key} for ${dealershipId} failed: ${err?.message ?? err}`);
    return { recorded: false, notified: false };
  }
}

async function tellOwner(service: any, dealershipId: string, label: string, health: Health): Promise<boolean> {
  try {
    const { emitNotification } = await import("@/lib/notifications/emit");
    await emitNotification(service, {
      dealershipId,
      kind: "integration_disconnected",
      title: health.state === "needs_reconnect" ? `${label} needs reconnecting` : `${label} isn't responding`,
      // THE PROVIDER'S OWN WORDS — they are what tells the owner whether
      // reconnecting is the whole fix.
      body:
        health.state === "needs_reconnect"
          ? `${label} refused Hawlai's access, so anything that depends on it has stopped. Reconnect it in Integrations. It said: ${health.reason ?? "no reason given"}`
          : `${label} didn't answer when Hawlai tried to use it. This may pass on its own. It said: ${health.reason ?? "no reason given"}`,
      href: "/dashboard/settings/integrations",
    });
    return true;
  } catch (err: any) {
    console.error(`[integration-health] couldn't tell ${dealershipId} about ${label}: ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Every stored state for one business, by integration key.
 *
 * Takes the OWNER'S client on the Integrations page — the select policy
 * lets an owner read their own rows. A failed read is an empty map, which
 * the screen shows as "not checked yet": never as Connected.
 */
export async function readHealth(supabase: any, dealershipId: string): Promise<Map<string, StoredHealth>> {
  const out = new Map<string, StoredHealth>();
  try {
    const { data, error } = await supabase
      .from("integration_health")
      .select("integration, state, reason, checked_at")
      .eq("dealership_id", dealershipId);
    if (error) {
      console.error(`[integration-health] couldn't read states for ${dealershipId}: ${error.message}`);
      return out;
    }
    for (const r of data ?? []) out.set(String(r.integration), { state: r.state, reason: r.reason ?? null, checked_at: r.checked_at ?? null });
  } catch (err: any) {
    console.error(`[integration-health] couldn't read states for ${dealershipId}: ${err?.message ?? err}`);
  }
  return out;
}

/**
 * recordHealth through the SERVICE client, for callers that hold only an
 * owner's session — a status route. Creating the client happens inside
 * the guard, so a missing server key is a logged line, not a failed page.
 */
export async function recordHealthAsService(
  dealershipId: string,
  key: string,
  health: Health,
  opts: { notify?: boolean } = {}
): Promise<RecordResult> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    return await recordHealth(createServiceClient(), dealershipId, key, health, new Date(), opts);
  } catch (err: any) {
    console.error(`[integration-health] couldn't record ${key} for ${dealershipId}: ${err?.message ?? err}`);
    return { recorded: false, notified: false };
  }
}
