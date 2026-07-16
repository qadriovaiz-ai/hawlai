import { generateEmailContent } from "@/lib/agents/emailMarketingAgent";
import { sendEmail } from "@/lib/agents/gmailAgent";

// Runs once per day per dealership as part of the existing autopilot
// cron. Handles two REAL auto-send triggers (as opposed to the
// content-only generators on the Email page):
//   - Welcome email: any lead with an email and no welcome_email_sent_at,
//     sent once, ever, per lead.
//   - Follow-up email: any lead with an email, status not converted/
//     not_interested, created more than `follow_up_inactive_days` ago,
//     and no follow_up_email_sent_at yet — sent once, ever, per lead
//     (deliberately capped at one auto follow-up to avoid spamming a
//     lead who simply hasn't responded).
// Both toggles default OFF; turning either on is the dealer's approval
// for every email it sends from then on, same as DM/comment auto-reply.
export async function runEmailAutomation(supabase: any, dealershipId: string) {
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, business_category, gmail_email, welcome_email_auto_enabled, follow_up_email_auto_enabled, follow_up_inactive_days")
    .eq("id", dealershipId)
    .single();

  if (!dealership?.gmail_email) return { welcomesSent: 0, followUpsSent: 0, skipped: "gmail not connected" };
  if (!dealership.welcome_email_auto_enabled && !dealership.follow_up_email_auto_enabled) {
    return { welcomesSent: 0, followUpsSent: 0, skipped: "automation off" };
  }

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  let welcomesSent = 0;
  let followUpsSent = 0;

  if (dealership.welcome_email_auto_enabled) {
    const { data: newLeads } = await supabase
      .from("leads")
      .select("id, name, email")
      .eq("dealership_id", dealershipId)
      .is("welcome_email_sent_at", null)
      .not("email", "is", null)
      .limit(50); // safety cap per run

    for (const lead of newLeads ?? []) {
      const { output, _fallback } = await generateEmailContent(
        "welcome_email",
        dealership.dealership_name ?? "our business",
        dealership.business_category ?? "business",
        lead.name ? `New lead named ${lead.name}` : "",
        brandProfile
      );
      if (_fallback) continue; // don't send a placeholder email
      const result = await sendEmail(supabase, dealershipId, lead.email, output.subject ?? "Welcome!", output.body ?? "");
      await supabase.from("email_automation_log").insert({
        dealership_id: dealershipId, lead_id: lead.id, email_type: "welcome",
        recipient: lead.email, subject: output.subject, success: result.success, error: result.success ? null : result.error,
      });
      if (result.success) {
        await supabase.from("leads").update({ welcome_email_sent_at: new Date().toISOString() }).eq("id", lead.id);
        welcomesSent++;
      }
    }
  }

  if (dealership.follow_up_email_auto_enabled) {
    const inactiveDays = dealership.follow_up_inactive_days ?? 3;
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: staleLeads } = await supabase
      .from("leads")
      .select("id, name, email, status")
      .eq("dealership_id", dealershipId)
      .not("email", "is", null)
      .is("follow_up_email_sent_at", null)
      .lt("created_at", cutoff)
      .not("status", "in", "(converted,not_interested)")
      .limit(50);

    for (const lead of staleLeads ?? []) {
      const { output, _fallback } = await generateEmailContent(
        "follow_up",
        dealership.dealership_name ?? "our business",
        dealership.business_category ?? "business",
        lead.name ? `Following up with ${lead.name}, who hasn't responded in a few days` : "",
        brandProfile
      );
      if (_fallback) continue;
      const result = await sendEmail(supabase, dealershipId, lead.email, output.subject ?? "Following up", output.body ?? "");
      await supabase.from("email_automation_log").insert({
        dealership_id: dealershipId, lead_id: lead.id, email_type: "follow_up",
        recipient: lead.email, subject: output.subject, success: result.success, error: result.success ? null : result.error,
      });
      if (result.success) {
        await supabase.from("leads").update({ follow_up_email_sent_at: new Date().toISOString() }).eq("id", lead.id);
        followUpsSent++;
      }
    }
  }

  return { welcomesSent, followUpsSent };
}
