import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dealership } = await supabase.from("dealerships").select("id").eq("owner_id", user.id).maybeSingle();
  if (!dealership) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, brief, department, status, assigned_role, due_at, created_at, completed_at, team_members(email, role)")
    .eq("dealership_id", dealership.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ tasks: tasks ?? [] });
}
