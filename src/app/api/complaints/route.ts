import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const STATUSES = ["open", "in_progress", "resolved"];

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

  const { data } = await supabase
    .from("complaints")
    .select("*, leads(name, phone)")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ complaints: data ?? [] });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, status, resolutionNotes } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const update: any = { updated_at: new Date().toISOString() };
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    update.status = status;
    update.resolved_at = status === "resolved" ? new Date().toISOString() : null;
  }
  if (resolutionNotes !== undefined) update.resolution_notes = resolutionNotes;

  const { error } = await supabase.from("complaints").update(update).eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
