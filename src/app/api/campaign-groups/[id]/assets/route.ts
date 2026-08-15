import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { attachAsset, detachAsset, type AssetType } from "@/lib/agents/campaignGroupAgent";

const VALID_ASSET_TYPES = ["ad_creative", "workflow", "social_post"];

async function resolveDealershipId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  return profile?.dealership_id ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const dealershipId = await resolveDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assetType, assetId } = await request.json();
  if (!VALID_ASSET_TYPES.includes(assetType) || !assetId) {
    return NextResponse.json({ error: "assetType and assetId are required" }, { status: 400 });
  }

  const result = await attachAsset(supabase, dealershipId, id, assetType as AssetType, assetId);
  if (result.error) return NextResponse.json({ error: typeof result.error === "string" ? result.error : result.error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const dealershipId = await resolveDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assetType, assetId } = await request.json();
  if (!VALID_ASSET_TYPES.includes(assetType) || !assetId) {
    return NextResponse.json({ error: "assetType and assetId are required" }, { status: 400 });
  }

  const { error } = await detachAsset(supabase, dealershipId, id, assetType as AssetType, assetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
