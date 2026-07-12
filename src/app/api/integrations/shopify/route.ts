import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { testShopifyConnection, fetchShopifyProducts } from "@/lib/agents/shopifyAgent";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("dealerships").select("shopify_store_url, shopify_access_token").eq("id", dealershipId).single();
  const connected = !!(data?.shopify_store_url && data?.shopify_access_token);

  let products: any[] = [];
  if (connected) {
    try {
      products = await fetchShopifyProducts(data!.shopify_store_url!, data!.shopify_access_token!);
    } catch {
      // Connection may have gone stale — still report connected: true, just no products
    }
  }

  return NextResponse.json({ connected, storeUrl: data?.shopify_store_url ?? null, products });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { store_url, access_token } = await request.json();
  if (!store_url || !access_token) return NextResponse.json({ error: "Store URL and Access Token are both required" }, { status: 400 });

  const test = await testShopifyConnection(store_url, access_token);
  if (!test.success) return NextResponse.json({ error: test.error }, { status: 400 });

  await supabase.from("dealerships").update({ shopify_store_url: store_url, shopify_access_token: access_token }).eq("id", dealershipId);
  return NextResponse.json({ success: true, shopName: test.shopName });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  await supabase.from("dealerships").update({ shopify_store_url: null, shopify_access_token: null }).eq("id", dealershipId);
  return NextResponse.json({ success: true });
}
