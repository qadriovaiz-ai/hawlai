// Real, read-only checks that a connection works — H2 of
// docs/AUDIT-INTEGRATION-HEALTH.md, 27 November 2026.
//
// THE THREE WHERE THE LIE WAS ALREADY CAUGHT. Search Console said
// Connected on a token dead for 23 days. Instagram said connected while
// its token was invalidated (401, code 190) and its webhook had never been
// subscribed — zero DMs ever reached the product. The Facebook Page has
// the same subscription step and the same blind spot.
//
// EACH PROBE IS TWO QUESTIONS, because both failures were real:
//   1. does the credential still work?           — a "who am I" read
//   2. is the connection set up to do its job?   — the webhook
//                                                  subscription, the
//                                                  Search Console property
//
// THE RULES THAT MAKE THEM SAFE TO RUN UNATTENDED:
//   * READ ONLY. No probe subscribes, posts, submits or changes anything.
//     Fixing is the owner's reconnect; a probe only says what is true.
//   * NEVER THROWS. A probe returns a state; a network failure is
//     "not_responding", not an exception into the page that asked.
//   * A SHORT TIMEOUT, so one slow provider cannot hold up the
//     Integrations page.
//   * Never the token in a result, a log or a reason.

import { healthFromFailure, type Health } from "@/lib/integrations/healthState";
import { META_PAGE_TOKEN_SELECT, readMetaPageToken } from "@/lib/crypto/oauthSecrets";
import { FB_WEBHOOK_FIELDS, IG_WEBHOOK_FIELDS } from "@/lib/webhooks/subscribeWebhooks";
import {
  isPlatformProperty,
  listSites,
  readConnection,
  saveRefreshed,
  searchConsoleSelect,
  validAccessToken,
} from "@/lib/seo/searchConsole";

const FB_GRAPH = "https://graph.facebook.com/v19.0";
const IG_GRAPH = "https://graph.instagram.com/v26.0";
export const PROBE_TIMEOUT_MS = 6_000;

const WORKING: Health = { state: "working", reason: null };

/**
 * A probe's answer, plus what it SAW of the webhook subscription when it
 * looked. `subscribed` is set only by a probe that actually read it, and
 * the runner writes it to the connection's own columns (migration 227) —
 * so the stored record of "subscribed" stays what Meta last said, and the
 * screen can never contradict the live answer.
 */
export type ProbeResult = Health & {
  subscribed?: { ok: boolean; error: string | null };
  /**
   * Set when the stored Instagram account id is not the one Meta puts in
   * webhooks (28 Nov 2026). The runner corrects Hawlai's own column.
   */
  accountId?: { stored: string; actual: string };
};

/** A GET that never throws: the parsed body, or the reason it failed. */
async function read(url: string, headers: Record<string, string> = {}): Promise<{ ok: true; body: any } | { ok: false; reason: string }> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const body: any = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, body };
    // Meta puts its reason in error.message and its kind in error.type;
    // OAuthException is the one that means the credential is dead.
    const e = body?.error;
    const words = [e?.type, e?.code ? `code ${e.code}` : null, e?.message].filter(Boolean).join(": ");
    return { ok: false, reason: `${res.status}${words ? ` ${words}` : ""}` };
  } catch (err: any) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return { ok: false, reason: timedOut ? `no answer within ${PROBE_TIMEOUT_MS / 1000}s` : String(err?.message ?? err) };
  }
}

/** Which of the needed webhook fields a subscription is missing. */
export function missingFields(subscribed: unknown, needed: readonly string[]): string[] {
  const have = new Set((Array.isArray(subscribed) ? subscribed : []).map((f: any) => String(f?.name ?? f)));
  return needed.filter((f) => !have.has(f));
}

// ---------------------------------------------------------------------
// Instagram (Instagram Login)
// ---------------------------------------------------------------------

export async function probeInstagram(service: any, dealershipId: string): Promise<ProbeResult> {
  const { data: row, error } = await service
    .from("dealerships")
    .select("instagram_business_id, instagram_access_token")
    .eq("id", dealershipId)
    .maybeSingle();
  if (error) return { state: "not_responding", reason: `couldn't read the stored connection: ${error.message}` };
  const token = row?.instagram_access_token;
  if (!row?.instagram_business_id) return { state: "unchecked", reason: "no Instagram account is linked" };
  if (!token) return { state: "needs_reconnect", reason: "an Instagram account is linked but no access token is stored" };

  const auth = { Authorization: `Bearer ${token}` };
  const me = await read(`${IG_GRAPH}/me?fields=user_id,username`, auth);
  if (!me.ok) return healthFromFailure(me.reason);

  // THE ID META ROUTES BY (28 Nov 2026). Webhooks name the account by its
  // `user_id`; connections made before that date stored the app-scoped
  // `id` instead, so every DM came back "no_business_matched". Reported
  // here, corrected by the runner — the same split as the subscription.
  const actualId = me.body?.user_id != null ? String(me.body.user_id) : "";
  const storedId = String(row.instagram_business_id);
  const accountId = actualId && actualId !== storedId ? { stored: storedId, actual: actualId } : undefined;

  // THE WEBHOOK. Without `messages` here, Meta never sends a DM to Hawlai —
  // which is exactly what happened in production until 27 Nov 2026.
  // The same `/{id}/subscribed_apps` edge the connect callback POSTs to.
  const subs = await read(`${IG_GRAPH}/${encodeURIComponent(row.instagram_business_id)}/subscribed_apps`, auth);
  if (!subs.ok) return healthFromFailure(subs.reason);
  const apps: any[] = Array.isArray(subs.body?.data) ? subs.body.data : [];
  const fields = apps.flatMap((a) => a?.subscribed_fields ?? []);
  const missing = missingFields(fields, IG_WEBHOOK_FIELDS);
  if (missing.length) {
    const reason = apps.length
      ? `Instagram is connected but not sending ${missing.join(" and ")} to Hawlai — reconnect it once to fix this`
      : "Instagram is connected but was never set up to send messages to Hawlai, so DMs never arrive — reconnect it once to fix this";
    return { state: "incomplete", reason, subscribed: { ok: false, error: `not subscribed to ${missing.join(", ")}` }, accountId };
  }
  return { ...WORKING, subscribed: { ok: true, error: null }, accountId };
}

// ---------------------------------------------------------------------
// Facebook Page
// ---------------------------------------------------------------------

export async function probeMetaPage(service: any, dealershipId: string): Promise<ProbeResult> {
  const { data: row, error } = await service
    .from("dealerships")
    .select(`fb_page_id, ${META_PAGE_TOKEN_SELECT}`)
    .eq("id", dealershipId)
    .maybeSingle();
  if (error) return { state: "not_responding", reason: `couldn't read the stored connection: ${error.message}` };
  const pageId = row?.fb_page_id;
  if (!pageId) return { state: "unchecked", reason: "no Facebook Page is linked" };
  let token: string | null = null;
  try {
    token = readMetaPageToken(row);
  } catch (err: any) {
    return { state: "needs_reconnect", reason: `the stored Page token could not be read: ${err?.message ?? err}` };
  }
  if (!token) return { state: "needs_reconnect", reason: "a Facebook Page is linked but no Page token is stored" };

  const q = `access_token=${encodeURIComponent(token)}`;
  const page = await read(`${FB_GRAPH}/${encodeURIComponent(pageId)}?fields=id&${q}`);
  if (!page.ok) return healthFromFailure(page.reason);

  const subs = await read(`${FB_GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps?${q}`);
  if (!subs.ok) return healthFromFailure(subs.reason);
  const apps: any[] = Array.isArray(subs.body?.data) ? subs.body.data : [];
  // ONLY THIS APP COUNTS. A Page subscribed to someone else's app still
  // sends Hawlai nothing.
  const appId = process.env.FACEBOOK_APP_ID ?? "";
  const ours = apps.find((a) => String(a?.id ?? "") === appId) ?? null;
  const missing = missingFields(ours?.subscribed_fields ?? [], FB_WEBHOOK_FIELDS);
  if (!ours) {
    return {
      state: "incomplete",
      reason: "The Facebook Page is connected but was never set up to send messages and comments to Hawlai — reconnect it once to fix this",
      subscribed: { ok: false, error: "Hawlai's app is not subscribed to this Page" },
    };
  }
  if (missing.length) {
    return {
      state: "incomplete",
      reason: `The Facebook Page is connected but not sending ${missing.join(" and ")} to Hawlai — reconnect it once to fix this`,
      subscribed: { ok: false, error: `not subscribed to ${missing.join(", ")}` },
    };
  }
  return { ...WORKING, subscribed: { ok: true, error: null } };
}

// ---------------------------------------------------------------------
// Google Search Console
// ---------------------------------------------------------------------

const SEARCH_CONSOLE_WRITE = "https://www.googleapis.com/auth/webmasters";

export async function probeSearchConsole(service: any, dealershipId: string): Promise<Health> {
  const { data: row, error } = await service.from("dealerships").select(searchConsoleSelect()).eq("id", dealershipId).maybeSingle();
  if (error) return { state: "not_responding", reason: `couldn't read the stored connection: ${error.message}` };
  const conn = readConnection(row);
  if (!conn) return { state: "unchecked", reason: "Search Console is not linked" };

  // The refresh IS the credential check when the token is due: a dead
  // grant answers invalid_grant here, which is the 4 November failure.
  let accessToken: string;
  try {
    const valid = await validAccessToken(conn);
    accessToken = valid.accessToken;
    if (valid.refreshed) await saveRefreshed(service, dealershipId, valid.refreshed);
  } catch (err: any) {
    return healthFromFailure(err?.message);
  }

  let sites;
  try {
    sites = await listSites(accessToken);
  } catch (err: any) {
    return healthFromFailure(err?.message);
  }
  if (!conn.siteUrl) {
    return { state: "incomplete", reason: "No verified property matched this business yet — add your site in Search Console, then press Reconnect" };
  }
  // THE PROPERTY MUST STILL BE THERE. Access can be removed at Google
  // without the token dying, and then every read returns nothing.
  if (!sites.some((s) => s.siteUrl === conn.siteUrl)) {
    return { state: "incomplete", reason: `This Google account can no longer see ${conn.siteUrl} — check its access in Search Console, then press Reconnect` };
  }

  // ITS OWN DOMAIN NEEDS WRITE ACCESS to have its sitemap submitted
  // (27 Nov 2026). A connection made before the scope was widened still
  // reads fine — so this is "incomplete", not broken, and says why.
  if (!isPlatformProperty(conn.siteUrl)) {
    const info = await read(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    const scopes = info.ok ? String(info.body?.scope ?? "").split(/\s+/) : [];
    if (info.ok && !scopes.includes(SEARCH_CONSOLE_WRITE)) {
      return {
        state: "incomplete",
        reason: "Search Console reads fine, but was connected with read-only access, so Hawlai can't submit your sitemap — reconnect it once to fix this",
      };
    }
  }
  return WORKING;
}

// ---------------------------------------------------------------------

/** The probe for each registry key that has one. */
export const PROBES: Record<string, (service: any, dealershipId: string) => Promise<ProbeResult>> = {
  instagram: probeInstagram,
  meta_page: probeMetaPage,
  search_console: probeSearchConsole,
};

/** Run one probe; a probe that throws anyway is "not_responding", never an exception. */
export async function runProbe(service: any, dealershipId: string, key: string): Promise<ProbeResult> {
  const probe = PROBES[key];
  if (!probe) return { state: "unchecked", reason: `no probe exists for ${key}` };
  try {
    return await probe(service, dealershipId);
  } catch (err: any) {
    return { state: "not_responding", reason: `the check itself failed: ${err?.message ?? err}` };
  }
}

// ---------------------------------------------------------------------
// Running them
// ---------------------------------------------------------------------

/** How long a probe's answer is trusted before the page asks again. */
export const FRESH_FOR_MS = 10 * 60 * 1000;

/** The connection's own record of its webhook subscription (migration 227). */
const SUBSCRIPTION_COLUMNS: Record<string, { at: string; error: string }> = {
  instagram: { at: "ig_webhook_subscribed_at", error: "ig_webhook_error" },
  meta_page: { at: "fb_webhook_subscribed_at", error: "fb_webhook_error" },
};

/**
 * Probe one integration, record what it found, and bring the stored
 * subscription record in line with what Meta just said.
 *
 * The subscription write is to HAWLAI'S OWN columns, never to Meta: a
 * probe still changes nothing at the provider.
 */
export async function probeAndRecord(service: any, dealershipId: string, key: string, now: Date = new Date()) {
  const { recordHealth } = await import("@/lib/integrations/health");
  const found = await runProbe(service, dealershipId, key);
  const { subscribed, accountId, ...probed } = found;
  let health: Health = probed;

  // THE STORED ACCOUNT ID, CORRECTED TO THE ONE META ROUTES BY. A write to
  // Hawlai's own column, never to Meta. Refused when another business
  // already holds that id: one account's DMs routed to two businesses is
  // worse than routed to none, and that case needs a person.
  if (key === "instagram" && accountId) {
    health = await correctInstagramId(service, dealershipId, accountId.actual, health);
  }
  await recordHealth(service, dealershipId, key, health, now);

  const cols = SUBSCRIPTION_COLUMNS[key];
  if (cols && subscribed) {
    // Seen subscribed: keep the original date if there is one. Seen NOT
    // subscribed: say so, so the screen shows it even before a reconnect.
    const update = subscribed.ok
      ? service.from("dealerships").update({ [cols.error]: null, [cols.at]: now.toISOString() }).eq("id", dealershipId).is(cols.at, null)
      : service.from("dealerships").update({ [cols.at]: null, [cols.error]: subscribed.error }).eq("id", dealershipId);
    const { error } = await update;
    if (error) console.error(`[integration-health] couldn't record ${key}'s subscription for ${dealershipId}: ${error.message}`);
    // A subscription already dated is left alone, and that is not an error.
    if (subscribed.ok && !error) {
      await service.from("dealerships").update({ [cols.error]: null }).eq("id", dealershipId);
    }
  }
  return health;
}

/** Point the stored Instagram account id at the one webhooks use. */
async function correctInstagramId(service: any, dealershipId: string, actualId: string, health: Health): Promise<Health> {
  const unroutable = (why: string): Health => ({
    state: "incomplete",
    reason: `Instagram messages can't be matched to this business: ${why}`,
  });
  try {
    const { data: holder, error: holderError } = await service
      .from("dealerships")
      .select("id")
      .eq("instagram_business_id", actualId)
      .neq("id", dealershipId)
      .maybeSingle();
    if (holderError) return unroutable(`couldn't check the account id (${holderError.message})`);
    if (holder) return unroutable("this Instagram account is already linked to another business on Hawlai");
    const { error } = await service.from("dealerships").update({ instagram_business_id: actualId }).eq("id", dealershipId);
    if (error) return unroutable(`the stored account id is out of date and couldn't be corrected (${error.message})`);
    console.error(`[integration-health] corrected ${dealershipId}'s Instagram account id to the one Meta's webhooks use`);
    return health;
  } catch (err: any) {
    return unroutable(`the account id couldn't be corrected (${err?.message ?? err})`);
  }
}

/**
 * Probe every linked integration whose answer is older than FRESH_FOR_MS,
 * in parallel, and return the fresh answers by key.
 *
 * For the Integrations page: the owner opening it is the moment they want
 * the truth. Never throws — a page must render whatever happens here.
 */
export async function refreshStaleProbes(
  dealershipId: string,
  linkedKeys: string[],
  storedCheckedAt: Map<string, string | null>,
  now: Date = new Date()
): Promise<string[]> {
  const stale = linkedKeys.filter((key) => {
    if (!PROBES[key]) return false;
    const at = storedCheckedAt.get(key);
    const t = at ? Date.parse(at) : NaN;
    return !Number.isFinite(t) || now.getTime() - t > FRESH_FOR_MS;
  });
  if (!stale.length) return [];
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const service = createServiceClient();
    await Promise.all(stale.map((key) => probeAndRecord(service, dealershipId, key, now)));
  } catch (err: any) {
    console.error(`[integration-health] probing ${stale.join(", ")} for ${dealershipId} failed: ${err?.message ?? err}`);
  }
  return stale;
}
