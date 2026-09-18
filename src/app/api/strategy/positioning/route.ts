import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/featureGate";
import { checkUsage } from "@/lib/usage/usageGuard";
import { collectPositioning, analysePositioning, latestPositioning } from "@/lib/strategy/positioning/run";
import { aiFailureResponse } from "@/lib/ai/aiFailureResponse";

// Positioning against what competitors say in public (Advanced Strategy
// step 3, lib/strategy/positioning). A run is two POSTs — collect, then
// analyse — so each fits Vercel's 60 seconds.
export const maxDuration = 60;

async function dealershipOf(supabase: any): Promise<{ ok: true; dealershipId: string } | { ok: false; response: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return { ok: false, response: NextResponse.json({ error: "No dealership" }, { status: 400 }) };
  return { ok: true, dealershipId: profile.dealership_id as string };
}

/** The latest finished run, and the ads the owner has pasted in. */
export async function GET() {
  const supabase = await createClient();
  const who = await dealershipOf(supabase);
  if (!who.ok) return who.response;
  const [run, { data: ads }] = await Promise.all([
    latestPositioning(supabase, who.dealershipId),
    supabase.from("competitor_owner_ads").select("id, competitor_name, ad_text, created_at").eq("dealership_id", who.dealershipId).order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ run, ownerAds: ads ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const who = await dealershipOf(supabase);
  if (!who.ok) return who.response;
  const { dealershipId } = who;

  const gate = await requireFeature(supabase, dealershipId, "competitorIntel");
  if (!gate.allowed) return gate.response;

  const body = await request.json().catch(() => ({}));
  const service = createServiceClient();

  if (body.step === "collect") {
    // Several web searches — the most credit-expensive kind of research.
    const usage = await checkUsage(dealershipId, "research");
    if (!usage.allowed) return NextResponse.json({ error: usage.message, limitReached: true }, { status: 429 });
    const r = await collectPositioning(service, dealershipId);
    if (!r.ok) return r.aiFailure ? aiFailureResponse(r.aiFailure) : NextResponse.json({ error: r.error }, { status: 422 });
    return NextResponse.json(r);
  }

  if (body.step === "analyse") {
    if (typeof body.id !== "string" || !body.id) return NextResponse.json({ error: "Which run? Start a new one." }, { status: 400 });
    const r = await analysePositioning(service, dealershipId, body.id);
    if (!r.ok) return r.aiFailure ? aiFailureResponse(r.aiFailure) : NextResponse.json({ error: r.error }, { status: 404 });
    return NextResponse.json(r);
  }

  return NextResponse.json({ error: "step must be collect or analyse" }, { status: 400 });
}
