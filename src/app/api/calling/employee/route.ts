import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getJob, resolveJobTools, TONE_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/onboarding/callingJobs";

// UX Transformation, piece 5b — saves the AI calling employee's
// configuration from the onboarding journey.
//
// Reuses existing infrastructure entirely rather than inventing a
// parallel one:
//   job          -> agent_persona_settings (migration 139)
//   behaviour    -> dealerships.custom_call_instructions (migration 119)
//   knowledge    -> business_knowledge (migration 118)
//   boundaries   -> ai_employee_boundaries (migration 150)
// The only genuinely new store is boundaries, because free-text
// instructions render as advice the model may override, not rules.

async function resolveOwnedDealership(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return { error: NextResponse.json({ error: "No dealership" }, { status: 400 }) };

  // Configuring the AI employee is the owner's call, not a team
  // member's — same reasoning as billing identity.
  const { data: owned } = await supabase
    .from("dealerships").select("id").eq("id", dealershipId).eq("owner_id", user.id).maybeSingle();
  if (!owned) return { error: NextResponse.json({ error: "Only the business owner can set up the AI employee" }, { status: 403 }) };

  return { dealershipId };
}

export async function GET() {
  const supabase = await createClient();
  const resolved = await resolveOwnedDealership(supabase);
  if (resolved.error) return resolved.error;
  const { dealershipId } = resolved;

  const [{ data: persona }, { data: dealership }, { data: boundaries }, { data: knowledge }] = await Promise.all([
    supabase.from("agent_persona_settings").select("persona").eq("dealership_id", dealershipId).eq("channel", "call_outbound").maybeSingle(),
    supabase.from("dealerships").select("custom_call_instructions, custom_first_message").eq("id", dealershipId).single(),
    supabase.from("ai_employee_boundaries").select("id, rule, is_active").eq("dealership_id", dealershipId).eq("is_active", true).order("created_at"),
    supabase.from("business_knowledge").select("id", { count: "exact", head: false }).eq("dealership_id", dealershipId).eq("is_active", true),
  ]);

  return NextResponse.json({
    persona: persona?.persona ?? null,
    customCallInstructions: dealership?.custom_call_instructions ?? "",
    customFirstMessage: dealership?.custom_first_message ?? "",
    boundaries: boundaries ?? [],
    knowledgeCount: (knowledge ?? []).length,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveOwnedDealership(supabase);
  if (resolved.error) return resolved.error;
  const { dealershipId } = resolved;

  const { jobKey, tone, language, allowedTools, boundaries, firstMessage } = await request.json();

  const job = jobKey ? getJob(jobKey) : undefined;
  if (jobKey && !job) return NextResponse.json({ error: "Unknown job" }, { status: 400 });

  // --- Job -> persona (existing agent_persona_settings) ---
  if (job) {
    const { error } = await supabase.from("agent_persona_settings").upsert(
      { dealership_id: dealershipId, channel: "call_outbound", persona: job.persona, updated_at: new Date().toISOString() },
      { onConflict: "dealership_id,channel" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // --- Behaviour + permissions -> custom_call_instructions ---
  //
  // Composed into one instruction block rather than stored as separate
  // columns: this field already exists and already reaches the prompt,
  // so adding columns would mean new plumbing for something the
  // existing path handles. Regenerated wholesale each save so an
  // earlier choice can't linger after being changed.
  const parts: string[] = [];

  const toneOption = TONE_OPTIONS.find((t) => t.key === tone);
  if (toneOption) parts.push(toneOption.instruction);

  const languageOption = LANGUAGE_OPTIONS.find((l) => l.key === language);
  if (languageOption) parts.push(languageOption.instruction);

  if (job) {
    // Tools the owner ticked, intersected with what the job's persona
    // actually permits — the UI is never trusted to widen a grant.
    const permitted = resolveJobTools(job);
    const chosen = Array.isArray(allowedTools) ? allowedTools.filter((t: string) => permitted.includes(t)) : permitted;
    const withheld = permitted.filter((t) => !chosen.includes(t));
    if (withheld.length > 0) {
      // Stated positively as a behavioural rule. The real enforcement
      // is the tool list attached to the call (vapiCallAgent filters
      // by persona) — this only covers tools the persona permits but
      // this owner chose not to use.
      parts.push(`Do not attempt the following, even if asked: ${withheld.map((t) => t.replace(/_/g, " ")).join(", ")}. Offer to have a team member handle it instead.`);
    }
  }

  const composed = parts.join(" ").trim();

  const { error: updateError } = await supabase
    .from("dealerships")
    .update({
      custom_call_instructions: composed || null,
      ...(firstMessage !== undefined && {
        custom_first_message: typeof firstMessage === "string" && firstMessage.trim() ? firstMessage.trim() : null,
      }),
    })
    .eq("id", dealershipId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // --- Boundaries (ai_employee_boundaries) ---
  //
  // Replace-on-save: deactivate the current set, then insert what was
  // submitted. Soft-deactivation rather than delete keeps the record
  // of what was previously in force, matching business_knowledge.
  if (Array.isArray(boundaries)) {
    await supabase.from("ai_employee_boundaries").update({ is_active: false }).eq("dealership_id", dealershipId).eq("is_active", true);

    const rows = boundaries
      .map((r: any) => (typeof r === "string" ? r.trim() : ""))
      .filter((r: string) => r.length > 0)
      .slice(0, 20)
      .map((rule: string) => ({ dealership_id: dealershipId, rule: rule.slice(0, 300) }));

    if (rows.length > 0) {
      const { error: boundaryError } = await supabase.from("ai_employee_boundaries").insert(rows);
      if (boundaryError) return NextResponse.json({ error: boundaryError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
