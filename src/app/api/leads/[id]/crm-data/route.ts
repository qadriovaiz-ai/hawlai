import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: notes }, { data: tasks }] = await Promise.all([
    supabase.from("lead_notes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("lead_tasks").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({ notes: notes ?? [], tasks: tasks ?? [] });
}
