import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { decomposeGoal } from "@/lib/agents/goalPlanningAgent";

// P2 26a (Strategy -> Execution Loop) — turns one Growth Advisor
// recommendation into a draft goal, reusing the exact same
// draft-then-confirm mechanism set_goal already uses (28a). This
// route never creates a real task/agent_task itself — it only ever
// produces a status:'draft' goals row; /api/goals/[id]/confirm (which
// this doesn't call) is the only thing that can make it real.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { recommendationText } = await request.json();
  if (!recommendationText || typeof recommendationText !== "string") {
    return NextResponse.json({ error: "recommendationText is required" }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const { data: dealership } = profile?.dealership_id
    ? await supabase.from("dealerships").select("id, dealership_name, business_category").eq("id", profile.dealership_id).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  if (!dealership) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const service = createServiceClient();
  const { data: team } = await service.from("team_members").select("role").eq("dealership_id", dealership.id).eq("status", "active");
  const availableRoles = Array.from(new Set((team ?? []).map((t: any) => t.role)));

  const plan = await decomposeGoal(recommendationText, dealership.dealership_name ?? "the business", dealership.business_category ?? "business", availableRoles, { supabase: service, dealershipId: dealership.id });
  if (!plan || !plan.tasks || plan.tasks.length === 0) {
    return NextResponse.json({ error: "Couldn't turn this into a concrete plan — try a more specific recommendation." }, { status: 422 });
  }

  const { data: goal, error } = await service.from("goals").insert({
    dealership_id: dealership.id,
    status: "draft",
    title: plan.title,
    description: plan.description,
    target_metric: plan.target_metric,
    target_value: plan.target_value,
    deadline: plan.deadline,
    proposed_tasks: plan.tasks,
    created_by: "growth_advisor:create_goal_draft",
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, goalId: goal.id, title: plan.title, taskCount: plan.tasks.length });
}
