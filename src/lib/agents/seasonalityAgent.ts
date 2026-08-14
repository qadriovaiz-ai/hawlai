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

export async function syncSeasonalCalendarEntries(supabase: any, dealershipId: string): Promise<number> {
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("seasonal_campaigns_enabled")
    .eq("id", dealershipId)
    .single();
  if (!dealership?.seasonal_campaigns_enabled) return 0;

  const today = new Date().toISOString().slice(0, 10);
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
      notes: `${event.name} is on ${event.event_date} — start prepping now to be ready ${event.lead_time_days} days out.`,
      seasonal_event_id: event.id,
    });
    if (!error) created++;
  }
  return created;
}
