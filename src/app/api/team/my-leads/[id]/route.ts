import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { recordLeadOutcomeInsight } from "@/lib/businessMemory/outcomeInsights";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase.from("team_members").select("id").eq("user_id", user.id).eq("status", "active").eq("role", "sales").maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not an active Sales team member" }, { status: 403 });

  const { status, note } = await request.json();
  const validStatuses = ["new", "ready_to_call", "called", "appointment_set", "converted", "not_interested"];
  const update: Record<string, any> = {};
  if (status !== undefined) {
    if (!validStatuses.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    update.status = status;
  }
  if (note !== undefined) update.qualification_reason = note;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const service = createServiceClient();
  // Scoped to assigned_to = this exact rep's own id — never lets a
  // Sales rep touch a lead assigned to someone else, even by guessing an id.
  const { data: lead } = await service.from("leads").select("id, assigned_to").eq("id", id).maybeSingle();
  if (!lead || lead.assigned_to !== membership.id) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const { data, error } = await service.from("leads").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (update.status) await recordLeadOutcomeInsight(service, data);
  return NextResponse.json({ success: true });
}
