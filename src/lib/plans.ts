// Plan tiers and their monthly usage limits — the numbers discussed
// with Ovaiz for Hawlai's pricing structure. Calling and video/image
// generation are metered because they carry real per-use API cost
// (Vapi per-minute, Gemini/Imagen per-generation); website, CRM, and
// content-count-independent features stay generous since they're
// cheap to run and are what makes the free tier actually useful.

export type PlanKey = "free" | "growth" | "pro";

export interface PlanLimits {
  label: string;
  priceLabel: string;
  callsPerMonth: number | null; // null = unlimited
  contentPerMonth: number | null;
  imagesPerMonth: number | null;
  videosPerMonth: number | null;
  customDomain: boolean;
  removeHawlaiBranding: boolean;
}

export const PLANS: Record<PlanKey, PlanLimits> = {
  free: {
    label: "Starter (Free)",
    priceLabel: "₹0",
    callsPerMonth: 0,
    contentPerMonth: 10,
    imagesPerMonth: 5,
    videosPerMonth: 0,
    customDomain: false,
    removeHawlaiBranding: false,
  },
  growth: {
    label: "Growth",
    priceLabel: "₹1,499/mo",
    callsPerMonth: 50,
    contentPerMonth: 100,
    imagesPerMonth: 50,
    videosPerMonth: 10,
    customDomain: true,
    removeHawlaiBranding: true,
  },
  pro: {
    label: "Pro",
    priceLabel: "₹4,999/mo",
    callsPerMonth: 200,
    contentPerMonth: null,
    imagesPerMonth: null,
    videosPerMonth: null,
    customDomain: true,
    removeHawlaiBranding: true,
  },
};

export function getPlan(planKey: string | null | undefined): PlanLimits {
  return PLANS[(planKey as PlanKey) ?? "free"] ?? PLANS.free;
}
