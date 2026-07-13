import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchShopifyProducts } from "@/lib/agents/shopifyAgent";
import { fetchWooCommerceProducts } from "@/lib/agents/woocommerceAgent";

// Combined product list across whichever store platforms are
// connected — the Launch Ad page uses this to let a dealer pick a
// real product instead of uploading a photo manually.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("shopify_store_url, shopify_access_token, woocommerce_store_url, woocommerce_consumer_key, woocommerce_consumer_secret")
    .eq("id", dealershipId)
    .single();

  const products: { source: "shopify" | "woocommerce"; id: string; title: string; price: string | null; image_url: string | null }[] = [];

  if (dealership?.shopify_store_url && dealership?.shopify_access_token) {
    try {
      const shopifyProducts = await fetchShopifyProducts(dealership.shopify_store_url, dealership.shopify_access_token, 30);
      products.push(...shopifyProducts.map((p) => ({ source: "shopify" as const, ...p })));
    } catch (err: any) {
      console.error("[integrations/products] Shopify fetch error:", err.message);
    }
  }

  if (dealership?.woocommerce_store_url && dealership?.woocommerce_consumer_key && dealership?.woocommerce_consumer_secret) {
    try {
      const wooProducts = await fetchWooCommerceProducts(dealership.woocommerce_store_url, dealership.woocommerce_consumer_key, dealership.woocommerce_consumer_secret, 30);
      products.push(...wooProducts.map((p) => ({ source: "woocommerce" as const, ...p })));
    } catch (err: any) {
      console.error("[integrations/products] WooCommerce fetch error:", err.message);
    }
  }

  return NextResponse.json({ products });
}
