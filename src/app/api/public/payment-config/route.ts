import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isRazorpayConfigured } from "@/lib/payments/razorpay";
import { razorpaySecret, RAZORPAY_SECRET_SELECT } from "@/lib/crypto/commerceSecrets";

// Lets the storefront checkout page decide whether to offer "Pay
// Online" — the key id is Razorpay's publishable identifier (safe to
// expose to the browser, it's what Checkout.js needs to open the
// payment modal); the key secret never leaves the server. Scoped to
// the specific storefront's own dealership via `slug` — every
// business has its own Razorpay connection, not a shared one.
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ razorpayEnabled: false, keyId: null });

  const supabase = createServiceClient();
  const { data: website } = await supabase.from("websites").select("dealership_id").eq("slug", slug).maybeSingle();
  if (!website) return NextResponse.json({ razorpayEnabled: false, keyId: null });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select(`razorpay_key_id, ${RAZORPAY_SECRET_SELECT}`)
    .eq("id", website.dealership_id)
    .maybeSingle();
  // The secret is decrypted here ONLY to answer "is one set". It is
  // never placed in the response — the audit confirmed that, and it
  // stays true: the JSON below carries keyId and a boolean, nothing
  // else. This endpoint is public and unauthenticated.
  const enabled = isRazorpayConfigured(dealership?.razorpay_key_id, razorpaySecret(dealership));
  return NextResponse.json({ razorpayEnabled: enabled, keyId: enabled ? dealership!.razorpay_key_id : null });
}
