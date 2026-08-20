import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { recordLeadOutcomeInsight } from "@/lib/businessMemory/outcomeInsights";
import { emitEvent } from "@/lib/events/emitEvent";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  // P1 7a — needed so the lead_converted workflow trigger can compute
  // delay_days correctly (leads had no timestamp for this before).
  const update = body.status === "converted" ? { ...body, converted_at: new Date().toISOString() } : body;

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.status) await recordLeadOutcomeInsight(supabase, data);
  if (body.status === "converted") {
    await emitEvent(supabase, { dealershipId: data.dealership_id, eventType: "lead_converted", payload: { leadId: data.id, leadName: data.name } });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
