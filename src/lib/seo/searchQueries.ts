// Reading the real searches, storing them, and saying what they mean
// (Brain, Phase 4 step 2, migration 201).
//
// Every number here is Google's, stored as given. Nothing in this file
// estimates a volume, and nothing multiplies anything by a benchmark —
// the reason this exists is that the SEO work it replaces was guessed.

import { recordSignal, fingerprintOf } from "@/lib/signals/signals";
import {
  searchConsoleSelect,
  readConnection,
  validAccessToken,
  saveRefreshed,
  fetchQueries,
  isPlatformProperty,
  sitePageFilter,
  type QueryRow,
} from "./searchConsole";

/** Google settles its figures a few days late; a window ending today is mostly empty. */
export const LAG_DAYS = 3;
export const WINDOW_DAYS = 28;
/** Impressions a query needs before it is worth naming to the owner. */
export const MIN_IMPRESSIONS = 10;
/** Being seen this often with no clicks at all is the clearest gap there is. */
export const MIN_IMPRESSIONS_NO_CLICKS = 20;
/** Positions 4-20: found, but below where people actually click. */
export const NEARLY_THERE = { from: 4, to: 20 };

export type SyncResult = {
  stored: number;
  window: { from: string; to: string };
  skipped?: string;
};

function day(offsetDays: number, now: Date): string {
  return new Date(now.getTime() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export function windowFor(now: Date = new Date()): { from: string; to: string } {
  return { from: day(LAG_DAYS + WINDOW_DAYS, now), to: day(LAG_DAYS, now) };
}

/**
 * Pulls this business's search terms and stores them.
 *
 * Returns a reason rather than throwing when there is nothing to read:
 * most businesses have not connected Search Console, and that is not a
 * failure of anything.
 */
/**
 * Tell the owner once, on the day it breaks, and not every morning
 * after.
 *
 * ONLY WHEN THE LAST RUN SUCCEEDED. A notification a day about the same
 * dead connection is a notification he learns to ignore, which is the
 * same end state as not telling him. `automation_run_log` already holds
 * one row per subsystem per run — written by runAndLog AFTER the runner
 * returns, so the newest row is the PREVIOUS run — which makes "is this
 * break new" a single read.
 *
 * AND AN UNREADABLE HISTORY TELLS HIM ANYWAY. If that read fails there
 * is no way to know whether he has been told, and the cost of one extra
 * notification is nothing beside the cost of silence.
 */
async function tellOwnerItDied(service: any, dealershipId: string, reason: string): Promise<void> {
  try {
    const { data, error } = await service
      .from("automation_run_log")
      .select("success")
      .eq("dealership_id", dealershipId)
      .eq("subsystem", "search_console_sync")
      .order("created_at", { ascending: false })
      .limit(1);
    const previous = Array.isArray(data) ? data[0] : null;
    if (!error && previous && previous.success === false) return;

    const { emitNotification } = await import("@/lib/notifications/emit");
    await emitNotification(service, {
      dealershipId,
      kind: "integration_disconnected",
      title: "Search Console needs reconnecting",
      // THE PROVIDER'S OWN REASON, QUOTED. "invalid_grant" means the
      // permission was withdrawn or expired at Google's end, and that
      // is the difference between "press reconnect" and "something is
      // wrong with Hawlai".
      body: `I can't read your Google Search Console data any more, so your real search terms have stopped updating. Google said: ${reason}`,
      href: "/dashboard/settings/integrations",
    });
    console.error(`[search-queries] told ${dealershipId} that Search Console needs reconnecting: ${reason}`);
  } catch (err: any) {
    // NEVER THE REASON A JOB FAILS DIFFERENTLY. The throw this rides
    // beside is the real failure; this is the telling, and a telling
    // that changed the error would hide the thing it is about.
    console.error(`[search-queries] could not tell ${dealershipId} that Search Console died: ${err?.message ?? err}`);
  }
}

export async function syncSearchQueries(service: any, dealershipId: string, now: Date = new Date()): Promise<SyncResult> {
  const window = windowFor(now);
  const { data: row } = await service
    .from("dealerships")
    .select(searchConsoleSelect())
    .eq("id", dealershipId)
    .maybeSingle();

  const conn = readConnection(row);
  if (!conn) return { stored: 0, window, skipped: "Search Console isn't connected" };
  if (!conn.siteUrl) return { stored: 0, window, skipped: "no verified property is selected for this business" };

  // WHICH PAGES THIS BUSINESS OWNS, and the answer decides whether we
  // read at all.
  //
  // Every storefront lives at hawlai.online/site/{slug}, so the platform
  // property reports on all of them together. Without a filter, one
  // business's dashboard shows the searches that reached another's shop.
  //
  // FAILS CLOSED. No website row, or a website with no slug, means there
  // is no way to tell this business's pages from anyone else's — so
  // nothing is fetched. A missing slug must never quietly mean
  // "everything".
  let pageFilter: string | null = null;
  if (isPlatformProperty(conn.siteUrl)) {
    const { data: site } = await service.from("websites").select("slug").eq("dealership_id", dealershipId).maybeSingle();
    const slug = String(site?.slug ?? "").trim();
    if (!slug) {
      return { stored: 0, window, skipped: "this business has no Hawlai website yet, so there are no pages of its own to read searches for" };
    }
    pageFilter = sitePageFilter(slug);
  }

  // A DEAD CONNECTION REACHES THE OWNER — 6 November 2026.
  //
  // This threw, `runAndLog` recorded the failure, and that was the end
  // of it: the only trace was an error string on a row nobody reads.
  // candle_by_qaaf's Search Console died on 4 November and he found out
  // on the 6th, by asking why an email was missing — and this is the
  // subsystem that measures everything the local-search plan is about.
  //
  // IT STILL THROWS. The job must stay red, or the health panel starts
  // reporting a clean run for a subsystem that read nothing. What is
  // added is the telling.
  let accessToken: string;
  let refreshed: { accessToken: string; expiry: string } | undefined;
  try {
    const valid = await validAccessToken(conn);
    accessToken = valid.accessToken;
    refreshed = valid.refreshed;
  } catch (err: any) {
    await tellOwnerItDied(service, dealershipId, String(err?.message ?? err));
    throw err;
  }
  if (refreshed) await saveRefreshed(service, dealershipId, refreshed);

  const rows = await fetchQueries(accessToken, conn.siteUrl, window, pageFilter);
  if (rows.length === 0) {
    await recordNoDataSignal(service, dealershipId, window);
    return { stored: 0, window, skipped: "Google returned no searches for this window" };
  }

  const { error } = await service.from("search_queries").upsert(
    rows.map((r) => ({
      dealership_id: dealershipId,
      query: r.query,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
      window_from: window.from,
      window_to: window.to,
      fetched_at: now.toISOString(),
      // What this row was confined to when it was read: the page regex
      // for a shop on the platform domain, or the property itself for a
      // business reading its OWN domain, where the property is already
      // the scope. Always set, so `page_filter is null` means exactly
      // one thing — written before scoping existed, when a read covered
      // the whole of hawlai.online and nothing in the numbers said so.
      page_filter: pageFilter ?? conn.siteUrl,
    })),
    { onConflict: "dealership_id,query,window_from,window_to" }
  );
  if (error) return { stored: 0, window, skipped: `couldn't store the searches: ${error.message}` };

  await recordSearchSignals(service, dealershipId, rows, window);
  return { stored: rows.length, window };
}

/**
 * The stored terms for the latest window, biggest first.
 *
 * SCOPED ROWS ONLY. Every row written before 2026-09-30 came from an
 * unfiltered read of the whole hawlai.online property, so its numbers
 * include other businesses' shops and Hawlai's own pages — and nothing in
 * the numbers themselves says so. page_filter records what a row was
 * confined to; a row without one predates scoping and can never be shown
 * to anybody.
 *
 * This is what makes the guarantee structural rather than procedural: the
 * three readers downstream of here — the SEO toolkit, opportunityAgent
 * and strategy/fitInput — all come through this function, so none of them
 * can see an un-scoped row even if the cleanup is delayed or a row is
 * missed.
 */
export async function topQueries(service: any, dealershipId: string, limit = 20): Promise<QueryRow[]> {
  try {
    const { data } = await service
      .from("search_queries")
      .select("query, clicks, impressions, ctr, position, window_to")
      .eq("dealership_id", dealershipId)
      .not("page_filter", "is", null)
      .order("window_to", { ascending: false })
      .order("impressions", { ascending: false })
      .limit(limit * 3);

    const rows = data ?? [];
    if (rows.length === 0) return [];
    // Only the most recent window, so two windows never blend into one
    // list where the same term appears twice with different numbers.
    const latest = rows[0].window_to;
    return rows
      .filter((r: any) => r.window_to === latest)
      .slice(0, limit)
      .map((r: any) => ({
        query: r.query,
        clicks: Number(r.clicks) || 0,
        impressions: Number(r.impressions) || 0,
        ctr: Number(r.ctr) || 0,
        position: Number(r.position) || 0,
      }));
  } catch (err: any) {
    console.error("[search-queries] topQueries failed:", err?.message);
    return [];
  }
}

/** Terms this business is already seen for but isn't getting clicked on. */
export function gaps(rows: QueryRow[]): { seenNotClicked: QueryRow[]; nearlyThere: QueryRow[] } {
  const seenNotClicked = rows
    .filter((r) => r.clicks === 0 && r.impressions >= MIN_IMPRESSIONS_NO_CLICKS)
    .sort((a, b) => b.impressions - a.impressions);
  const nearlyThere = rows
    .filter((r) => r.impressions >= MIN_IMPRESSIONS && r.position >= NEARLY_THERE.from && r.position <= NEARLY_THERE.to)
    .sort((a, b) => a.position - b.position);
  return { seenNotClicked, nearlyThere };
}

async function recordNoDataSignal(service: any, dealershipId: string, window: { from: string; to: string }): Promise<void> {
  await recordSignal(service, dealershipId, {
    source: "seo",
    topic: "search demand",
    summary: `Google recorded no searches reaching this business between ${window.from} and ${window.to}`,
    evidence: { queries: 0, from: window.from, to: window.to },
    confidence: "counted",
    fingerprint: fingerprintOf(["seo", "search demand"]),
  });
}

/**
 * What the searches say, filed for the other departments (migration 198).
 *
 * All `counted` — these are Google's figures about this business's own
 * site. The signals deliberately state the numbers and stop there: what
 * to DO about a term being seen and not clicked is Strategy's job, and
 * it has the numbers to reason from.
 */
export async function recordSearchSignals(
  service: any,
  dealershipId: string,
  rows: QueryRow[],
  window: { from: string; to: string }
): Promise<void> {
  const clicks = rows.reduce((n, r) => n + r.clicks, 0);
  const impressions = rows.reduce((n, r) => n + r.impressions, 0);
  const named = rows.filter((r) => r.impressions >= MIN_IMPRESSIONS).sort((a, b) => b.impressions - a.impressions);

  await recordSignal(service, dealershipId, {
    source: "seo",
    topic: "search demand",
    summary: named.length
      ? `${rows.length} search terms reached this business in 28 days — ${impressions} times seen, ${clicks} clicked. Most seen: "${named[0].query}"`
      : `${rows.length} search terms reached this business in 28 days, none of them seen more than ${MIN_IMPRESSIONS} times — too little to read anything into yet`,
    evidence: {
      queries: rows.length,
      impressions,
      clicks,
      ...(named.length ? { topQuery: named[0].query, topQueryImpressions: named[0].impressions, topQueryClicks: named[0].clicks } : {}),
      from: window.from,
      to: window.to,
    },
    confidence: "counted",
    fingerprint: fingerprintOf(["seo", "search demand"]),
  });

  const { seenNotClicked, nearlyThere } = gaps(rows);

  if (seenNotClicked.length) {
    const top = seenNotClicked[0];
    await recordSignal(service, dealershipId, {
      source: "seo",
      topic: "seen but not clicked",
      summary: `"${top.query}" showed this business ${top.impressions} times and was never clicked`,
      evidence: { query: top.query, impressions: top.impressions, position: top.position, alsoAffected: seenNotClicked.slice(1, 4).map((r) => r.query) },
      confidence: "counted",
      fingerprint: fingerprintOf(["seo", "seen but not clicked"]),
    });
  }

  if (nearlyThere.length) {
    const top = nearlyThere[0];
    await recordSignal(service, dealershipId, {
      source: "seo",
      topic: "nearly ranking",
      summary: `"${top.query}" sits at position ${Math.round(top.position * 10) / 10} — found, but below where people click`,
      evidence: { query: top.query, position: top.position, impressions: top.impressions, clicks: top.clicks, alsoAffected: nearlyThere.slice(1, 4).map((r) => r.query) },
      confidence: "counted",
      fingerprint: fingerprintOf(["seo", "nearly ranking"]),
    });
  }
}

/** The real terms as prompt text, for a generator that would otherwise guess. */
export function formatQueriesForPrompt(rows: QueryRow[]): string {
  if (rows.length === 0) return "";
  const lines = rows
    .slice(0, 20)
    .map((r) => `- "${r.query}" — seen ${r.impressions} time${r.impressions === 1 ? "" : "s"}, clicked ${r.clicks}, average position ${Math.round(r.position * 10) / 10}`);
  return [
    "## The searches people REALLY used to find this business (Google Search Console, last 28 days)",
    "These are Google's own counts, not estimates. Use them as the basis of your answer, quote them exactly as written, and never invent a search volume or a ranking figure that isn't here.",
    ...lines,
  ].join("\n");
}
