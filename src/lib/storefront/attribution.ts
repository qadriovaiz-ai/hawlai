// Where a storefront visitor came from, carried to checkout.
//
// THE GAP THIS CLOSES: withCampaignTag() stamps
// utm_campaign=<ad_creatives.id> on every outbound ad link, so the
// attribution data arrives on every single ad click — and was thrown
// away. Nothing read it, nothing stored it, and no order ever carried a
// campaign id. A traffic ad that genuinely sold things showed zero
// revenue and no ROAS on the dashboard, which would have made the whole
// chat-launch feature look like it did not work.
//
// sessionStorage rather than a cookie: this is first-party, single-tab,
// and never sent anywhere except with the order the visitor themselves
// submits. A cookie would travel on every storefront request for no
// reason.
//
// FIRST TOUCH WINS. Someone who lands from an ad, browses, then returns
// through a plain product link should still credit the ad that found
// them. Overwriting on every page view would credit whichever link came
// last, which is usually an untagged one.

const KEY = "hawlai_attribution";

export type StoredAttribution = {
  utm_campaign: string | null;
  utm_source: string | null;
  /** When it was captured, so a stale session can be judged later. */
  at: string;
};

/** Trimmed, length-capped, null when empty — never stored raw. */
function clean(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  // A tag is an id or a short slug. Anything longer is someone probing.
  return v.slice(0, 200);
}

/**
 * Read the tags off a URL. Pure, so the capture rule is testable
 * without a browser.
 */
export function readAttributionFromUrl(url: string): StoredAttribution | null {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return null;
  }
  const utm_campaign = clean(params.get("utm_campaign"));
  const utm_source = clean(params.get("utm_source"));
  if (!utm_campaign && !utm_source) return null;
  return { utm_campaign, utm_source, at: new Date().toISOString() };
}

/** Capture on landing. Never overwrites an earlier touch. */
export function captureAttribution(url: string, storage?: Storage): void {
  const store = storage ?? (typeof window !== "undefined" ? window.sessionStorage : undefined);
  if (!store) return;
  try {
    if (store.getItem(KEY)) return; // first touch wins
    const found = readAttributionFromUrl(url);
    if (found) store.setItem(KEY, JSON.stringify(found));
  } catch {
    // Private browsing, blocked storage, quota. Losing attribution must
    // never break a checkout.
  }
}

/** What to send with the order. Null when there is nothing to say. */
export function getAttribution(storage?: Storage): StoredAttribution | null {
  const store = storage ?? (typeof window !== "undefined" ? window.sessionStorage : undefined);
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const utm_campaign = clean(parsed.utm_campaign);
    const utm_source = clean(parsed.utm_source);
    if (!utm_campaign && !utm_source) return null;
    return { utm_campaign, utm_source, at: typeof parsed.at === "string" ? parsed.at : new Date().toISOString() };
  } catch {
    return null;
  }
}
