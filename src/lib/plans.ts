// Plan tiers (Free/Basic/Growth/Pro/Agency) — see
// migration 079_new_pricing_tiers.sql + 099 (agency rename/reprice) +
// 143 (growth tier + Usage/Pricing/Cost-Control spec repricing) for the
// source-of-truth `plan_limits` table. Limits live in the DB, not here,
// so pricing changes don't need a deploy; this file just maps that row
// into a typed shape and provides a safe fallback if the table is ever
// empty (e.g. a fresh local DB before the migration has been run).

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanKey = "free" | "basic" | "growth" | "pro" | "agency";
export type OpusAccess = "none" | "limited" | "full";

export interface PlanLimits {
  plan: PlanKey;
  label: string;
  priceInr: number;
  priceLabel: string;
  messagesPerDay: number | null; // null = unlimited
  teamSeats: number | null;
  adCampaignsActive: number | null;
  callingFreeMinutes: number;
  callingMarginInr: number;
  opusAccess: OpusAccess;
  whatsappAutomation: boolean;
  businessReports: boolean;
  marketingAutomationWorkflows: boolean;
  competitorIntel: boolean;
  growthAdvisor: boolean;
  cro: boolean;
  influencerMarketing: boolean;
  affiliateMarketing: boolean;
  retargeting: boolean;
  threeDStudio: boolean;
  multiBusiness: boolean;
  dedicatedPhoneNumber: boolean;
  // Per-month generation caps (migration 099) — null = unlimited, same
  // convention as messagesPerDay/teamSeats/adCampaignsActive. These gate
  // the handful of tools with no boolean on/off distinction per tier
  // (every tier can generate images/video/voice/brand kits/websites —
  // the difference is how many per month, not whether at all), so they
  // live alongside the boolean flags rather than in GatedFeatureKey.
  imagesPerMonth: number | null;
  videosPerMonth: number | null;
  voiceoverCharsPerMonth: number | null;
  brandKitsPerMonth: number | null;
  websiteBuildsPerMonth: number | null;
  // Per-day caps (migration 125) — only for video/voiceover, the two
  // priciest-per-unit resources. A second, tighter check layered on
  // top of the monthly cap above, protecting against a single-day
  // cost spike (a burst that burns the whole month's allowance in one
  // sitting) rather than replacing the monthly limit. null = no daily
  // cap for that resource.
  videosPerDay: number | null;
  voiceoverCharsPerDay: number | null;
}

export const PLAN_LABELS: Record<PlanKey, string> = {
  free: "Free",
  basic: "Basic",
  growth: "Growth",
  pro: "Pro",
  agency: "Agency",
};

function formatPriceLabel(priceInr: number): string {
  return priceInr === 0 ? "₹0" : `₹${priceInr.toLocaleString("en-IN")}/mo`;
}

// Mirrors the 'free' row values from migration 079 — only used if
// plan_limits hasn't been seeded yet in a given environment.
const FREE_FALLBACK: PlanLimits = {
  plan: "free",
  label: "Free",
  priceInr: 0,
  priceLabel: "₹0",
  messagesPerDay: 100,
  teamSeats: 1,
  adCampaignsActive: 0,
  callingFreeMinutes: 0,
  callingMarginInr: 2,
  opusAccess: "none",
  whatsappAutomation: false,
  businessReports: false,
  marketingAutomationWorkflows: false,
  competitorIntel: false,
  growthAdvisor: false,
  cro: false,
  influencerMarketing: false,
  affiliateMarketing: false,
  retargeting: false,
  threeDStudio: false,
  multiBusiness: false,
  dedicatedPhoneNumber: false,
  imagesPerMonth: 3,
  videosPerMonth: 0,
  voiceoverCharsPerMonth: 2000,
  brandKitsPerMonth: 1,
  websiteBuildsPerMonth: 1,
  videosPerDay: 0,
  voiceoverCharsPerDay: 2000,
};

interface PlanLimitsRow {
  plan: string;
  price_inr: number;
  messages_per_day: number | null;
  team_seats: number | null;
  ad_campaigns_active: number | null;
  calling_free_minutes: number;
  calling_margin_inr: number;
  opus_access: string;
  whatsapp_automation: boolean;
  business_reports: boolean;
  marketing_automation_workflows: boolean;
  competitor_intel: boolean;
  growth_advisor: boolean;
  cro: boolean;
  influencer_marketing: boolean;
  affiliate_marketing: boolean;
  retargeting: boolean;
  three_d_studio: boolean;
  multi_business: boolean;
  dedicated_phone_number: boolean;
  images_per_month: number | null;
  videos_per_month: number | null;
  voiceover_chars_per_month: number | null;
  brand_kits_per_month: number | null;
  website_builds_per_month: number | null;
  videos_per_day: number | null;
  voiceover_chars_per_day: number | null;
}

function mapRow(row: PlanLimitsRow): PlanLimits {
  const plan = row.plan as PlanKey;
  return {
    plan,
    label: PLAN_LABELS[plan] ?? row.plan,
    priceInr: row.price_inr,
    priceLabel: formatPriceLabel(row.price_inr),
    messagesPerDay: row.messages_per_day,
    teamSeats: row.team_seats,
    adCampaignsActive: row.ad_campaigns_active,
    callingFreeMinutes: row.calling_free_minutes,
    callingMarginInr: row.calling_margin_inr,
    opusAccess: row.opus_access as OpusAccess,
    whatsappAutomation: row.whatsapp_automation,
    businessReports: row.business_reports,
    marketingAutomationWorkflows: row.marketing_automation_workflows,
    competitorIntel: row.competitor_intel,
    growthAdvisor: row.growth_advisor,
    cro: row.cro,
    influencerMarketing: row.influencer_marketing,
    affiliateMarketing: row.affiliate_marketing,
    retargeting: row.retargeting,
    threeDStudio: row.three_d_studio,
    multiBusiness: row.multi_business,
    dedicatedPhoneNumber: row.dedicated_phone_number,
    imagesPerMonth: row.images_per_month,
    videosPerMonth: row.videos_per_month,
    voiceoverCharsPerMonth: row.voiceover_chars_per_month,
    brandKitsPerMonth: row.brand_kits_per_month,
    websiteBuildsPerMonth: row.website_builds_per_month,
    videosPerDay: row.videos_per_day,
    voiceoverCharsPerDay: row.voiceover_chars_per_day,
  };
}

/** Reads a plan's limits straight from `plan_limits` by plan key. */
export async function getPlanLimits(supabase: SupabaseClient, planKey: string | null | undefined): Promise<PlanLimits> {
  const key = (planKey as PlanKey) ?? "free";
  const { data } = await supabase.from("plan_limits").select("*").eq("plan", key).maybeSingle();
  if (!data) return key === "free" ? FREE_FALLBACK : { ...FREE_FALLBACK, plan: key, label: PLAN_LABELS[key] ?? key };
  return mapRow(data as PlanLimitsRow);
}

/** Resolves a dealership's plan, then its limits — the common entry point for gating checks. */
export async function getDealershipPlanLimits(supabase: SupabaseClient, dealershipId: string): Promise<PlanLimits> {
  const { data: dealership } = await supabase.from("dealerships").select("plan").eq("id", dealershipId).single();
  return getPlanLimits(supabase, dealership?.plan);
}

// Boolean feature flags gated by plan — keys match plan_limits columns
// (camelCased) so `hasFeature` can index straight into PlanLimits.
export type GatedFeatureKey =
  | "whatsappAutomation"
  | "marketingAutomationWorkflows"
  | "competitorIntel"
  | "growthAdvisor"
  | "cro"
  | "influencerMarketing"
  | "affiliateMarketing"
  | "retargeting"
  | "threeDStudio"
  | "multiBusiness"
  | "dedicatedPhoneNumber";

export const GATED_FEATURE_LABELS: Record<GatedFeatureKey, string> = {
  whatsappAutomation: "WhatsApp Automation",
  marketingAutomationWorkflows: "Marketing Automation Workflows",
  competitorIntel: "Competitor Intel",
  growthAdvisor: "Growth Advisor",
  cro: "CRO",
  influencerMarketing: "Influencer Marketing",
  affiliateMarketing: "Affiliate Marketing",
  retargeting: "Retargeting",
  threeDStudio: "3D Studio",
  multiBusiness: "Multi-Business",
  dedicatedPhoneNumber: "Dedicated Phone Number",
};

// The lowest plan that unlocks each feature — must stay in sync with the
// boolean flags seeded in migration 079's plan_limits insert.
export const GATED_FEATURE_MIN_PLAN: Record<GatedFeatureKey, PlanKey> = {
  whatsappAutomation: "basic",
  marketingAutomationWorkflows: "pro",
  competitorIntel: "pro",
  growthAdvisor: "pro",
  cro: "pro",
  influencerMarketing: "pro",
  affiliateMarketing: "pro",
  retargeting: "pro",
  threeDStudio: "agency",
  multiBusiness: "agency",
  // Data/gating structure only — not enforced anywhere yet (no route
  // calls requireFeature() for this key). Real per-business Vapi
  // numbers are admin-assigned once DLT telecom registration clears;
  // until then every dealership shares the platform default number
  // regardless of plan. Flip enforcement on later by adding a
  // requireFeature(supabase, dealershipId, "dedicatedPhoneNumber")
  // check wherever a number gets assigned.
  dedicatedPhoneNumber: "pro",
};

// Testing/demo bypass — set BYPASS_PLAN_GATING=true in the environment
// (e.g. Vercel project env vars) to make every plan-gating check in the
// app resolve as allowed, without changing what plan any account is
// actually on. Defaults to off (real enforcement) unless explicitly set
// to the exact string "true". Single choke point by design: every
// boolean feature gate funnels through hasFeature() below — API routes
// via requireFeature() (src/lib/featureGate.ts), which covers the "add
// another business" Agency-plan lock too since that's just
// requireFeature(..., "multiBusiness"); Master Chat's own tool gating
// in masterBrainV2.ts calls hasFeature() directly, not through
// requireFeature(), which is why the flag lives here and not there.
// The per-month generation caps (images/video/voiceover/brand kit/
// website) are a separate mechanism (quantity caps, not boolean flags)
// and read this same flag independently — see isPlanGatingBypassed()'s
// other call site in src/lib/usage/generationLimits.ts.
export function isPlanGatingBypassed(): boolean {
  return process.env.BYPASS_PLAN_GATING === "true";
}

export function hasFeature(limits: PlanLimits, feature: GatedFeatureKey): boolean {
  if (isPlanGatingBypassed()) return true;
  return Boolean(limits[feature]);
}
