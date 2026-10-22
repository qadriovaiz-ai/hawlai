// T — THE TRACKING CHECK — S4/P1.
//
// §2c of the growth agent plan: "is site_events / Search Console /
// ads-conversion actually firing; no ROI claim, target or ad suggestion
// depends on conversions until verified; output = a measurement health
// line (OK / partial / broken) in every report."
//
// All three are reads. No model, no cost.
//
// THE TRAP THIS FILE IS MOSTLY ABOUT. Migration 207 records it in the
// product's own history: site visits went 28 to 31 while the owner was
// testing his own site, and "at that traffic level his own clicks are
// most of the signal". It added `page_events.is_internal` for exactly
// that, and the owner's own visits are excluded from every count and
// from Diagnosis.
//
// So every count in this file reads `is_internal = false`. A tracking
// check that says "tracking is healthy, 31 visits" while 20 of them are
// the owner refreshing his own homepage is worse than no tracking
// check: it is a number he will make a decision on, and nothing in the
// system will ever tell him it was wrong, because there is no outcome
// loop until S5.

export type MeasurementHealth = "ok" | "partial" | "broken";

export type TrackingState = {
  siteEvents: { firing: boolean; lastAt: string | null; visitorEvents30d: number };
  searchConsole: { connected: boolean; siteUrl: string | null };
  /**
   * Conversions are "verified" only when something countable has
   * actually arrived. Not when a pixel id is set, not when a campaign
   * exists — those say somebody configured something.
   */
  adsConversions: { verified: boolean; why: string };
  health: MeasurementHealth;
};

/** 30 days, the window the report speaks in. */
const WINDOW_DAYS = 30;

export async function checkTracking(supabase: any, dealershipId: string, now: Date = new Date()): Promise<TrackingState> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();

  // --- site events, the owner's own visits excluded -------------------
  let visitorEvents30d = 0;
  let lastAt: string | null = null;
  const events = await supabase
    .from("page_events")
    .select("created_at")
    .eq("dealership_id", dealershipId)
    .eq("is_internal", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (!events.error && Array.isArray(events.data)) {
    visitorEvents30d = events.data.length;
    lastAt = events.data[0]?.created_at ?? null;
  }

  // --- Search Console ------------------------------------------------
  let connected = false;
  let siteUrl: string | null = null;
  try {
    const { searchConsoleSelect, readConnection } = await import("@/lib/seo/searchConsole");
    const { data: row } = await supabase
      .from("dealerships")
      .select(searchConsoleSelect())
      .eq("id", dealershipId)
      .maybeSingle();
    const connection = readConnection(row);
    connected = Boolean(connection);
    siteUrl = connection?.siteUrl ?? null;
  } catch {
    // An unreadable connection is reported as NOT connected. The whole
    // point of T is that a claim depending on it must not be made, and
    // "we could not tell" has to resolve the same way as "no".
    connected = false;
  }

  // --- ads conversions ------------------------------------------------
  //
  // VERIFIED MEANS COUNTED. A live campaign and a paid order in the
  // same window is the weakest honest evidence that the two ends are
  // connected at all; anything softer would let an ROI claim stand on a
  // configuration screen.
  let adsConversions = { verified: false, why: "no ad campaign has run, so there is nothing to attribute" };
  const campaigns = await supabase
    .from("ad_creatives")
    .select("id")
    .eq("dealership_id", dealershipId)
    .limit(1);
  const hasCampaign = !campaigns.error && Array.isArray(campaigns.data) && campaigns.data.length > 0;
  if (hasCampaign) {
    const orders = await supabase
      .from("orders")
      .select("id")
      .eq("dealership_id", dealershipId)
      .eq("payment_status", "paid")
      .gte("created_at", since)
      .limit(1);
    const hasPaid = !orders.error && Array.isArray(orders.data) && orders.data.length > 0;
    adsConversions = hasPaid
      ? { verified: true, why: "a campaign has run and a paid order has been recorded in the last 30 days" }
      : { verified: false, why: "a campaign has run but no paid order has been recorded in the last 30 days" };
  }

  const firing = visitorEvents30d > 0;
  const health: MeasurementHealth = !firing ? "broken" : connected && adsConversions.verified ? "ok" : "partial";

  return {
    siteEvents: { firing, lastAt, visitorEvents30d },
    searchConsole: { connected, siteUrl },
    adsConversions,
    health,
  };
}

/**
 * May a suggestion that depends on conversions be made at all?
 *
 * §2c, and the reason it is a function rather than a sentence in a
 * prompt: a rule that lives only in wording holds wherever a model
 * applies it and fails wherever one does not, which is the pattern this
 * project named on 18 October and has been paying for since.
 */
export function conversionClaimsAllowed(t: TrackingState): boolean {
  return t.adsConversions.verified;
}

/** The line that appears in EVERY report, whatever else is in it. */
export function measurementHealthLine(t: TrackingState): string {
  const parts = [
    t.siteEvents.firing
      ? `site visits are being recorded (${t.siteEvents.visitorEvents30d} in 30 days, your own visits excluded)`
      : "site visits are NOT being recorded",
    t.searchConsole.connected ? "Search Console is connected" : "Search Console is not connected",
    t.adsConversions.verified ? "ad conversions are verified" : `ad conversions are not verified — ${t.adsConversions.why}`,
  ];
  const word = t.health === "ok" ? "OK" : t.health === "partial" ? "PARTIAL" : "BROKEN";
  return `Measurement health: ${word}. ${parts.join("; ")}.`;
}
