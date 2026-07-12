import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { testWooCommerceConnection, fetchWooCommerceProducts } from "@/lib/agents/woocommerceAgent";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("dealerships").select("woocommerce_store_url, woocommerce_consumer_key, woocommerce_consumer_secret").eq("id", dealershipId).single();
  const connected = !!(data?.woocommerce_store_url && data?.woocommerce_consumer_key);

  let products: any[] = [];
  if (connected) {
    try {
      products = await fetchWooCommerceProducts(data!.woocommerce_store_url!, data!.woocommerce_consumer_key!, data!.woocommerce_consumer_secret!);
    } catch {
      // Connection may have gone stale — still report connected: true, just no products
    }
  }

  return NextResponse.json({ connected, storeUrl: data?.woocommerce_store_url ?? null, products });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { store_url, consumer_key, consumer_secret } = await request.json();
  if (!store_url || !consumer_key || !consumer_secret) {
    return NextResponse.json({ error: "Store URL, Consumer Key, and Consumer Secret are all required" }, { status: 400 });
  }

  const test = await testWooCommerceConnection(store_url, consumer_key, consumer_secret);
  if (!test.success) return NextResponse.json({ error: test.error }, { status: 400 });

  await supabase.from("dealerships").update({
    woocommerce_store_url: store_url,
    woocommerce_consumer_key: consumer_key,
    woocommerce_consumer_secret: consumer_secret,
  }).eq("id", dealershipId);
  return NextResponse.json({ success: true, storeName: test.storeName });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  await supabase.from("dealerships").update({
    woocommerce_store_url: null, woocommerce_consumer_key: null, woocommerce_consumer_secret: null,
  }).eq("id", dealershipId);
  return NextResponse.json({ success: true });
}
