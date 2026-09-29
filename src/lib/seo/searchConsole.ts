// Talking to Google Search Console (Brain, Phase 4).
//
// Hawlai's SEO work has been guessed until now — the toolkit asks a model
// for keywords competitors are "probably" ranking for. This is the
// owner's own real search data: the queries people actually typed, and
// what they actually did next. Read-only, from an account they already
// have, for nothing.
//
// Same refresh shape as getValidGoogleAdsAccessToken: this returns a
// refreshed pair for the caller to persist rather than writing to the
// database itself, so one place owns the columns.

import { readToken, tokenSelect, tokenWrite } from "@/lib/crypto/oauthSecrets";

const API = "https://www.googleapis.com/webmasters/v3";

/**
 * The columns a connection needs, as a function rather than a constant.
 *
 * Computed on call, not at module load: a constant here ran tokenSelect()
 * the moment anything imported this file, which broke an unrelated test
 * that partially mocks the crypto helpers — and load-time work that can
 * fail is worth avoiding regardless of who notices it first.
 */
export function searchConsoleSelect(): string {
  return `${tokenSelect("search_console")}, search_console_token_expiry, search_console_email, search_console_site_url`;
}

export type SearchConsoleConnection = {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string | null;
  siteUrl: string | null;
  email: string | null;
};

/** The stored connection, or null when this business hasn't connected one. */
export function readConnection(row: Record<string, any> | null | undefined): SearchConsoleConnection | null {
  const accessToken = readToken(row, "search_console", "access_token");
  const refreshToken = readToken(row, "search_console", "refresh_token");
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    tokenExpiry: row?.search_console_token_expiry ?? null,
    siteUrl: row?.search_console_site_url ?? null,
    email: row?.search_console_email ?? null,
  };
}

/** A token good for the next few minutes, refreshing it first if not. */
export async function validAccessToken(
  conn: SearchConsoleConnection
): Promise<{ accessToken: string; refreshed?: { accessToken: string; expiry: string } }> {
  const expiresAt = conn.tokenExpiry ? new Date(conn.tokenExpiry).getTime() : 0;
  if (expiresAt - Date.now() > 5 * 60 * 1000) return { accessToken: conn.accessToken };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: conn.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    // Google's own wording is kept, but the instruction is always added:
    // the usual failure here is "invalid_grant", which on its own tells
    // the owner nothing about what to do. The commonest cause is that
    // they removed Hawlai's access at Google, and the only fix is to
    // connect again.
    const why = data?.error_description ?? data?.error ?? "the refresh was refused";
    throw new Error(`Couldn't refresh Search Console access (${why}) — reconnect it in Integrations.`);
  }
  const accessToken = String(data.access_token);
  const expiry = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString();
  return { accessToken, refreshed: { accessToken, expiry } };
}

/** Persists a refreshed token, so the next read doesn't refresh again. */
export async function saveRefreshed(service: any, dealershipId: string, refreshed: { accessToken: string; expiry: string }): Promise<void> {
  await service
    .from("dealerships")
    .update({ ...tokenWrite("search_console", "access_token", refreshed.accessToken), search_console_token_expiry: refreshed.expiry })
    .eq("id", dealershipId);
}

export type SiteProperty = { siteUrl: string; permissionLevel: string };

/** The properties this Google account can actually see. */
export async function listSites(accessToken: string): Promise<SiteProperty[]> {
  const res = await fetch(`${API}/sites`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't read your Search Console properties.");
  return (data.siteEntry ?? [])
    .map((s: any) => ({ siteUrl: String(s.siteUrl ?? ""), permissionLevel: String(s.permissionLevel ?? "") }))
    .filter((s: SiteProperty) => s.siteUrl);
}

/**
 * The property that belongs to this business, from the ones the account
 * can see.
 *
 * Matched on the site's own host. A single property is NOT assumed to be
 * the right one — an agency's Google account may hold a dozen, and
 * silently reading a different client's search data would be a privacy
 * failure, not a convenience. No match means connected with nothing
 * selected, which the owner is told.
 */
export function matchProperty(sites: SiteProperty[], siteUrl: string | null | undefined): string | null {
  const host = hostOf(siteUrl);
  if (!host) return null;
  // Owners can only read data for properties they own or are full users of.
  const usable = sites.filter((s) => s.permissionLevel !== "siteUnverifiedUser");
  const exact = usable.find((s) => hostOf(s.siteUrl) === host);
  if (exact) return exact.siteUrl;
  // "sc-domain:example.com" covers every subdomain of it.
  const domain = usable.find((s) => s.siteUrl.startsWith("sc-domain:") && (host === s.siteUrl.slice(10) || host.endsWith(`.${s.siteUrl.slice(10)}`)));
  return domain?.siteUrl ?? null;
}

/** Hawlai's own host, the one every storefront lives under. */
export function platformHost(): string {
  return hostOf(process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")) || "hawlai.online";
}

/**
 * Whether this property covers the whole of Hawlai rather than one
 * business's own domain.
 *
 * THE PRIVACY DECISION THIS DRIVES: every storefront lives at
 * hawlai.online/site/{slug}, so a property like `sc-domain:hawlai.online`
 * reports on ALL of them at once, plus Hawlai's own marketing pages. Read
 * unfiltered, one business's dashboard would show the searches that
 * reached another's shop. A business that has connected its OWN domain is
 * a different case entirely: that property is already only its own site,
 * and filtering it to a /site/ path would return nothing.
 */
export function isPlatformProperty(siteUrl: string | null | undefined): boolean {
  const host = hostOf(siteUrl);
  if (!host) return false;
  const platform = platformHost();
  return host === platform || host.endsWith(`.${platform}`);
}

/** Regex-special characters in a slug, made literal. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The page filter that confines a read to ONE business's storefront.
 *
 * Anchored on purpose, and the anchoring is the whole point:
 *
 *   - `contains "/site/candle"` also matches /site/candle-by-qaaf, so one
 *     business would read another's searches;
 *   - `contains "/site/candle/"` misses the homepage, which has no
 *     trailing slash, so the business would lose its own best data;
 *   - anchored, `/site/candle` matches that shop and everything under it,
 *     and `/site/candle-by-qaaf` cannot match it at all.
 *
 * The tail allows a path, a query string or a fragment, because Google
 * reports the URL as it was crawled. The leading anchor also excludes
 * hawlai.online itself and the legacy /p/ landing pages, which belong to
 * nobody's dashboard.
 */
export function sitePageFilter(slug: string, host: string = platformHost()): string {
  return `^https://${escapeRegex(host)}/site/${escapeRegex(slug)}([/?#].*)?$`;
}

function hostOf(url: string | null | undefined): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("sc-domain:")) return raw.slice(10).toLowerCase();
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export type QueryRow = { query: string; clicks: number; impressions: number; ctr: number; position: number };

/**
 * What people actually searched to reach this site, over a window.
 *
 * Search Console reports with a two-day lag, so a window ending today is
 * mostly empty; callers should end it a few days back. Rows come back as
 * Google reported them — no rounding, no estimating, nothing added.
 */
export async function fetchQueries(
  accessToken: string,
  siteUrl: string,
  range: { from: string; to: string },
  /**
   * Which pages count. REQUIRED, and required rather than optional so
   * that a caller has to decide: a property covering all of Hawlai must
   * pass sitePageFilter(slug), and only a business's own domain property
   * may pass null. An optional parameter would let the next call site
   * forget, and forgetting means reading another business's searches.
   */
  pageFilter: string | null,
  rowLimit = 100
): Promise<QueryRow[]> {
  const res = await fetch(`${API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: range.from,
      endDate: range.to,
      dimensions: ["query"],
      rowLimit,
      dataState: "final",
      // Applied by Google, before anything is sent back. Filtering after
      // the fact would mean the other businesses' figures had already
      // crossed the wire into this request.
      ...(pageFilter ? { dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "includingRegex", expression: pageFilter }] }] } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Couldn't read your search data.");
  return (data.rows ?? []).map((r: any) => ({
    query: String(r.keys?.[0] ?? ""),
    clicks: Number(r.clicks) || 0,
    impressions: Number(r.impressions) || 0,
    ctr: Number(r.ctr) || 0,
    position: Number(r.position) || 0,
  })).filter((r: QueryRow) => r.query);
}
