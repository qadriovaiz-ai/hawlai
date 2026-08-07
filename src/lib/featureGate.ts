// Shared plan-gating helper for API routes — wraps the plans.ts data
// layer with a ready-to-return 403 response, so every gated route uses
// the same check and the same upgrade-copy shape.

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDealershipPlanLimits,
  hasFeature,
  GATED_FEATURE_LABELS,
  GATED_FEATURE_MIN_PLAN,
  PLAN_LABELS,
  type GatedFeatureKey,
} from "@/lib/plans";

export function upgradeMessage(feature: GatedFeatureKey): string {
  return `${GATED_FEATURE_LABELS[feature]} needs the ${PLAN_LABELS[GATED_FEATURE_MIN_PLAN[feature]]} plan or higher.`;
}

export type FeatureGateResult =
  | { allowed: true }
  | { allowed: false; response: NextResponse };

/** For API routes: check a dealership's plan against a gated feature, ready to `return` the response if blocked. */
export async function requireFeature(
  supabase: SupabaseClient,
  dealershipId: string,
  feature: GatedFeatureKey
): Promise<FeatureGateResult> {
  const limits = await getDealershipPlanLimits(supabase, dealershipId);
  if (hasFeature(limits, feature)) return { allowed: true };
  return {
    allowed: false,
    response: NextResponse.json(
      { error: upgradeMessage(feature), upgradeRequired: true, feature },
      { status: 403 }
    ),
  };
}
