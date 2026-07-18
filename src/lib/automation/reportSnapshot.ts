import { generateExecutiveReport } from "@/lib/agents/reportingAgent";
import { generateGrowthReport } from "@/lib/agents/growthAdvisorAgent";

// Saves a point-in-time snapshot of the executive + growth report so
// "Weekly Reports" and "Monthly Reports" are real historical records,
// not just always-live "right now" numbers. Runs as part of the daily
// cron but only actually saves on the relevant day (Monday for
// weekly, the 1st for monthly) — cheap to check daily, no separate
// cron schedule needed.
export async function runReportSnapshots(supabase: any, dealershipId: string, businessCategory: string) {
  const today = new Date();
  const isMonday = today.getDay() === 1;
  const isFirstOfMonth = today.getDate() === 1;
  if (!isMonday && !isFirstOfMonth) return { saved: [] };

  const [report, growth] = await Promise.all([
    generateExecutiveReport(supabase, dealershipId),
    generateGrowthReport(supabase, dealershipId, businessCategory),
  ]);
  const stats = { ...report.stats, healthScore: growth.healthScore, headline: growth.headline, strengths: growth.strengths, risks: growth.risks, nextActions: growth.nextActions };

  const saved: string[] = [];
  if (isMonday) {
    await supabase.from("report_snapshots").insert({ dealership_id: dealershipId, period_type: "weekly", stats });
    saved.push("weekly");
  }
  if (isFirstOfMonth) {
    await supabase.from("report_snapshots").insert({ dealership_id: dealershipId, period_type: "monthly", stats });
    saved.push("monthly");
  }
  return { saved };
}
