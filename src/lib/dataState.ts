// ------------------------------------------------------------------
// Explicit data-availability states.
// ------------------------------------------------------------------
// "Not connected", "connected but nothing yet" and "we couldn't load
// it" are three different answers, and collapsing them into a rendered
// 0 is a correctness bug rather than a display choice. This type makes
// that structural: a consumer cannot reach the value without first
// handling the other three cases.
//
// Originally written inside lib/dashboard/dashboardData.ts. Lifted
// here when analyticsAgent needed the same vocabulary — an agent
// importing its core types from a dashboard module would have been
// backwards, and this type is not a dashboard concept. dashboardData
// re-exports it so no existing import changed.
// ------------------------------------------------------------------

export type ChannelKey = "meta_ads" | "meta_page" | "whatsapp" | "google_ads";

export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  meta_ads: "Meta Ads",
  meta_page: "Facebook & Instagram",
  whatsapp: "WhatsApp",
  google_ads: "Google Ads",
};

/**
 * A value that knows why it might be absent.
 *
 * `no_data` carries its reason so an empty state can explain what
 * would fill it rather than showing a shrug.
 */
export type Loaded<T> =
  | { state: "ok"; value: T }
  | { state: "not_connected"; channel: ChannelKey }
  | { state: "no_data"; reason: string }
  | { state: "error"; message: string };
