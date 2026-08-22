// ------------------------------------------------------------------
// Department spend breakdown — Usage/Pricing/Cost-Control, Phase 4 / 2b.
// ------------------------------------------------------------------
// Groups api_usage_logs.operation into human departments and sums real
// logged cost_inr. Read-only: no limits, no enforcement. The point is
// answering "where does this client's cost actually go" — and, since
// per-department caps were deliberately NOT built (see migration 148's
// header), giving real data to judge whether they'd ever be worth it.
//
// The operation keys below were taken from the 42 distinct values
// actually present in the codebase's logging calls, not invented.
// Anything unrecognized falls into "Other" rather than being dropped,
// so the department totals always reconcile to the overall total —
// a breakdown that silently loses money is worse than no breakdown.
// ------------------------------------------------------------------

export const DEPARTMENTS = [
  "AI Employee",
  "Content & SEO",
  "Social & Messaging",
  "Advertising",
  "Research & Intelligence",
  "Creative Production",
  "Website",
  "Calling & Leads",
  "Reports & Strategy",
  "Other",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

const OPERATION_DEPARTMENT: Record<string, Department> = {
  master_chat: "AI Employee",
  chatbot: "AI Employee",
  goal_decomposition: "AI Employee",

  content_generation: "Content & SEO",
  seo_blog_post: "Content & SEO",
  seo_keywords: "Content & SEO",
  seo_page: "Content & SEO",
  seo_task: "Content & SEO",
  aeo_check: "Content & SEO",

  social_caption: "Social & Messaging",
  social_task: "Social & Messaging",
  whatsapp_generation: "Social & Messaging",
  email_generation: "Social & Messaging",
  retention_message: "Social & Messaging",
  follow_up_message: "Social & Messaging",

  ad_plan: "Advertising",
  paid_ads_plan: "Advertising",
  explain_campaign: "Advertising",
  optimization_recommendations: "Advertising",
  campaign_edit_budget: "Advertising",
  campaign_edit_match: "Advertising",
  campaign_edit_targeting: "Advertising",
  retargeting_copy: "Advertising",
  influencer_plan: "Advertising",

  research: "Research & Intelligence",
  competitor_intel: "Research & Intelligence",
  competitor_monitor: "Research & Intelligence",
  topic_monitor: "Research & Intelligence",
  business_intelligence: "Research & Intelligence",

  graphic_design: "Creative Production",
  canvas_edit: "Creative Production",
  brand_kit: "Creative Production",
  video_marketing: "Creative Production",
  video_generation: "Creative Production",
  voiceover: "Creative Production",

  website_plan: "Website",
  website_page_generation: "Website",
  landing_page_copy: "Website",
  cro_suggestions: "Website",

  ai_call: "Calling & Leads",
  call_scoring: "Calling & Leads",

  marketing_strategy: "Reports & Strategy",
  growth_advisor: "Reports & Strategy",
  growth_report: "Reports & Strategy",
  executive_report: "Reports & Strategy",
  pitch_deck_content: "Reports & Strategy",
};

export function departmentFor(operation: string): Department {
  return OPERATION_DEPARTMENT[operation] ?? "Other";
}

export interface DepartmentSpendRow {
  department: Department;
  costInr: number;
  calls: number;
  /** Share of the total, 0-1. Computed here so every consumer agrees on the denominator. */
  share: number;
}

interface UsageLogRow {
  operation: string;
  cost_inr: number | string | null;
}

export function computeDepartmentSpend(logs: UsageLogRow[]): { rows: DepartmentSpendRow[]; totalInr: number } {
  const byDepartment = new Map<Department, { costInr: number; calls: number }>();

  for (const log of logs) {
    const dept = departmentFor(log.operation);
    const entry = byDepartment.get(dept) ?? { costInr: 0, calls: 0 };
    entry.costInr += Number(log.cost_inr) || 0;
    entry.calls += 1;
    byDepartment.set(dept, entry);
  }

  const totalInr = Array.from(byDepartment.values()).reduce((s, v) => s + v.costInr, 0);

  const rows = Array.from(byDepartment.entries())
    .map(([department, v]) => ({
      department,
      costInr: Math.round(v.costInr * 100) / 100,
      calls: v.calls,
      share: totalInr > 0 ? v.costInr / totalInr : 0,
    }))
    .sort((a, b) => b.costInr - a.costInr);

  return { rows, totalInr: Math.round(totalInr * 100) / 100 };
}
