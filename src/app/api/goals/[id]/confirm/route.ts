import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { recordDecisionQuietly } from "@/lib/growth/recordDecision";
import { measureForFindingType } from "@/lib/growth/measures";
import { openFindingsOfType } from "@/lib/growth/recordDecision";

// P2 28a — this is where a draft goal's proposed_tasks actually
// become real tasks/agent_tasks rows. Same owner-only resolution as
// /api/owner-goals (the surface this feeds).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const { data: dealership } = profile?.dealership_id
    ? await supabase.from("dealerships").select("id, dealership_name, business_category").eq("id", profile.dealership_id).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  if (!dealership) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const service = createServiceClient();
  const { data: goal } = await service.from("goals").select("id, status, proposed_tasks, title, source_key").eq("id", id).eq("dealership_id", dealership.id).maybeSingle();
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  if (goal.status !== "draft") return NextResponse.json({ error: "This goal isn't a pending draft" }, { status: 400 });

  const [{ data: team }, { data: brandProfile }] = await Promise.all([
    service.from("team_members").select("id, role").eq("dealership_id", dealership.id).eq("status", "active"),
    service.from("brand_profiles").select("tone_of_voice").eq("dealership_id", dealership.id).maybeSingle(),
  ]);

  let humanCreated = 0;
  let agentCreated = 0;
  const skipped: string[] = [];
  for (const task of (goal.proposed_tasks ?? []) as any[]) {
    if (task.type === "human") {
      // A role held when the plan was drafted may no longer be held
      // now (team changes) — re-checked fresh here, not trusted from
      // when the draft was made.
      const match = (team ?? []).find((t) => t.role === task.role);
      if (!match) { skipped.push(task.title); continue; }
      const { error } = await service.from("tasks").insert({
        dealership_id: dealership.id, goal_id: goal.id, title: task.title, brief: task.brief,
        assigned_to: match.id, assigned_role: task.role, created_by: null, status: "open",
      });
      if (!error) humanCreated++;
    } else {
      const { error } = await service.from("agent_tasks").insert({
        dealership_id: dealership.id, goal_id: goal.id, action_type: "generate_content",
        action_details: {
          contentType: task.contentType, topic: task.topic,
          businessName: dealership.dealership_name ?? "the business",
          businessCategory: dealership.business_category ?? "business",
          toneOfVoice: brandProfile?.tone_of_voice ?? null,
        },
        title: task.title, created_by: "master_chat_tool:set_goal",
      });
      if (!error) agentCreated++;
    }
  }

  // BEFORE THE ACTIVATION, by the same rule as the suggestion route.
  // Confirming a goal does not itself close a finding, so this would
  // read the same a moment later — but "capture the baseline before the
  // action" is the rule, and a rule that holds only where it happens
  // not to matter is not a rule.
  const baseline = goal.source_key
    ? await openFindingsOfType(service, dealership.id, String(goal.source_key))
    : null;

  const { error: activateError } = await service.from("goals").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", goal.id);
  if (activateError) return NextResponse.json({ error: activateError.message }, { status: 500 });

  // S5/P1 — the owner decided something, so it is on record with a date
  // to look at it. AFTER the activation, never before: a decision row
  // for a goal that failed to activate would be a record of something
  // that did not happen.
  //
  // MEASURED BY WHETHER THE THING THE GOAL IS ABOUT GOES AWAY. For a
  // goal drafted from the audit that is the one measure always
  // available and always relevant, needing no new collection and no
  // attribution. A goal the owner wrote himself has no source_key, so
  // there is nothing counted to point at and its outcome will say so.
  await recordDecisionQuietly(service, {
    dealershipId: dealership.id,
    kind: "goal_confirmed",
    what: `Confirmed the goal "${goal.title}"`,
    why: [{ kind: "goal", id: String(goal.id) }],
    measure: goal.source_key
      ? measureForFindingType(String(goal.source_key))
      : { metric: `progress on "${goal.title}"`, source: null, direction: "up" },
    goalId: String(goal.id),
    baseline,
    decidedBy: "owner",
  });

  return NextResponse.json({ success: true, humanCreated, agentCreated, skipped });
}
