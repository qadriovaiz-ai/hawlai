// ------------------------------------------------------------------
// CRO Agent (Conversion Rate Optimization) — the Page Health Check
// ------------------------------------------------------------------
// How many people land vs how many become leads, plus the structural
// health of the page they land on, turned into specific fixes.
//
// THE LIVE SITE FIRST. This used to audit only the landing_pages
// record, which is empty for anyone who built their site in the Website
// Builder — so a business with a live, six-page site was told "No
// landing page set up yet" and "No headline set". Now the real site is
// checked when one exists; landing_pages is the fallback for businesses
// that only ever made a single landing page.
// ------------------------------------------------------------------

import { auditLandingPage } from "./seoAgent";
import { gatherCroFacts, type CroFacts } from "../cro/siteFacts";

export interface CroReport {
  conversionRate: number | null; // leads per launched campaign
  suggestions: { issue: string; fix: string; impact: "high" | "medium" | "low" }[];
}

type Check = { label: string; passed: boolean; detail: string };

/** Structural checks on the live site's home page. */
export function siteHealthChecks(facts: CroFacts): Check[] {
  const site = facts.site!;
  const home = facts.home;
  const headline = home?.headings[0] ?? null;
  return [
    {
      label: "Website is published",
      passed: site.published,
      detail: site.published ? `Live at ${site.url}.` : "Your website is still a draft — visitors can't see it.",
    },
    {
      label: "Home page headline",
      passed: Boolean(headline),
      detail: headline ? `"${headline}"` : "Your home page has no headline to greet visitors.",
    },
    {
      label: "Clear call to action",
      passed: (home?.buttons.length ?? 0) > 0,
      detail: home?.buttons.length ? `Buttons: ${home.buttons.slice(0, 3).map((b) => `"${b}"`).join(", ")}.` : "Your home page has no button telling visitors what to do next.",
    },
    {
      label: "Share image",
      passed: Boolean(home?.hasShareImage),
      detail: home?.hasShareImage ? "Set — shared links show a preview." : "No share image — links shared on WhatsApp/Facebook show no preview.",
    },
  ];
}

const FIXES: Record<string, string> = {
  "Website is published": "Publish your website in the Website Builder",
  "Home page headline": "Add a headline to your home page in the Website Builder",
  "Clear call to action": "Add a button to your home page (for example \"Shop now\") in the Website Builder",
  "Share image": "Add a share image in the home page's SEO settings in the Website Builder",
  "Page is published": "Publish your landing page in the Website tab",
  "Social share image": "Add a hero image so shared links show a preview",
  "Page has real content depth": "Add at least a few featured items/products",
};

export async function analyzeCro(supabase: any, dealershipId: string, _businessCategory: string = "business"): Promise<CroReport> {
  const [facts, { data: page }, { data: campaigns }] = await Promise.all([
    gatherCroFacts(supabase, dealershipId),
    supabase.from("landing_pages").select("published, slug, headline, subheadline, hero_image_url, car_listings").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("ad_creatives").select("meta_campaign_id").eq("dealership_id", dealershipId).eq("status", "launched"),
  ]);

  const checks: Check[] = facts.site ? siteHealthChecks(facts) : auditLandingPage(page).checks;
  const totalLeads = facts.allTime.leads;

  // Rough conversion signal: leads per launched campaign, as a stand-in
  // for a true visitor-to-lead rate.
  const conversionRate = campaigns && campaigns.length > 0 ? Math.round((totalLeads / campaigns.length) * 10) / 10 : null;

  const suggestions: CroReport["suggestions"] = [];
  for (const check of checks) {
    if (!check.passed) {
      suggestions.push({
        issue: `${check.label}: ${check.detail}`,
        fix: FIXES[check.label] ?? "Fix this in the Website Builder",
        impact: check.label === "Page is published" || check.label === "Website is published" ? "high" : "medium",
      });
    }
  }

  if (totalLeads === 0) {
    suggestions.unshift({
      issue: "No leads captured yet",
      fix: "Make sure your Instant Form or website is actually live and linked correctly from an active campaign",
      impact: "high",
    });
  }

  return { conversionRate, suggestions: suggestions.slice(0, 5) };
}
