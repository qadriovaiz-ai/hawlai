import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { loadRazorpayConnection } from "@/lib/payments/razorpayConnection";

// Lets the storefront checkout page decide whether to offer "Pay
// Online". The key returned is Razorpay's publishable Checkout key —
// the Key ID, or for Connect Razorpay the connection's public token.
// Secrets and tokens never leave the server: this endpoint is public
// and unauthenticated, and its JSON carries a boolean and that key,
// nothing else. Scoped to the storefront's own dealership via `slug`.
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ razorpayEnabled: false, keyId: null });

  const supabase = createServiceClient();
  const { data: website } = await supabase.from("websites").select("dealership_id").eq("slug", slug).maybeSingle();
  if (!website) return NextResponse.json({ razorpayEnabled: false, keyId: null });

  const { credentials } = await loadRazorpayConnection(supabase, website.dealership_id);
  return NextResponse.json({ razorpayEnabled: Boolean(credentials), keyId: credentials?.checkoutKey ?? null });
}
