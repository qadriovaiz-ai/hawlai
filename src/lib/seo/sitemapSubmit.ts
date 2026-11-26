// Telling Google about the sitemap, with nobody doing it by hand.
//
// WHY THIS EXISTS, measured on 26 November 2026 by running the real
// search sync once: the sync was healthy, the token valid, Google's API
// answered 200 — and it stored nothing, because Google had NEVER SEEN
// THE SHOP. URL Inspection said "URL is unknown to Google" for
// hawlai.online/site/candle-by-qaaf on both hosts, and the property's
// submitted-sitemaps list was empty. The live sitemap.xml was fine and
// robots.txt named it; nothing had ever told Google to come.
//
// THE FOUNDER'S STANDING RULE, 27 November 2026: nothing in Hawlai
// should send a business owner to another tool for their own business.
// Submitting the sitemap was a manual Search Console step, so it is now
// done here, on publish and again every day.
//
// WHOSE CREDENTIAL, AND WHY NOT THE OWNER'S. Every storefront lives at
// hawlai.online/site/{slug}, and hawlai.online is a property only the
// PLATFORM owns. A business owner's own Google account will never hold
// it, so no scope on their token — read-only or write — could ever
// submit this sitemap. The platform submits it, as a service account
// that is an owner of the platform property, and ONE sitemap covers
// every published shop because sitemap.xml lists them all.
//
// WHAT THIS DOES NOT DO: "request indexing". There is no legitimate API
// for it on ordinary pages. Google's Indexing API is restricted by its
// own terms to JobPosting and livestream BroadcastEvent pages, and the
// URL Inspection API only reads. A submitted sitemap is the supported
// way to ask Google to crawl, and it is the whole of what is possible.

import { createSign } from "node:crypto";
import { platformHost, isPlatformProperty, readConnection, searchConsoleSelect, validAccessToken, saveRefreshed } from "@/lib/seo/searchConsole";
import { getActionPolicy } from "@/lib/executionPolicy";

const API = "https://www.googleapis.com/webmasters/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** The scope that can submit a sitemap. webmasters.readonly cannot. */
export const WRITE_SCOPE = "https://www.googleapis.com/auth/webmasters";

/** The env var holding the service account's JSON key. */
export const PLATFORM_CREDENTIAL_ENV = "GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT";

/** The registry key this action is classified under (CLAUDE.md rule 6). */
export const SUBMIT_SITEMAP_ACTION = "submit_sitemap";

/** The event a publish queues, and the dispatcher hands to this file. */
export const SITE_PUBLISHED_EVENT = "site_published";

/** Queued when a business connects Search Console on its own domain. */
export const SEARCH_CONSOLE_CONNECTED_EVENT = "search_console_connected";

/**
 * Publish actions whose site is the BUSINESS'S OWN DOMAIN. A change
 * there is a reason to tell Google about that domain's sitemap; a change
 * on hawlai_site or hawlai_shop is covered by the platform sitemap.
 */
export const OWN_DOMAIN_PLATFORMS: ReadonlySet<string> = new Set(["shopify", "wordpress"]);

/** The platform's own property. Overridable for a URL-prefix property. */
export function platformProperty(env?: Record<string, string | undefined>): string {
  // Spelled out as a literal environment read, not through a variable,
  // so tests/envExample.test.ts can see the documented name is used.
  const set = String((env ? env.SEARCH_CONSOLE_PLATFORM_PROPERTY : process.env.SEARCH_CONSOLE_PLATFORM_PROPERTY) ?? "").trim();
  return set || `sc-domain:${platformHost()}`;
}

/** The one sitemap that lists every published shop. */
export function platformSitemapUrl(): string {
  return `https://${platformHost()}/sitemap.xml`;
}

type ServiceAccount = { client_email: string; private_key: string };

/**
 * The service account from its env var.
 *
 * null when unset, an error when set but unusable — those are different
 * faults with different fixes, and "the JSON is malformed" must never
 * read as "nobody configured it".
 */
export function readServiceAccount(raw: string | undefined): ServiceAccount | { error: string } | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: `${PLATFORM_CREDENTIAL_ENV} is set but is not valid JSON` };
  }
  const email = String(parsed?.client_email ?? "").trim();
  // A key pasted through a dashboard sometimes keeps "\n" as two
  // characters; PEM needs real line breaks.
  const key = String(parsed?.private_key ?? "").replace(/\\n/g, "\n").trim();
  if (!email || !key.includes("PRIVATE KEY")) {
    return { error: `${PLATFORM_CREDENTIAL_ENV} has no client_email or private_key` };
  }
  return { client_email: email, private_key: key };
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** The signed JWT Google exchanges for an access token (RFC 7523). */
export function signedAssertion(sa: ServiceAccount, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: WRITE_SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  return `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
}

type Fetch = typeof fetch;

async function platformAccessToken(sa: ServiceAccount, fetchImpl: Fetch, now: Date): Promise<{ token: string } | { error: string }> {
  try {
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signedAssertion(sa, Math.floor(now.getTime() / 1000)),
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) {
      const why = [data?.error, data?.error_description].filter(Boolean).join(": ") || `HTTP ${res.status}`;
      return { error: `Google refused the platform credential (${why})` };
    }
    return { token: String(data.access_token) };
  } catch (err: any) {
    return { error: `couldn't reach Google for a token: ${err?.message ?? err}` };
  }
}

export type SubmitResult = { ok: true; status: number } | { ok: false; status: number; error: string };

/** PUT the sitemap on the property. Never throws. */
export async function submitSitemap(accessToken: string, property: string, feedUrl: string, fetchImpl: Fetch = fetch): Promise<SubmitResult> {
  const url = `${API}/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(feedUrl)}`;
  try {
    const res = await fetchImpl(url, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) return { ok: true, status: res.status };
    const data: any = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, error: String(data?.error?.message ?? `HTTP ${res.status}`) };
  } catch (err: any) {
    return { ok: false, status: 0, error: String(err?.message ?? err) };
  }
}

export type EnsureResult =
  | { submitted: true; property: string; feed: string }
  | { submitted: false; property: string; feed: string; error: string };

/**
 * Make sure Google has the platform sitemap. Idempotent: submitting the
 * same sitemap again is how Google is told it changed.
 *
 * NOT CONFIGURED IS AN ERROR, NOT A SKIP. The whole point is that this
 * happens without anyone doing it; a credential that was never set means
 * it is not happening, and a skip would let that stay quiet for ever.
 */
export async function ensurePlatformSitemap(
  opts: { env?: Record<string, string | undefined>; fetchImpl?: Fetch; now?: Date } = {}
): Promise<EnsureResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const property = platformProperty(opts.env);
  const feed = platformSitemapUrl();

  // RULE 6, AND THE REGISTRY IS LOAD-BEARING rather than a comment: the
  // action runs only while it is classified and classified as needing no
  // approval. Reclassify it and this stops on its own.
  const policy = getActionPolicy(SUBMIT_SITEMAP_ACTION);
  if (!policy) return { submitted: false, property, feed, error: `${SUBMIT_SITEMAP_ACTION} is not in ACTION_POLICIES, so it does not run` };
  if (policy.requiresApproval) return { submitted: false, property, feed, error: `${SUBMIT_SITEMAP_ACTION} requires approval, so it does not run unattended` };

  const sa = readServiceAccount(opts.env ? opts.env[PLATFORM_CREDENTIAL_ENV] : process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT);
  if (!sa) {
    return { submitted: false, property, feed, error: `${PLATFORM_CREDENTIAL_ENV} is not set, so Google has not been told about the sitemap` };
  }
  if ("error" in sa) return { submitted: false, property, feed, error: sa.error };

  const token = await platformAccessToken(sa, fetchImpl, opts.now ?? new Date());
  if ("error" in token) return { submitted: false, property, feed, error: token.error };

  const result = await submitSitemap(token.token, property, feed, fetchImpl);
  if (!result.ok) return { submitted: false, property, feed, error: `Search Console refused the sitemap (${result.status}): ${result.error}` };
  return { submitted: true, property, feed };
}

// ---------------------------------------------------------------------
// A BUSINESS'S OWN DOMAIN — 27 November 2026, on the founder's sign-off.
//
// Shopify, WordPress and custom-domain businesses are not on
// hawlai.online, so the platform credential cannot reach them. Their own
// Search Console connection can, now that it asks for the `webmasters`
// scope. The same two moments as the platform: when something is
// published to their site, and every day.
// ---------------------------------------------------------------------

/** Never submit more than this many sitemaps for one business at once. */
export const MAX_SITEMAPS = 5;

/** Where a sitemap is usually found, after robots.txt has had its say. */
const SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"];

export type OwnDomainResult =
  | { submitted: string[]; property: string }
  | { skipped: string }
  | { error: string; property?: string };

/** Is this URL inside the property, so Google will accept it there? */
export function inProperty(url: string, property: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (property.startsWith("sc-domain:")) {
    const domain = property.slice(10).toLowerCase();
    const host = u.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  const prefix = property.endsWith("/") ? property : `${property}/`;
  return url === property || url.startsWith(prefix);
}

/** The origins worth looking on, for a property. */
function originsFor(property: string): string[] {
  if (property.startsWith("sc-domain:")) {
    const domain = property.slice(10).toLowerCase();
    return [`https://${domain}`, `https://www.${domain}`];
  }
  try {
    return [new URL(property).origin];
  } catch {
    return [];
  }
}

/** A fetch that gives up, so one slow site cannot hold up the daily run. */
async function fetchText(url: string): Promise<{ ok: boolean; url: string; text: string } | null> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    const text = await res.text();
    return { ok: res.ok, url: res.url || url, text };
  } catch {
    return null;
  }
}

/** A real sitemap, not a 404 page that happened to answer 200. */
function looksLikeSitemap(text: string): boolean {
  const head = text.slice(0, 65_536);
  return /<urlset[\s>]/i.test(head) || /<sitemapindex[\s>]/i.test(head);
}

/**
 * Find this property's sitemap by LOOKING, never by guessing a path.
 *
 * robots.txt FIRST, because it is the site's own declaration — Shopify
 * and every WordPress SEO plugin write it there. Then the three paths
 * the common platforms serve. A candidate counts only if it answers with
 * an actual <urlset> or <sitemapindex>, and only if it sits inside the
 * property, because Google refuses a sitemap from outside it.
 */
export async function discoverSitemaps(property: string): Promise<string[]> {
  const declared: string[] = [];
  for (const origin of originsFor(property)) {
    const robots = await fetchText(`${origin}/robots.txt`);
    if (!robots?.ok) continue;
    for (const line of robots.text.split(/\r?\n/)) {
      const m = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (m && inProperty(m[1], property) && !declared.includes(m[1])) declared.push(m[1]);
    }
    if (declared.length) break;
  }

  const found: string[] = [];
  for (const candidate of declared.slice(0, MAX_SITEMAPS)) {
    const res = await fetchText(candidate);
    if (res?.ok && looksLikeSitemap(res.text) && inProperty(res.url, property)) found.push(res.url);
  }
  if (found.length) return [...new Set(found)];

  for (const origin of originsFor(property)) {
    for (const path of SITEMAP_PATHS) {
      const res = await fetchText(`${origin}${path}`);
      // The URL it ENDED at: WordPress answers /sitemap.xml with a
      // redirect to /wp-sitemap.xml, and Google should be given the real one.
      if (res?.ok && looksLikeSitemap(res.text) && inProperty(res.url, property)) return [res.url];
    }
  }
  return [];
}

/** The sitemaps already submitted on this property, by path. */
async function listSitemaps(accessToken: string, property: string): Promise<{ paths: string[] } | { error: string }> {
  try {
    const res = await fetch(`${API}/sites/${encodeURIComponent(property)}/sitemaps`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { error: String(data?.error?.message ?? `HTTP ${res.status}`) };
    return { paths: (data?.sitemap ?? []).map((m: any) => String(m?.path ?? "")).filter(Boolean) };
  } catch (err: any) {
    return { error: String(err?.message ?? err) };
  }
}

/**
 * Turn Google's refusal into what to do about it.
 *
 * TWO DIFFERENT 403s, and the difference is the whole fix: a token
 * granted before 27 November carries the read-only scope, which one
 * reconnect replaces; a Google account that is only a restricted user
 * on the property needs a higher permission there, and no reconnect
 * will ever change that.
 */
function explainRefusal(result: { status: number; error: string }): string {
  const base = `Search Console refused the sitemap (${result.status}): ${result.error}`;
  if (result.status === 403 && /scope/i.test(result.error)) {
    return `${base} — this connection was made with read-only access; reconnecting Search Console once in Integrations grants it`;
  }
  if (result.status === 403 && /permission/i.test(result.error)) {
    return `${base} — the connected Google account needs Owner or Full access to this property`;
  }
  return base;
}

/**
 * Make sure Google has this business's own sitemap.
 *
 * THE SITEMAPS ALREADY SUBMITTED WIN. If the owner or their SEO plugin
 * already told Google, those are resubmitted — that is the "it changed"
 * signal — and nothing new is added beside them. Only a property with
 * none gets one discovered.
 *
 * SKIPS ARE NOT FAILURES: not connected, no property, or the platform's
 * own property (the platform credential submits that). A site with no
 * sitemap to find IS a failure, because the automation cannot do its
 * job, and it says where it looked.
 */
export async function ensureOwnDomainSitemap(service: any, dealershipId: string): Promise<OwnDomainResult> {
  const policy = getActionPolicy(SUBMIT_SITEMAP_ACTION);
  if (!policy) return { error: `${SUBMIT_SITEMAP_ACTION} is not in ACTION_POLICIES, so it does not run` };
  if (policy.requiresApproval) return { error: `${SUBMIT_SITEMAP_ACTION} requires approval, so it does not run unattended` };

  const { data: row, error: readError } = await service
    .from("dealerships")
    .select(searchConsoleSelect())
    .eq("id", dealershipId)
    .maybeSingle();
  if (readError) return { error: `couldn't read the Search Console connection: ${readError.message}` };

  const conn = readConnection(row);
  if (!conn) return { skipped: "Search Console isn't connected" };
  const property = conn.siteUrl;
  if (!property) return { skipped: "no Search Console property of this business's own is selected" };
  if (isPlatformProperty(property)) return { skipped: "this property is the platform's own domain, which the platform submits" };

  let accessToken: string;
  try {
    const valid = await validAccessToken(conn);
    accessToken = valid.accessToken;
    if (valid.refreshed) await saveRefreshed(service, dealershipId, valid.refreshed);
  } catch (err: any) {
    return { error: String(err?.message ?? err), property };
  }

  const existing = await listSitemaps(accessToken, property);
  if ("error" in existing) return { error: `couldn't read the property's sitemaps: ${existing.error}`, property };

  const feeds = existing.paths.length ? existing.paths.slice(0, MAX_SITEMAPS) : await discoverSitemaps(property);
  if (!feeds.length) {
    return {
      error: `no sitemap was found for ${property} — looked in robots.txt and at ${SITEMAP_PATHS.join(", ")}`,
      property,
    };
  }

  for (const feed of feeds) {
    const result = await submitSitemap(accessToken, property, feed);
    if (!result.ok) return { error: explainRefusal(result), property };
  }
  return { submitted: feeds, property };
}

/**
 * Queue a submission for the dispatcher, through the SERVICE client.
 *
 * event_queue has no client INSERT policy (migration 129), and callers
 * here include the publish route on the owner's own session — an insert
 * through that client is refused. emitEvent would also discard the
 * error, so this inserts directly and reads it.
 *
 * NEVER THE REASON THE CALLER FAILS: whatever triggered this has already
 * happened, and the daily run submits again regardless.
 */
export async function queueSitemapSubmission(
  dealershipId: string,
  scope: "platform" | "own_domain",
  eventType: string = SITE_PUBLISHED_EVENT
): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const { error } = await createServiceClient()
      .from("event_queue")
      .insert({ dealership_id: dealershipId, event_type: eventType, payload: scope === "own_domain" ? { scope } : {} });
    if (error) console.error(`[sitemap] couldn't queue the sitemap submission for ${dealershipId}: ${error.message}`);
  } catch (err: any) {
    console.error(`[sitemap] couldn't queue the sitemap submission for ${dealershipId}: ${err?.message ?? err}`);
  }
}

/**
 * What the dispatcher runs for a queued submission.
 *
 * THROWS WHEN IT DID NOT HAPPEN, so the event is recorded as failed with
 * the reason. A skip — this business has no own-domain connection — is
 * not a failure and does not throw.
 */
export async function submitSitemapForEvent(
  service: any,
  event: { dealership_id: string; payload?: Record<string, any> | null }
): Promise<void> {
  if (event.payload?.scope === "own_domain") {
    const result = await ensureOwnDomainSitemap(service, event.dealership_id);
    if ("error" in result) throw new Error(result.error);
    return;
  }
  const result = await ensurePlatformSitemap();
  if (!result.submitted) throw new Error(result.error);
}
