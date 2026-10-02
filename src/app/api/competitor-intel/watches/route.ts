import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/featureGate";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // Brought in line with the plan on every read: a downgrade pauses the
  // extras, an upgrade brings them back, and nothing is deleted either
  // way. Idempotent, so a plan that has not changed costs nothing.
  const { reconcileWatches, watchesAllowed, watchLimitMessage } = await import("@/lib/automation/watchLimits");
  const { data: planRow } = await supabase.from("dealerships").select("plan").eq("id", dealershipId).maybeSingle();
  await reconcileWatches(supabase, dealershipId, planRow?.plan);

  const [{ data: watches }, { data: alerts }] = await Promise.all([
    supabase.from("competitor_watches").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }),
    supabase.from("competitor_alerts").select("*").eq("dealership_id", dealershipId).order("detected_at", { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    watches: watches ?? [],
    alerts: alerts ?? [],
    limit: watchesAllowed(planRow?.plan),
    limitMessage: watchLimitMessage(planRow?.plan),
    plan: planRow?.plan ?? "free",
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const gate = await requireFeature(supabase, dealershipId, "competitorIntel");
  if (!gate.allowed) return gate.response;

  const { competitorName } = await request.json();
  if (!competitorName) return NextResponse.json({ error: "competitorName required" }, { status: 400 });

  // Refused before the row exists rather than added and quietly paused:
  // an owner who types a name and sees it appear has been told it is
  // being watched, and it would not be.
  const { watchesAllowed: allowedFor, watchLimitMessage: limitMessage } = await import("@/lib/automation/watchLimits");
  const { data: planFor } = await supabase.from("dealerships").select("plan").eq("id", dealershipId).maybeSingle();
  const { data: active } = await supabase.from("competitor_watches").select("id").eq("dealership_id", dealershipId).eq("paused", false);
  if ((active ?? []).length >= allowedFor(planFor?.plan)) {
    return NextResponse.json({ error: limitMessage(planFor?.plan), limit: allowedFor(planFor?.plan) }, { status: 403 });
  }

  const { error } = await supabase.from("competitor_watches").insert({ dealership_id: dealershipId, competitor_name: competitorName });
  if (error && !error.message.includes("duplicate")) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id } = await request.json();
  const { error } = await supabase.from("competitor_watches").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
