import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { gatherBusinessFactsSafely, physicalProducts } from "@/lib/claims/businessFacts";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";
import { loadDiagnosis } from "@/lib/strategy/diagnosis";
import { latestPositioning } from "@/lib/strategy/positioning/run";
import { buildWeeks, baselineFrom, WEEKS, PLANS_A_DAY } from "@/lib/strategy/calendar/weeks";
import { writeWeekIdeas } from "@/lib/strategy/calendar/write";

// The next 90 days, week by week (Advanced Strategy step 4;
// lib/strategy/calendar). GET: the latest plan. POST: plan again — code
// decides the weeks, one model call writes an idea for each, and every
// idea is checked. If the model fails the weeks are still saved: what
// each week is for doesn't depend on it.
//
// One model call (~₹3–5), limited to PLANS_A_DAY a business a day.
export const maxDuration = 180;

async function dealershipOf(supabase: any): Promise<{ ok: true; dealershipId: string } | { ok: false; response: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return { ok: false, response: NextResponse.json({ error: "No dealership" }, { status: 400 }) };
  return { ok: true, dealershipId: profile.dealership_id as string };
}

export async function GET() {
  const supabase = await createClient();
  const who = await dealershipOf(supabase);
  if (!who.ok) return who.response;
  const { data } = await supabase
    .from("strategy_quarters")
    .select("id, starts_on, ends_on, weeks, notes, cost_inr, created_at")
    .eq("dealership_id", who.dealershipId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ quarter: data ?? null });
}

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function POST() {
  const supabase = await createClient();
  const who = await dealershipOf(supabase);
  if (!who.ok) return who.response;
  const { dealershipId } = who;
  const service = createServiceClient();
  const today = indiaToday();

  // A few plans a day — each one is a model call.
  const { data: todays } = await service
    .from("strategy_quarters")
    .select("id")
    .eq("dealership_id", dealershipId)
    .gte("created_at", `${today}T00:00:00+05:30`);
  if ((todays ?? []).length >= PLANS_A_DAY) {
    return NextResponse.json({ error: `You've planned ${PLANS_A_DAY} times today — try again tomorrow. Your latest plan is still here.` }, { status: 429 });
  }

  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
  if (!facts) return NextResponse.json({ error: "Couldn't read your business details right now — try again shortly." }, { status: 500 });

  const notes: Record<string, unknown> = {};
  const [festivalRead, diagnosis, positioningRun] = await Promise.all([
    service.from("seasonal_events").select("name, event_date, lead_time_days").gte("event_date", addDays(today, -30)).order("event_date", { ascending: true }).limit(200),
    loadDiagnosis(supabase, dealershipId, today).catch((err: any) => {
      notes.diagnosis = `Couldn't read your last 90 days (${err?.message ?? "unknown"}) — the weeks use your positioning and story instead.`;
      return null;
    }),
    latestPositioning(supabase, dealershipId),
  ]);
  if (festivalRead.error) notes.festivals = "Couldn't read festival dates right now — no festival weeks in this plan.";
  const positioning = positioningRun?.analysis?.positioning ?? null;
  notes.positioningFrom = positioningRun?.created_at ?? null;

  const skeleton = buildWeeks({
    today,
    festivals: festivalRead.data ?? [],
    angle: { models: facts.businessModels?.models ?? [], giftable: physicalProducts(facts).length > 0 },
    diagnosis,
    positioning,
  });

  let weeks = skeleton;
  let costInr = 0;
  const written = await writeWeekIdeas(skeleton, facts, { supabase: service, dealershipId });
  if (written.ok) {
    weeks = written.weeks;
    costInr = written.costInr;
    if (written.removed.length) notes.removed = written.removed;
  } else {
    // The weeks stand on their own; say why there are no ideas.
    notes.aiFailure = written.message;
    weeks = skeleton.map((w) => ({ ...w, ideaNote: `No idea written — ${written.message}` }));
  }

  const { data: saved, error } = await service
    .from("strategy_quarters")
    .insert({
      dealership_id: dealershipId,
      starts_on: skeleton[0].starts,
      ends_on: skeleton[WEEKS - 1].ends,
      weeks,
      baseline: baselineFrom(diagnosis),
      notes,
      cost_inr: Math.round(costInr * 10000) / 10000,
    })
    .select("id, starts_on, ends_on, weeks, notes, cost_inr, created_at")
    .single();
  if (error || !saved) return NextResponse.json({ error: `Couldn't save the plan: ${error?.message ?? "no row"}` }, { status: 500 });
  return NextResponse.json({ quarter: saved });
}
