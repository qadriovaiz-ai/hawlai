import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve via the active dealership, not an owner_id-only lookup —
  // that silently breaks (returns null) once the owner has 2+
  // businesses. See /api/team/route.ts for the full explanation.
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const { data: dealership } = profile?.dealership_id
    ? await supabase.from("dealerships").select("id").eq("id", profile.dealership_id).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  if (!dealership) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, title, brief, department, status, assigned_role, due_at, created_at, completed_at, team_members(email, role)")
    .eq("dealership_id", dealership.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: tasks ?? [] });
}
