import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireFeature } from "@/lib/featureGate";
import { checkUsage } from "@/lib/usage/usageGuard";
import { startPositioning, latestPositioning, newestRun, describeRun, STOPPED_MESSAGE } from "@/lib/strategy/positioning/run";
import { driveRun } from "@/lib/strategy/positioning/continue";

// Positioning against what competitors say in public (Advanced Strategy
// step 3, lib/strategy/positioning).
//
// A run works in the background, one step per invocation (run.ts): POST
// starts it and answers at once; the page polls GET for progress. It used
// to be two long requests, and collecting ran past Vercel's 60 seconds
// every time (504).
export const maxDuration = 60;

async function dealershipOf(supabase: any): Promise<{ ok: true; dealershipId: string } | { ok: false; response: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return { ok: false, response: NextResponse.json({ error: "No dealership" }, { status: 400 }) };
  return { ok: true, dealershipId: profile.dealership_id as string };
}

/**
 * The latest finished comparison, the run in progress (if any) with what
 * it's doing, and the ads the owner has pasted in.
 */
export async function GET() {
  const supabase = await createClient();
  const who = await dealershipOf(supabase);
  if (!who.ok) return who.response;
  const [run, newest, { data: ads }] = await Promise.all([
    latestPositioning(supabase, who.dealershipId),
    newestRun(supabase, who.dealershipId),
    supabase.from("competitor_owner_ads").select("id, competitor_name, ad_text, created_at").eq("dealership_id", who.dealershipId).order("created_at", { ascending: false }),
  ]);

  let current = newest && newest.status !== "analysed" ? describeRun(newest) : null;
  // A run that stopped moving is recorded as stopped, so it never spins again.
  if (current && newest.status === "running" && current.state === "failed") {
    await createServiceClient()
      .from("competitor_positioning")
      .update({ status: "failed", error: STOPPED_MESSAGE, step_running: false })
      .eq("id", newest.id)
      .eq("dealership_id", who.dealershipId)
      .eq("status", "running");
  }
  // Nothing to show once a newer comparison has finished.
  if (current && run && Date.parse(run.created_at) > Date.parse(current.createdAt)) current = null;
  return NextResponse.json({ run, current, ownerAds: ads ?? [] });
}

/** Starts a comparison (or returns the one already running) and answers at once. */
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const who = await dealershipOf(supabase);
  if (!who.ok) return who.response;
  const { dealershipId } = who;

  const gate = await requireFeature(supabase, dealershipId, "competitorIntel");
  if (!gate.allowed) return gate.response;

  const service = createServiceClient();
  // Several web searches — the most credit-expensive kind of research.
  const usage = await checkUsage(dealershipId, "research");
  if (!usage.allowed) return NextResponse.json({ error: usage.message, limitReached: true }, { status: 429 });

  const started = await startPositioning(service, dealershipId);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: 500 });
  if (!started.reused) {
    const origin = new URL(request.url).origin;
    // The first step runs here, after the answer; the rest hand over.
    after(() => driveRun(service, origin, started.id));
  }
  return NextResponse.json({ id: started.id, state: "running" }, { status: 202 });
}
