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

export const SEARCH_CONSOLE_SELECT = `${tokenSelect("search_console")}, search_console_token_expiry, search_console_email, search_console_site_url`;

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
