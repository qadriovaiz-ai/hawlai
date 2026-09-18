import { generateEmailContent } from "@/lib/agents/emailMarketingAgent";
import { sendMarketingEmail } from "@/lib/email/sendMarketingEmail";
import { normaliseEmail, suppressedAmong } from "@/lib/email/consent";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";

interface TriggeredLead {
  leadId: string;
  email: string;
  name: string;
  triggerDate: string;
}

// Finds the set of leads a trigger currently applies to, along with
// the date each one "entered" the workflow (used to calculate step
// delays from).
async function getTriggeredLeads(supabase: any, dealershipId: string, workflow: any): Promise<TriggeredLead[]> {
  if (workflow.trigger_type === "new_lead") {
    let query = supabase
      .from("leads")
      .select("id, name, email, created_at, status")
      .eq("dealership_id", dealershipId)
      .not("email", "is", null)
      .eq("dnd_opt_out", false); // master audit Part C1.3 — never auto-email an opted-out lead
    if (workflow.status_filter) query = query.eq("status", workflow.status_filter);
    const { data } = await query.limit(200);
    return (data ?? []).map((l: any) => ({ leadId: l.id, email: l.email, name: l.name, triggerDate: l.created_at }));
  }

  // P1 7a — same polling pattern as new_lead, not event-driven: this
  // engine already re-scans daily and relies on workflow_step_runs'
  // unique constraint + the dueDate check for idempotency, so a new
  // trigger type needs zero new plumbing. Uses converted_at (migration
  // 134), not created_at — every converted lead's created_at is
  // already in the past, which would've made delay_days meaningless.
  if (workflow.trigger_type === "lead_converted") {
    const { data } = await supabase
      .from("leads")
      .select("id, name, email, converted_at, status")
      .eq("dealership_id", dealershipId)
      .eq("status", "converted")
      .not("email", "is", null)
      .not("converted_at", "is", null)
      .eq("dnd_opt_out", false)
      .limit(200);
    return (data ?? []).map((l: any) => ({ leadId: l.id, email: l.email, name: l.name, triggerDate: l.converted_at }));
  }

  if (workflow.trigger_type === "appointment_booked") {
    // !inner + dot-path filter so the DND check applies to the joined
    // lead row, not the appointment itself — appointments has no
    // dnd_opt_out column of its own.
    const { data } = await supabase
      .from("appointments")
      .select("created_at, leads!inner(id, name, email, dnd_opt_out)")
      .eq("dealership_id", dealershipId)
      .eq("leads.dnd_opt_out", false)
      .limit(200);
    return (data ?? [])
      .filter((a: any) => a.leads?.email)
      .map((a: any) => ({ leadId: a.leads.id, email: a.leads.email, name: a.leads.name, triggerDate: a.created_at }));
  }

  return [];
}

// Runs every enabled workflow for one dealership. Safe to call daily
// — each (step, lead) pair only ever sends once thanks to the unique
// constraint on workflow_step_runs, and steps only fire once their
// delay has elapsed since the trigger date, in order.
export async function runWorkflows(supabase: any, dealershipId: string) {
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, business_category, gmail_email")
    .eq("id", dealershipId)
    .single();
  if (!dealership) return { stepsSent: 0, skipped: "no dealership" };

  const { data: workflows } = await supabase
    .from("workflows")
    .select("*, workflow_steps(*)")
    .eq("dealership_id", dealershipId)
    .eq("enabled", true);
  if (!workflows || workflows.length === 0) return { stepsSent: 0, skipped: "no enabled workflows" };

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  // AI-written steps are emailed with no human in between, so they're
  // written from, and checked against, the business's facts
  // (src/lib/claims). Custom steps are the owner's own words and send as
  // written.
  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);

  let stepsSent = 0;
  // Why email steps couldn't go out this run — reported instead of a bare
  // { stepsSent: 0 }, which the health card used to read as success.
  let blocked: string | null = null;

  for (const workflow of workflows) {
    const steps = (workflow.workflow_steps ?? []).sort((a: any, b: any) => a.step_order - b.step_order);
    if (steps.length === 0) continue;

    const triggeredLeads = await getTriggeredLeads(supabase, dealershipId, workflow);
    // An unsubscribed lead gets no workflow EMAIL — checked before a step
    // writes one. A refused send used to be recorded as a failed step and
    // retried every run, generating a fresh email each time. Steps that
    // don't email the lead (queue_content) still run.
    let unsubscribed: Set<string>;
    try {
      unsubscribed = await suppressedAmong(supabase, dealershipId, triggeredLeads.map((l) => l.email));
    } catch (err: any) {
      blocked = `unsubscribe list unreadable — ${err.message}`;
      break;
    }

    for (const lead of triggeredLeads) {
      for (const step of steps) {
        const { data: alreadyRun } = await supabase
          .from("workflow_step_runs")
          .select("id, success")
          .eq("step_id", step.id)
          .eq("lead_id", lead.leadId)
          .maybeSingle();
        // Only a step that SUCCEEDED is done. A failed one used to count
        // too (one row per step and lead), so it was never retried and the
        // lead moved on to the next step as if the email had gone out.
        if (alreadyRun?.success) continue;

        const dueDate = new Date(lead.triggerDate);
        dueDate.setDate(dueDate.getDate() + (step.delay_days ?? 0));
        if (new Date() < dueDate) break; // not due yet — and later steps are due even later, so stop here for this lead

        // P1 7a — queue_content queues the AI to generate a piece of
        // content instead of emailing this specific lead. Not
        // personalized per-lead (content_pieces has no lead
        // reference) — the topic is set by whoever built the
        // workflow, same simplicity as a custom email's fixed text.
        if (step.action_type === "queue_content") {
          if (!step.content_type) break; // misconfigured step — nothing sensible to queue
          const { error: taskError } = await supabase.from("agent_tasks").insert({
            dealership_id: dealershipId,
            action_type: "generate_content",
            action_details: {
              contentType: step.content_type, topic: step.content_topic ?? "",
              businessName: dealership.dealership_name ?? "our business",
              businessCategory: dealership.business_category ?? "business",
              toneOfVoice: brandProfile?.tone_of_voice ?? null,
            },
            title: `Workflow: ${workflow.name} — step ${step.step_order + 1}`,
            created_by: `workflow:${workflow.id}`,
          });
          await supabase.from("workflow_step_runs").upsert(
            { workflow_id: workflow.id, step_id: step.id, lead_id: lead.leadId, success: !taskError, error: taskError?.message ?? null, sent_at: new Date().toISOString() },
            { onConflict: "step_id,lead_id" }
          );
          if (!taskError) stepsSent++;
          if (taskError) break;
          continue;
        }

        // An email step for an unsubscribed lead: nothing is written, sent,
        // recorded or retried. Later non-email steps still run.
        if (unsubscribed.has(normaliseEmail(lead.email))) continue;

        if (!dealership.gmail_email) {
          blocked = "gmail not connected"; // email step, but Gmail isn't connected — try again once it is
          break;
        }

        let subject = step.custom_subject ?? "";
        let body = step.custom_body ?? "";
        // Generated steps go out as the visual email; an owner's own
        // custom text is sent as they wrote it. Both get the footer.
        let draft: any = null;
        if (step.email_task_type && step.email_task_type !== "custom") {
          if (!facts) {
            blocked = "business facts unreadable"; // nothing unverified is sent; try again next run
            break;
          }
          const { output, _fallback, claimsRemoved } = await generateEmailContent(
            step.email_task_type,
            dealership.dealership_name ?? "our business",
            dealership.business_category ?? "business",
            lead.name ? `For lead ${lead.name}` : "",
            brandProfile,
            undefined,
            undefined,
            facts
          );
          if (_fallback) break; // don't send placeholder content, try again next run
          // Only an email that needed NO claims removed is sent — a
          // stripped one can read oddly and nobody is checking it.
          if (claimsRemoved?.length) break;
          subject = output.subject || subject;
          body = output.body || body;
          draft = { ...output, subject };
        }
        if (!subject || !body) break;

        const result = await sendMarketingEmail(
          supabase,
          dealershipId,
          lead.email,
          draft && facts ? { draft, facts } : { subject, text: body, businessName: dealership.dealership_name ?? "" }
        );
        // No address: no email can go today. Not recorded against the step,
        // so it goes out once the address is added.
        if (!result.success && result.refused === "no_address") return { stepsSent, skipped: "business address missing" };
        await supabase.from("workflow_step_runs").upsert(
          {
            workflow_id: workflow.id, step_id: step.id, lead_id: lead.leadId,
            success: result.success, error: result.success ? null : result.error,
            resend_message_id: result.success ? result.resendMessageId ?? null : null,
            sent_at: new Date().toISOString(),
          },
          { onConflict: "step_id,lead_id" }
        );
        if (result.success) stepsSent++;
        if (!result.success) break; // don't attempt later steps this run if sending is failing
      }
    }
  }

  if (blocked) return stepsSent === 0 ? { stepsSent, skipped: blocked } : { stepsSent, waiting: blocked };
  return { stepsSent };
}
