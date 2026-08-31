import { NextResponse } from "next/server";
import { listVideoModels } from "@/lib/videoModels";
import { isFeatureEnabled } from "@/lib/featureFlags";

export async function GET() {
  // Empty list rather than a 403: this only feeds a model picker, and
  // an error here would surface as a broken-looking Creative Studio
  // rather than a feature that's simply switched off.
  if (!isFeatureEnabled("videoGeneration")) return NextResponse.json({ models: [] });
  return NextResponse.json({ models: listVideoModels() });
}
