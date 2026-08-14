import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

  const { data: test } = await supabase.from("ab_tests").select("*").eq("dealership_id", dealershipId).maybeSingle();
  if (!test) return NextResponse.json({ test: null });

  const { data: events } = await supabase
    .from("page_events")
    .select("event_type, variant")
    .eq("dealership_id", dealershipId)
    .not("variant", "is", null);

  const all = events ?? [];
  const resultsFor = (variant: string) => {
    const views = all.filter((e) => e.variant === variant && e.event_type === "view").length;
    const submits = all.filter((e) => e.variant === variant && e.event_type === "form_submit").length;
    return { views, submits, conversionRate: views > 0 ? (submits / views) * 100 : null };
  };

  return NextResponse.json({ test, results: { A: resultsFor("A"), B: resultsFor("B") } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { element, variantA, variantB } = await request.json();
  if (!element || !variantA || !variantB) return NextResponse.json({ error: "element, variantA, and variantB are required" }, { status: 400 });

  const { error } = await supabase.from("ab_tests").upsert(
    { dealership_id: dealershipId, element, variant_a: variantA, variant_b: variantB, active: true },
    { onConflict: "dealership_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { active, winner } = await request.json();

  // Master audit Part B3 — closes the "suggests but doesn't execute"
  // gap for A/B testing: writes the winning variant's text into the
  // real landing_pages field it was tested against, then ends the
  // test. Without this the only way to act on a result was to
  // manually retype the winning copy elsewhere and separately flip
  // the test off.
  if (winner === "A" || winner === "B") {
    const { data: test } = await supabase.from("ab_tests").select("*").eq("dealership_id", dealershipId).maybeSingle();
    if (!test) return NextResponse.json({ error: "No A/B test found" }, { status: 404 });

    const winningText = winner === "A" ? test.variant_a : test.variant_b;
    const field = test.element === "headline" ? "headline" : "offer_text";
    const { error: pageError } = await supabase.from("landing_pages").update({ [field]: winningText }).eq("dealership_id", dealershipId);
    if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });

    const { error } = await supabase.from("ab_tests").update({ active: false }).eq("dealership_id", dealershipId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, applied: field, winningText });
  }

  const { error } = await supabase.from("ab_tests").update({ active: !!active }).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
