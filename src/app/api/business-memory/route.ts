import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * The categories business_memory.category will actually accept.
 *
 * READ FROM THE LIVE DATABASE (pg_get_constraintdef, 2026-10-03), not
 * from the repo's migrations — prod has drifted from them before, and a
 * list that disagrees with the CHECK is worse than no list: it promises
 * a value the write then rejects.
 *
 * Kept in one place because PATCH had no list at all. It passed whatever
 * arrived straight into the update, so a category outside this set hit
 * the constraint and the owner was shown a raw Postgres message with a
 * 500 — a validation problem reported as a server fault.
 *
 * NOT the same vocabulary as business_knowledge, which is a different
 * table with a different purpose (hours, pricing_note, policy, faq,
 * general, business_story). Stage 2's "Keep" writes there, not here.
 */
const MEMORY_CATEGORIES = ["campaign_performance", "audience_insight", "content_preference", "timing", "general"] as const;
type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

function isMemoryCategory(value: unknown): value is MemoryCategory {
  return typeof value === "string" && (MEMORY_CATEGORIES as readonly string[]).includes(value);
}

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

  const { data } = await supabase.from("business_memory").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false });
  return NextResponse.json({ memories: data ?? [] });
}

// The dealer can add a memory directly too, not just the AI — same
// principle as Claude's own memory: the person can always add,
// correct, or remove what's remembered about their business.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  if (!body.insight?.trim()) return NextResponse.json({ error: "insight required" }, { status: 400 });

  // Best effort on the way IN: "remember this" should not fail because a
  // category came through slightly off. But the caller is told where it
  // actually landed, so a reclassification isn't silent.
  const category: MemoryCategory = isMemoryCategory(body.category) ? body.category : "general";
  const filedUnder = body.category !== undefined && category !== body.category ? category : null;

  const { data, error } = await supabase.from("business_memory").insert({
    dealership_id: dealershipId, category, insight: body.insight.trim(), source: "manual",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    success: true,
    memory: data,
    ...(filedUnder ? { note: `"${body.category}" isn't one of the categories, so this was filed under General.` } : {}),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, insight, category } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // CHECKED BEFORE THE WRITE, not by the database afterwards.
  //
  // PATCH had no list: whatever arrived went into the update, hit
  // business_memory_category_check and came back as a 500 carrying a raw
  // Postgres message. The owner was shown a server fault for what is a
  // validation problem, with nothing saying which values are allowed.
  //
  // Exact-or-refuse here, unlike POST: an edit is the owner saying
  // "change it to this one", and quietly filing it somewhere else would
  // be answering a different request.
  if (category !== undefined && !isMemoryCategory(category)) {
    return NextResponse.json(
      { error: `"${String(category)}" isn't a memory category. Choose one of: ${MEMORY_CATEGORIES.join(", ")}.`, allowed: MEMORY_CATEGORIES },
      { status: 400 }
    );
  }
  // An empty insight is an empty memory. POST has always refused one;
  // the edit path would happily blank an existing row.
  if (insight !== undefined && !String(insight).trim()) {
    return NextResponse.json({ error: "A memory can't be empty — delete it instead if it's no longer true." }, { status: 400 });
  }

  const update: any = { updated_at: new Date().toISOString() };
  if (insight !== undefined) update.insight = String(insight).trim();
  if (category !== undefined) update.category = category;

  // Scoped to this business on the way in, and the row count checked on
  // the way out: an id belonging to someone else matches nothing, which
  // Supabase reports as a success with no rows.
  const { data, error } = await supabase.from("business_memory").update(update).eq("id", id).eq("dealership_id", dealershipId).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "That memory isn't one of yours, or it's already been deleted." }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id } = await request.json();
  const { error } = await supabase.from("business_memory").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
