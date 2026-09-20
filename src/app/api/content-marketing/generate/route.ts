import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateContent } from "@/lib/agents/contentMarketingAgent";
import { recentCopy } from "@/lib/content/recentCopy";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";
import { aiFailureResponse } from "@/lib/ai/aiFailureResponse";

/** The week this piece belongs to, checked against the business's own plan. */
async function linkedWeek(supabase: any, dealershipId: string, quarterId: unknown, week: unknown) {
  const id = typeof quarterId === "string" ? quarterId : null;
  const n = Number(week);
  if (!id || !Number.isInteger(n) || n < 1) return {};
  const { data: quarter } = await supabase
    .from("strategy_quarters")
    .select("id, weeks")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  const weeks = Array.isArray(quarter?.weeks) ? quarter!.weeks : [];
  if (!quarter || !weeks.some((w: any) => Number(w?.week) === n)) return {};
  return { strategy_quarter_id: quarter.id, strategy_week: n };
}

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { contentType, topic, quarterId, week } = await request.json();
  if (!contentType) return NextResponse.json({ error: "contentType required" }, { status: 400 });

  // Made from a week of the 90-day plan? Only if that plan is this
  // business's own and really has that week — the link is what step 5
  // counts as "done", so a request body can't claim it.
  const fromWeek = await linkedWeek(supabase, dealershipId, quarterId, week);

  const [{ data: dealership }, { data: brandProfile }, facts] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice, target_persona, messaging_pillars, preferred_language").eq("dealership_id", dealershipId).maybeSingle(),
    // Written from, and checked against, what the business can back up (src/lib/claims).
    gatherBusinessFactsSafely(supabase, dealershipId),
  ]);

  const { output, _fallback, _aiFailure } = await generateContent(
    contentType,
    dealership?.dealership_name ?? "the business",
    dealership?.business_category ?? "business",
    topic ?? "",
    brandProfile,
    { supabase, dealershipId },
    undefined,
    facts,
    // A draft the owner reads before using: unverified prices are flagged, not removed.
    "draft",
    // The last five pieces so this one doesn't repeat them, and a second
    // pass that cuts anything another business could have written — worth
    // its cost here because a person reads the result.
    { recent: await recentCopy(supabase, dealershipId), revise: true }
  );
  // The AI failed: say why, save nothing (lib/ai/aiFailureResponse.ts).
  if (_aiFailure) return aiFailureResponse(_aiFailure);

  // Only save real generations to history — a fallback shouldn't
  // clutter the calendar/history with placeholder drafts.
  let saved = null;
  if (!_fallback) {
    const { data } = await supabase
      .from("content_pieces")
      .insert({ dealership_id: dealershipId, content_type: contentType, topic: topic ?? "", output, ...fromWeek })
      .select()
      .single();
    saved = data;
  }

  return NextResponse.json({ output, _fallback, id: saved?.id ?? null });
}

// Discarding a draft — what "Reject" does on a chat card. Scoped to the
// dealership in the delete itself, so a mismatched id removes nothing
// rather than ever touching another business's content.
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("content_pieces").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(30);

  return NextResponse.json({ items: data ?? [] });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, output } = await request.json();
  if (!id || !output) return NextResponse.json({ error: "id and output required" }, { status: 400 });

  // Scoped to dealership_id in the update itself (not just checked
  // beforehand) so a mismatched id silently updates zero rows instead
  // of ever touching another business's content.
  const { data, error } = await supabase
    .from("content_pieces")
    .update({ output })
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
