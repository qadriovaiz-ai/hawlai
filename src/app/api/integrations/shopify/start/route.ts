import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createShopifyNonce, normaliseShopDomain, buildInstallUrl } from "@/lib/commerce/shopifyAuth";

// Shopify OAuth step 1 — begin the install handshake.
//
// Returns the URL rather than redirecting, for the same reason as the
// WooCommerce equivalent: the caller is a fetch() from the settings
// card, and a cross-origin 3xx inside fetch is awkward to handle.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Shopify isn't configured on this server yet." }, { status: 500 });

  const { store_url } = await request.json().catch(() => ({ store_url: null }));
  const shop = normaliseShopDomain(store_url);
  if (!shop.ok) return NextResponse.json({ error: shop.reason }, { status: 400 });

  const nonce = createShopifyNonce();
  const { error } = await supabase
    .from("dealerships")
    .update({
      shopify_connect_pending: {
        nonce,
        // Stored so the callback can confirm the shop that comes back
        // is the one the dealer actually started from.
        shop: shop.shop,
        created_at: new Date().toISOString(),
      },
    })
    .eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = new URL(request.url).origin;
  const installUrl = buildInstallUrl({
    shop: shop.shop,
    clientId,
    nonce,
    redirectUri: `${origin}/api/integrations/shopify/callback`,
  });

  return NextResponse.json({ installUrl, shop: shop.shop });
}
