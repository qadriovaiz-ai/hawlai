import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { getPlanLimits } from "@/lib/plans";

// Phase 4 / 2a — an agency owner caps a client business below what
// their plan grants.
//
// client_limit_overrides has SELECT-only RLS (migration 148), so
// writes go through the service-role client AFTER ownership of the
// specific target business is proven here.

const FIELDS = [
  "images_per_month",
  "videos_per_month",
  "voiceover_chars_per_month",
  "research_credits_per_month",
  "calling_minutes",
  "messages_per_day",
] as const;

async function ownedDealerships(supabase: any, userId: string) {
  const { data } = await supabase
    .from("dealerships")
    .select("id, dealership_name, plan")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const businesses = await ownedDealerships(supabase, user.id);
  if (businesses.length === 0) return NextResponse.json({ businesses: [] });

  const service = createServiceClient();
  const { data: overrides } = await service
    .from("client_limit_overrides")
    .select("*")
    .in("dealership_id", businesses.map((b: any) => b.id));
  const overrideById = new Map((overrides ?? []).map((o: any) => [o.dealership_id, o]));

  // Each business's PLAN limits are returned alongside its override so
  // the UI can show what the plan grants vs what the agency capped it
  // to, and validate a new value client-side before submitting.
  const rows = await Promise.all(
    businesses.map(async (b: any) => {
      const limits = await getPlanLimits(service, b.plan);
      return {
        id: b.id,
        name: b.dealership_name,
        plan: b.plan,
        planLimits: {
          images_per_month: limits.imagesPerMonth,
          videos_per_month: limits.videosPerMonth,
          voiceover_chars_per_month: limits.voiceoverCharsPerMonth,
          research_credits_per_month: limits.researchCreditsPerMonth,
          calling_minutes: limits.callingFreeMinutes,
          messages_per_day: limits.messagesPerDay,
        },
        override: overrideById.get(b.id) ?? null,
      };
    })
  );

  return NextResponse.json({ businesses: rows });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { dealershipId } = body;
  if (!dealershipId) return NextResponse.json({ error: "dealershipId is required" }, { status: 400 });

  const businesses = await ownedDealerships(supabase, user.id);
  const target = businesses.find((b: any) => b.id === dealershipId);
  if (!target) return NextResponse.json({ error: "You don't own that business" }, { status: 403 });

  const service = createServiceClient();
  const planLimits = await getPlanLimits(service, target.plan);
  const planValueFor: Record<string, number | null> = {
    images_per_month: planLimits.imagesPerMonth,
    videos_per_month: planLimits.videosPerMonth,
    voiceover_chars_per_month: planLimits.voiceoverCharsPerMonth,
    research_credits_per_month: planLimits.researchCreditsPerMonth,
    calling_minutes: planLimits.callingFreeMinutes,
    messages_per_day: planLimits.messagesPerDay,
  };

  const update: Record<string, any> = {
    dealership_id: dealershipId,
    set_by: user.id,
    updated_at: new Date().toISOString(),
  };

  for (const field of FIELDS) {
    if (!(field in body)) continue;
    const raw = body[field];

    // Empty string / null clears the override back to the plan value.
    if (raw === null || raw === "") {
      update[field] = null;
      continue;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      return NextResponse.json({ error: `${field} must be a whole number of 0 or more, or blank to remove the cap.` }, { status: 400 });
    }

    // The core rule, enforced server-side rather than trusted from the
    // UI: an override can only TIGHTEN. Rejected loudly rather than
    // silently clamped, so an agency owner knows their input didn't
    // do what they typed.
    const planValue = planValueFor[field];
    if (planValue != null && value > planValue) {
      return NextResponse.json(
        { error: `Can't set ${field} to ${value} — the ${target.plan} plan only includes ${planValue}. An override can lower a client's limit, never raise it above what the plan sells.` },
        { status: 400 }
      );
    }

    update[field] = value;
  }

  const { data, error } = await service
    .from("client_limit_overrides")
    .upsert(update, { onConflict: "dealership_id" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ override: data });
}
