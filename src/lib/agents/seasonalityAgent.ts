// ------------------------------------------------------------------
// Seasonality operationalization — master audit Part D.
// ------------------------------------------------------------------
// seasonal_events (migration 108) is a platform-wide, read-only list
// of festival/seasonal dates. This turns an upcoming one into a real
// marketing_calendar row once it enters that event's lead time — the
// same table the Content Calendar already reads and renders, so this
// activates existing infrastructure rather than building a second
// scheduler. It does NOT generate or send anything itself; it creates
// a planning entry a dealer sees and acts on, same as one they'd add
// by hand.
//
// Opt-in via dealerships.seasonal_campaigns_enabled, default off,
// matching every other automation toggle in this codebase.
// ------------------------------------------------------------------

import { FESTIVAL_GUIDE, angleFor, indiaToday, outOfSeasonFestival, type AngleContext, type SeasonalEventRow } from "@/lib/expertise/seasonalCalendar";
import { effectiveBusinessModels } from "@/lib/business/businessModel";
import { blocksText } from "@/lib/claims/businessFacts";
import { emitNotification, type NotificationKind } from "@/lib/notifications/emit";

export async function syncSeasonalCalendarEntries(supabase: any, dealershipId: string): Promise<number> {
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("seasonal_campaigns_enabled, business_models")
    .eq("id", dealershipId)
    .single();
  if (!dealership?.seasonal_campaigns_enabled) return 0;

  // The angle for how this business makes money — not a shop's "gifting" for a salon.
  const { data: catalogue } = await supabase.from("products").select("kind").eq("dealership_id", dealershipId).eq("is_active", true);
  const productCount = (catalogue ?? []).filter((p: any) => p.kind !== "service").length;
  const serviceCount = (catalogue ?? []).length - productCount;
  const angleContext: AngleContext = { models: effectiveBusinessModels(dealership.business_models, { productCount, serviceCount }).models, giftable: productCount > 0 };

  const today = indiaToday();
  // Widest realistic lead time first, then filtered precisely per
  // event below — an event with a 45-day lead time needs to surface
  // earlier than one with a 7-day lead time even though both are
  // "upcoming."
  const { data: events } = await supabase
    .from("seasonal_events")
    .select("id, name, event_date, lead_time_days")
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(50);

  let created = 0;
  for (const event of events ?? []) {
    const leadStart = new Date(event.event_date);
    leadStart.setDate(leadStart.getDate() - event.lead_time_days);
    if (leadStart.toISOString().slice(0, 10) > today) continue; // not in this event's lead window yet

    const { data: existing } = await supabase
      .from("marketing_calendar")
      .select("id")
      .eq("dealership_id", dealershipId)
      .eq("seasonal_event_id", event.id)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabase.from("marketing_calendar").insert({
      dealership_id: dealershipId,
      title: `${event.name} campaign`,
      channel: "other",
      scheduled_date: today,
      status: "planned",
      notes: `${event.name} is on ${event.event_date}. Campaigns should be live from today, ${event.lead_time_days} days ahead — not on the day.${guideAngle(event.name, angleContext)}`,
      seasonal_event_id: event.id,
    });
    if (!error) created++;
  }
  return created;
}

function guideAngle(name: string, ctx: AngleContext): string {
  const guide = FESTIVAL_GUIDE.find((g) => g.name === name);
  return guide ? ` Angle: ${angleFor(guide, ctx)}.` : "";
}

const OUT_OF_SEASON: NotificationKind = "out_of_season_content";

/**
 * Tells the owner when their live website, or a campaign still marked
 * planned, is selling a festival that's over — the Diwali section still
 * on a homepage in December.
 *
 * Runs for every business, whatever the Seasonal Campaigns toggle says:
 * it creates nothing and changes nothing, it only warns. One
 * notification per festival, per year, per place (dedupe key), so it
 * doesn't nag daily. Returns what it found, whether or not a
 * notification could be recorded.
 */
export async function flagOutOfSeasonContent(supabase: any, dealershipId: string): Promise<{ flagged: { festival: string; where: string; text: string }[] } | { error: string }> {
  const today = indiaToday();
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: festivals, error: festivalsError } = await supabase
    .from("seasonal_events")
    .select("name, event_date, lead_time_days")
    .gte("event_date", since)
    .order("event_date", { ascending: true })
    .limit(200);
  if (festivalsError) return { error: `festival dates couldn't be read: ${festivalsError.message}` };
  const rows = (festivals ?? []) as SeasonalEventRow[];

  const places: { where: string; href: string; texts: string[] }[] = [];

  const { data: website, error: websiteError } = await supabase.from("websites").select("id, published").eq("dealership_id", dealershipId).maybeSingle();
  if (websiteError) return { error: `website couldn't be read: ${websiteError.message}` };
  if (website?.published) {
    const { data: pages, error: pagesError } = await supabase.from("website_pages").select("slug, title, sections").eq("website_id", website.id);
    if (pagesError) return { error: `website pages couldn't be read: ${pagesError.message}` };
    for (const p of pages ?? []) {
      const t = blocksText(p.sections);
      places.push({ where: `the ${p.title || p.slug} page of your website`, href: "/dashboard/website-builder", texts: [...t.headings, ...t.buttons, ...t.paragraphs] });
    }
  }

  const { data: planned, error: plannedError } = await supabase
    .from("marketing_calendar")
    .select("id, title, notes, status")
    .eq("dealership_id", dealershipId)
    .in("status", ["planned", "in_progress"]);
  if (plannedError) return { error: `calendar couldn't be read: ${plannedError.message}` };
  for (const c of planned ?? []) {
    places.push({ where: `"${c.title}" in your Content Calendar`, href: "/dashboard/calendar", texts: [String(c.title ?? "")] });
  }

  const flagged: { festival: string; where: string; text: string }[] = [];
  for (const place of places) {
    for (const text of place.texts) {
      const hit = outOfSeasonFestival(text, rows, today);
      if (!hit || flagged.some((f) => f.where === place.where && f.festival === hit.festival)) continue;
      flagged.push({ festival: hit.festival, where: place.where, text });
      const year = new Date(Date.parse(`${today}T00:00:00Z`) - hit.endedDaysAgo * 24 * 60 * 60 * 1000).getUTCFullYear();
      await emitNotification(supabase, {
        dealershipId,
        kind: OUT_OF_SEASON,
        title: `${hit.festival} is over, but ${place.where} still mentions it`,
        body: `"${text.slice(0, 120)}" — ${hit.festival} was ${hit.endedDaysAgo} days ago. Update or remove it so customers don't see an old campaign.`,
        href: place.href,
        dedupeKey: `out_of_season:${hit.festival}:${year}:${place.where}`,
      });
    }
  }
  return { flagged };
}

/** The seasonal_calendar subsystem's daily run. A failed check is reported as `{ error }`, so the run is logged as failed. */
export async function runSeasonalCalendar(supabase: any, dealershipId: string) {
  const entriesCreated = await syncSeasonalCalendarEntries(supabase, dealershipId);
  const check = await flagOutOfSeasonContent(supabase, dealershipId);
  if ("error" in check) return { entriesCreated, error: check.error };
  return { entriesCreated, outOfSeason: check.flagged };
}
