import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireFeature } from "@/lib/featureGate";
import { checkUsage } from "@/lib/usage/usageGuard";
import { startPositioning, latestPositioning, newestRun, describeRun, positioningPaused, STOPPED_MESSAGE, PAUSED_MESSAGE } from "@/lib/strategy/positioning/run";
import { planRun, estimateView } from "@/lib/strategy/positioning/budget";
import { driveRun, pickUp } from "@/lib/strategy/positioning/continue";

// Positioning against what competitors say in public (Advanced Strategy
// step 3, lib/strategy/positioning).
//
// A run works in the background (run.ts, continue.ts): POST starts it,
// answers at once, and steps it in after() — normally to the end, inside
// 300s. The page polls GET for progress, and GET carries on a run that
// paused or whose invocation died. The server never calls itself: that
// chain (one self-call per step) hit Vercel's 508 "Loop Detected".
export const maxDuration = 300;

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
export async function GET(_request: Request) {
  const supabase = await createClient();
  const who = await dealershipOf(supabase);
  if (!who.ok) return who.response;
  const [run, found, { data: ads }] = await Promise.all([
    latestPositioning(supabase, who.dealershipId),
    newestRun(supabase, who.dealershipId),
    supabase.from("competitor_owner_ads").select("id, competitor_name, ad_text, created_at").eq("dealership_id", who.dealershipId).order("created_at", { ascending: false }),
  ]);

  // A run that stopped moving is carried on from its step (continue.ts) —
  // or, once it has been picked up too often, recorded as stopped.
  let newest = found;
  if (newest?.status === "running" && !positioningPaused()) {
    const service = createServiceClient();
    const now = Date.now();
    const picked = await pickUp(service, newest, now);
    if (picked === "picked") {
      newest = { ...newest, step_running: false, updated_at: new Date(now).toISOString() };
      after(() => driveRun(service, found.id));
    } else if (picked === "stopped") {
      newest = { ...newest, status: "failed", error: STOPPED_MESSAGE };
    }
  }
  let current = newest && newest.status !== "analysed" ? describeRun(newest) : null;
  // Nothing to show once a newer comparison has finished.
  if (current && run && Date.parse(run.created_at) > Date.parse(current.createdAt)) current = null;
  // What pressing the button would cost now — or why it can't be pressed.
  const estimate = positioningPaused()
    ? { paused: true, blocked: PAUSED_MESSAGE }
    : current?.state === "running"
      ? null
      : estimateView(await planRun(createServiceClient(), who.dealershipId));
  return NextResponse.json({ run, current, estimate, ownerAds: ads ?? [] });
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

  const body = await request.json().catch(() => ({}));
  const started = await startPositioning(service, dealershipId, { confirm: body?.confirm === true });
  if (!started.ok) {
    // Needs the owner's yes first (409), or can't run now (429: once a day, or paused).
    if (started.needsConfirm) return NextResponse.json({ error: started.error, needsConfirm: true, estimate: started.plan ? estimateView(started.plan) : null }, { status: 409 });
    return NextResponse.json({ error: started.error }, { status: started.plan?.blocked || started.error === PAUSED_MESSAGE ? 429 : 500 });
  }
  if (!started.reused) {
    // The steps run here, after the answer — normally all of them (continue.ts).
    after(() => driveRun(service, started.id));
  }
  return NextResponse.json({ id: started.id, state: "running" }, { status: 202 });
}
