import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { resolveActiveMembership } from "@/lib/teamMembership";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await resolveActiveMembership(supabase, user.id);
  if (!membership) return NextResponse.json({ error: "Not an active team member" }, { status: 403 });

  const { status } = await request.json();
  if (!["in_progress", "done"].includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const service = createServiceClient();
  // Scoped to assigned_to = this exact member's own id — they can
  // never touch a task assigned to someone else, even by guessing an id.
  const { data: task } = await service.from("tasks").select("id, assigned_to").eq("id", id).maybeSingle();
  if (!task || task.assigned_to !== membership.id) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const update: Record<string, any> = { status };
  if (status === "done") update.completed_at = new Date().toISOString();
  const { error } = await service.from("tasks").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
