// Plan tiers (Free/Basic/Pro/Max) — see migration 079_new_pricing_tiers.sql
// for the source-of-truth `plan_limits` table. Limits live in the DB, not
// here, so pricing changes don't need a deploy; this file just maps that
// row into a typed shape and provides a safe fallback if the table is
// ever empty (e.g. a fresh local DB before the migration has been run).

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanKey = "free" | "basic" | "pro" | "max";
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
}

export const PLAN_LABELS: Record<PlanKey, string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  max: "Max",
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
  | "multiBusiness";

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
  threeDStudio: "max",
  multiBusiness: "max",
};

export function hasFeature(limits: PlanLimits, feature: GatedFeatureKey): boolean {
  return Boolean(limits[feature]);
}
