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

  const { data: workflows } = await supabase
    .from("workflows")
    .select("*, workflow_steps(*)")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });

  // Run counts per workflow, for a quick "X sent" indicator.
  const withCounts = await Promise.all(
    (workflows ?? []).map(async (w: any) => {
      const stepIds = (w.workflow_steps ?? []).map((s: any) => s.id);
      let sentCount = 0;
      if (stepIds.length > 0) {
        const { count } = await supabase
          .from("workflow_step_runs")
          .select("id", { count: "exact", head: true })
          .in("step_id", stepIds)
          .eq("success", true);
        sentCount = count ?? 0;
      }
      return { ...w, sentCount };
    })
  );

  return NextResponse.json({ workflows: withCounts });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { name, triggerType, statusFilter, steps } = await request.json();
  if (!name || !triggerType || !Array.isArray(steps) || steps.length === 0) {
    return NextResponse.json({ error: "name, triggerType, and at least one step are required" }, { status: 400 });
  }

  const { data: workflow, error: wError } = await supabase
    .from("workflows")
    .insert({ dealership_id: dealershipId, name, trigger_type: triggerType, status_filter: statusFilter ?? null, enabled: false })
    .select()
    .single();
  if (wError) return NextResponse.json({ error: wError.message }, { status: 500 });

  const stepRows = steps.map((s: any, i: number) => ({
    workflow_id: workflow.id,
    step_order: i,
    delay_days: s.delayDays ?? 0,
    email_task_type: s.emailTaskType ?? "custom",
    custom_subject: s.customSubject ?? null,
    custom_body: s.customBody ?? null,
  }));
  const { error: sError } = await supabase.from("workflow_steps").insert(stepRows);
  if (sError) return NextResponse.json({ error: sError.message }, { status: 500 });

  return NextResponse.json({ success: true, workflowId: workflow.id });
}
