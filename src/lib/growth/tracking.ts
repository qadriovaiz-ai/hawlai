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

/**
 * FIVE ANSWERS, NOT THREE — and the two new ones exist because the old
 * three told a business with no website that its measurement was
 * BROKEN.
 *
 * THE BUG (reported 12 November 2026). `health` was decided by one
 * number: zero visitor events in 30 days meant "broken". A business
 * with no published site has zero events because THERE IS NOTHING TO
 * MEASURE, and telling its owner his measurement is broken sends him
 * looking for a fault that does not exist. It is the same mistake
 * `daysSinceChange` already refuses to make: "the audit could not see a
 * date" and "nobody has touched this in a year" are different facts.
 *
 *   no_site       nothing is published, so nothing can be measured
 *   no_data_yet   published, and no visit has EVER been recorded
 *   broken        visits WERE recorded once, and none in 30 days
 *   partial / ok  unchanged
 *
 * WHY no_data_yet EXISTS, added 12 November 2026 on the founder's rule
 * that the product says only what is true. For a site published
 * yesterday with nobody through the door yet, "site visits are NOT
 * being recorded" IS A CLAIM WE CANNOT SUPPORT: the tracking may be
 * working perfectly and nobody may have come. The count cannot tell
 * those apart, so the line says both.
 *
 * `broken` now means something the data does support — there were
 * visits and they stopped. That is a narrower and therefore honest
 * claim, and it is why this change moved an assertion that had stood
 * since S4 ("IS BROKEN WHEN NOTHING IS FIRING"): that test was reading
 * "we have no data" as "the plumbing is broken", which is the same
 * conflation the no_site fix removed one layer further out.
 */
export type MeasurementHealth = "ok" | "partial" | "broken" | "no_site" | "no_data_yet";

export type TrackingState = {
  siteEvents: {
    firing: boolean;
    lastAt: string | null;
    visitorEvents30d: number;
    /**
     * The earliest visitor event EVER, not within the window.
     *
     * The maturity rule is "fewer than 14 days of data", and 14 days
     * cannot be measured from a 30-day window that may itself be the
     * first week of the business's life.
     */
    firstAt: string | null;
  };
  /**
   * Whether there is anything to measure at all.
   *
   * `published` is false both when no site exists and when one exists
   * unpublished — from the measurement's point of view those are the
   * same fact, and `why` says which.
   */
  site: { published: boolean; why: string };
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

  // The first visitor event ever, for the maturity rule. Its own query
  // because the window above cannot answer "how long has there been
  // any data at all".
  let firstAt: string | null = null;
  const firstEvent = await supabase
    .from("page_events")
    .select("created_at")
    .eq("dealership_id", dealershipId)
    .eq("is_internal", false)
    .order("created_at", { ascending: true })
    .limit(1);
  if (!firstEvent.error && Array.isArray(firstEvent.data)) firstAt = firstEvent.data[0]?.created_at ?? null;

  // --- is there anything to measure? ---------------------------------
  //
  // READ BEFORE THE HEALTH IS DECIDED, because a zero event count means
  // nothing until we know whether a site exists. Both surfaces count:
  // /api/public/track resolves a visit against `landing_pages` OR
  // `websites`, so a business using only a quick-launch page is being
  // measured just as much as one with a built site.
  let site = { published: false, why: "there is no website or landing page yet, so there is nothing to measure" };
  const website = await supabase
    .from("websites")
    .select("published")
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  const landing = await supabase
    .from("landing_pages")
    .select("published")
    .eq("dealership_id", dealershipId)
    .eq("published", true)
    .limit(1);
  const hasLanding = !landing.error && Array.isArray(landing.data) && landing.data.length > 0;
  if (!website.error && website.data?.published === true) {
    site = { published: true, why: "your site is published" };
  } else if (hasLanding) {
    site = { published: true, why: "a landing page is published" };
  } else if (!website.error && website.data) {
    // A SAVED BUT UNPUBLISHED SITE IS ITS OWN SENTENCE. "You have no
    // website" would be wrong and would read as the product having lost
    // his work.
    site = { published: false, why: "your site is saved but not published yet, so nobody can visit it" };
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
  // READ TOP TO BOTTOM, EACH ANSWER NARROWER THAN THE LAST:
  //   nothing published        -> there is nothing to measure
  //   published, no event ever -> we cannot tell working from quiet
  //   published, events then none -> it stopped, which IS a claim
  //   firing                   -> ok or partial, as before
  const health: MeasurementHealth = !site.published
    ? "no_site"
    : firing
      ? (connected && adsConversions.verified ? "ok" : "partial")
      : firstAt
        ? "broken"
        : "no_data_yet";

  return {
    siteEvents: { firing, lastAt, visitorEvents30d, firstAt },
    site,
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
const HEALTH_WORDS: Record<MeasurementHealth, string> = {
  ok: "OK",
  partial: "PARTIAL",
  broken: "BROKEN",
  // NEITHER OF THESE IS A FAULT, AND NEITHER WORD MAY SOUND LIKE ONE.
  // They replaced a BROKEN shown to a business with no website, and a
  // BROKEN shown to a site that simply had no visitors yet.
  no_site: "NOTHING TO MEASURE YET",
  no_data_yet: "NO VISITS RECORDED YET",
};

export function measurementHealthLine(t: TrackingState): string {
  // NOTHING PUBLISHED ENDS THE SENTENCE EARLY. Listing Search Console
  // and ad conversions beneath it would be three not-connected
  // complaints about a business that has not opened its doors, and the
  // only useful instruction is the first one.
  if (t.health === "no_site") {
    return `Measurement health: ${HEALTH_WORDS.no_site}. ${t.site.why}.`;
  }

  const parts = [
    t.siteEvents.firing
      ? `site visits are being recorded (${t.siteEvents.visitorEvents30d} in 30 days, your own visits excluded)`
      // BOTH POSSIBILITIES, because the count cannot tell them apart
      // and asserting either one would be a guess.
      : t.health === "no_data_yet"
        ? "no visit has been recorded yet — either nobody has been to the site, or the tracking is not working"
        : "site visits have stopped being recorded",
    t.searchConsole.connected ? "Search Console is connected" : "Search Console is not connected",
    t.adsConversions.verified ? "ad conversions are verified" : `ad conversions are not verified — ${t.adsConversions.why}`,
  ];
  return `Measurement health: ${HEALTH_WORDS[t.health]}. ${parts.join("; ")}.`;
}
