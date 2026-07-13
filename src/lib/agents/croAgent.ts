// ------------------------------------------------------------------
// CRO Agent (Conversion Rate Optimization)
// ------------------------------------------------------------------
// Builds on the existing landing page + lead data rather than
// collecting anything new: looks at how many people are landing on
// the page/ad vs how many actually become leads, and the page's own
// structural health (reusing the technical SEO audit's checks), then
// gives specific, actionable suggestions to improve that conversion
// rate — a different lens on the same underlying data than SEO or
// Analytics look at.
// ------------------------------------------------------------------

import { auditLandingPage } from "./seoAgent";

export interface CroReport {
  conversionRate: number | null; // leads / impressions, as a percentage
  suggestions: { issue: string; fix: string; impact: "high" | "medium" | "low" }[];
}

export async function analyzeCro(supabase: any, dealershipId: string, businessCategory: string = "car dealership"): Promise<CroReport> {
  const [{ data: page }, { data: leads }, { data: campaigns }] = await Promise.all([
    supabase.from("landing_pages").select("published, slug, headline, subheadline, hero_image_url, car_listings").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("leads").select("id").eq("dealership_id", dealershipId),
    supabase.from("ad_creatives").select("meta_campaign_id").eq("dealership_id", dealershipId).eq("status", "launched"),
  ]);

  const pageAudit = auditLandingPage(page);
  const totalLeads = leads?.length ?? 0;

  // Rough conversion signal: leads per launched campaign, as a stand-in
  // for a true visitor-to-lead rate (Meta doesn't expose page-view
  // counts to us directly without additional pixel setup).
  const conversionRate = campaigns && campaigns.length > 0 ? Math.round((totalLeads / campaigns.length) * 10) / 10 : null;

  const suggestions: CroReport["suggestions"] = [];
  for (const check of pageAudit.checks) {
    if (!check.passed) {
      suggestions.push({
        issue: `${check.label}: ${check.detail}`,
        fix: check.label === "Page is published" ? "Publish your landing page in the Website tab"
          : check.label === "Social share image" ? "Add a hero image so shared links show a preview"
          : check.label === "Page has real content depth" ? "Add at least a few featured items/products"
          : "Fix this in the Website tab",
        impact: check.label === "Page is published" ? "high" : "medium",
      });
    }
  }

  if (totalLeads === 0) {
    suggestions.unshift({
      issue: "No leads captured yet",
      fix: "Make sure your Instant Form or landing page is actually live and linked correctly from an active campaign",
      impact: "high",
    });
  }

  return { conversionRate, suggestions: suggestions.slice(0, 5) };
}
