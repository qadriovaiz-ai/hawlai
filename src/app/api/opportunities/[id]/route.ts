import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { recordDecisionQuietly } from "@/lib/growth/recordDecision";
import { measureForFindingType } from "@/lib/growth/measures";
import { openFindingsOfType } from "@/lib/growth/recordDecision";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { status } = await request.json();
  if (!status || !["completed", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "status must be 'completed' or 'dismissed'" }, { status: 400 });
  }

  // THE BASELINE IS READ BEFORE THE UPDATE, and that is the whole point
  // of migration 216. Resolving this row changes the very measure the
  // decision will be scored against, so nothing after this line can see
  // the state the owner decided against. The results job used to try,
  // and got the wrong side of a fifty-millisecond gap.
  //
  // The row is read first for its type: the decision needs that anyway,
  // and it is the only way to count the right findings before changing
  // one of them.
  const { data: before } = await supabase
    .from("opportunities")
    .select("type, dealership_id")
    .eq("id", id)
    .maybeSingle();
  const baseline = before?.type
    ? await openFindingsOfType(supabase, String(before.dealership_id), String(before.type))
    : null;

  const { data, error } = await supabase
    .from("opportunities")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // S5/P1 — ONLY "completed" IS A DECISION. "dismissed" is the owner
  // clearing something off a list, which is not an action whose effect
  // there is any reason to measure; recording it would fill the table
  // with decisions that can only ever come back not_measurable and make
  // the first monthly review read as noise.
  if (status === "completed") {
    await recordDecisionQuietly(supabase, {
      dealershipId: String(data.dealership_id),
      kind: "suggestion_acted_on",
      what: `Acted on: ${data.title}`,
      why: Array.isArray(data.evidence) ? (data.evidence as { kind: string; id: string }[]) : [],
      measure: measureForFindingType(String(data.type)),
      opportunityId: String(data.id),
      goalId: data.goal_id ? String(data.goal_id) : null,
      baseline,
      decidedBy: "owner",
    });
  }

  return NextResponse.json(data);
}
