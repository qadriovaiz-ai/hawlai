import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { latestPositioning } from "@/lib/strategy/positioning/run";
import { pillarsFrom, mergePillars, MAX_PILLARS } from "@/lib/strategy/pillars";

// Advanced Strategy step 5: what the owner ACCEPTS from their positioning
// becomes part of the Brand Voice every generator reads.
//
// The page sends only the choice — replace or add. The pillars themselves
// are rebuilt here from the business's own saved comparison, so what lands
// in Brand Voice is what Hawlai verified and showed them, not whatever a
// request body happened to contain.
//
// Nothing is written without this call, and this call happens only when
// the owner presses Replace or Add (migration 195).

async function dealershipOf(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return { error: NextResponse.json({ error: "No dealership" }, { status: 400 }) };
  return { dealershipId: profile.dealership_id as string };
}

/** What's on offer, next to what Brand Voice says now. */
export async function GET() {
  const supabase = await createClient();
  const who = await dealershipOf(supabase);
  if (who.error) return who.error;

  const [run, { data: brand }] = await Promise.all([
    latestPositioning(supabase, who.dealershipId),
    supabase.from("brand_profiles").select("messaging_pillars, positioning_statement, positioning_accepted_at").eq("dealership_id", who.dealershipId).maybeSingle(),
  ]);
  const offered = pillarsFrom(run?.analysis?.advice ?? null);
  const current: string[] = Array.isArray(brand?.messaging_pillars) ? brand!.messaging_pillars.map(String) : [];
  return NextResponse.json({
    offered,
    current,
    statement: brand?.positioning_statement ?? null,
    acceptedAt: brand?.positioning_accepted_at ?? null,
    from: run?.created_at ?? null,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const who = await dealershipOf(supabase);
  if (who.error) return who.error;
  const { dealershipId } = who;

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === "add" ? "add" : body?.mode === "replace" ? "replace" : null;
  if (!mode) return NextResponse.json({ error: "Choose Replace or Add." }, { status: 400 });

  const run = await latestPositioning(supabase, dealershipId);
  const offered = pillarsFrom(run?.analysis?.advice ?? null);
  if (offered.pillars.length === 0) {
    return NextResponse.json({ error: "There's nothing to accept yet — run a competitor comparison first." }, { status: 400 });
  }

  const { data: brand } = await supabase.from("brand_profiles").select("messaging_pillars").eq("dealership_id", dealershipId).maybeSingle();
  const current: string[] = Array.isArray(brand?.messaging_pillars) ? brand!.messaging_pillars.map(String) : [];
  const pillars = mode === "replace" ? offered.pillars.slice(0, MAX_PILLARS) : mergePillars(current, offered.pillars);

  const service = createServiceClient();
  const { error } = await service.from("brand_profiles").upsert(
    {
      dealership_id: dealershipId,
      messaging_pillars: pillars,
      positioning_statement: offered.statement,
      positioning_accepted_at: new Date().toISOString(),
    },
    { onConflict: "dealership_id" }
  );
  if (error) return NextResponse.json({ error: `Couldn't save to your Brand Voice: ${error.message}` }, { status: 500 });

  return NextResponse.json({ pillars, statement: offered.statement, replaced: mode === "replace" ? current : [] });
}
