import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createWooNonce, normaliseStoreUrl, buildAuthorizeUrl } from "@/lib/commerce/wooAuth";

// A6 step 1 — begin the /wc-auth/v1/authorize handshake.
//
// Returns the URL to send the dealer to rather than redirecting: the
// caller is a fetch() from the settings card, and a 3xx to a
// third-party origin from inside fetch is both awkward to handle and
// easy to get wrong. The client does the navigation.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { store_url } = await request.json().catch(() => ({ store_url: null }));
  const store = normaliseStoreUrl(store_url);
  if (!store.ok) return NextResponse.json({ error: store.reason }, { status: 400 });

  const nonce = createWooNonce();
  const { error } = await supabase
    .from("dealerships")
    .update({
      woocommerce_connect_pending: {
        nonce,
        store_url: store.origin,
        created_at: new Date().toISOString(),
      },
    })
    .eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = new URL(request.url).origin;
  const authorizeUrl = buildAuthorizeUrl({
    storeOrigin: store.origin,
    appName: "Hawlai",
    nonce,
    returnUrl: `${origin}/dashboard/settings/integrations?woo=done`,
    // WooCommerce refuses a non-HTTPS callback, so a local dev origin
    // cannot complete this flow. That is WooCommerce's rule, not ours.
    callbackUrl: `${origin}/api/integrations/woocommerce/callback`,
  });

  // The nonce is deliberately not returned. It is embedded in the
  // authorize URL because WooCommerce needs it, but nothing in the
  // client should read or store it.
  return NextResponse.json({ authorizeUrl, storeHost: store.host });
}
