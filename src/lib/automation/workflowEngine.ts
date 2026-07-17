import { generateEmailContent } from "@/lib/agents/emailMarketingAgent";
import { sendEmail } from "@/lib/agents/gmailAgent";

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
      .not("email", "is", null);
    if (workflow.status_filter) query = query.eq("status", workflow.status_filter);
    const { data } = await query.limit(200);
    return (data ?? []).map((l: any) => ({ leadId: l.id, email: l.email, name: l.name, triggerDate: l.created_at }));
  }

  if (workflow.trigger_type === "appointment_booked") {
    const { data } = await supabase
      .from("appointments")
      .select("created_at, leads(id, name, email)")
      .eq("dealership_id", dealershipId)
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
  if (!dealership?.gmail_email) return { stepsSent: 0, skipped: "gmail not connected" };

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

  let stepsSent = 0;

  for (const workflow of workflows) {
    const steps = (workflow.workflow_steps ?? []).sort((a: any, b: any) => a.step_order - b.step_order);
    if (steps.length === 0) continue;

    const triggeredLeads = await getTriggeredLeads(supabase, dealershipId, workflow);

    for (const lead of triggeredLeads) {
      for (const step of steps) {
        const { data: alreadyRun } = await supabase
          .from("workflow_step_runs")
          .select("id")
          .eq("step_id", step.id)
          .eq("lead_id", lead.leadId)
          .maybeSingle();
        if (alreadyRun) continue; // already sent — steps are ordered so this also means earlier steps are done

        const dueDate = new Date(lead.triggerDate);
        dueDate.setDate(dueDate.getDate() + (step.delay_days ?? 0));
        if (new Date() < dueDate) break; // not due yet — and later steps are due even later, so stop here for this lead

        let subject = step.custom_subject ?? "";
        let body = step.custom_body ?? "";
        if (step.email_task_type && step.email_task_type !== "custom") {
          const { output, _fallback } = await generateEmailContent(
            step.email_task_type,
            dealership.dealership_name ?? "our business",
            dealership.business_category ?? "business",
            lead.name ? `For lead ${lead.name}` : "",
            brandProfile
          );
          if (_fallback) break; // don't send placeholder content, try again next run
          subject = output.subject ?? subject;
          body = output.body ?? body;
        }
        if (!subject || !body) break;

        const result = await sendEmail(supabase, dealershipId, lead.email, subject, body);
        await supabase.from("workflow_step_runs").insert({
          workflow_id: workflow.id, step_id: step.id, lead_id: lead.leadId,
          success: result.success, error: result.success ? null : result.error,
        });
        if (result.success) stepsSent++;
        if (!result.success) break; // don't attempt later steps this run if sending is failing
      }
    }
  }

  return { stepsSent };
}
