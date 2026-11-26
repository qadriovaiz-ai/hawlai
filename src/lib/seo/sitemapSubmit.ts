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
import { platformHost } from "@/lib/seo/searchConsole";
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
