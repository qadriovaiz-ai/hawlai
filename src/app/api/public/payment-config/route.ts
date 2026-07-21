import { NextResponse } from "next/server";
import { isRazorpayConfigured } from "@/lib/payments/razorpay";

// Lets the storefront checkout page decide whether to offer "Pay
// Online" — the key id is Razorpay's publishable identifier (safe to
// expose to the browser, it's what Checkout.js needs to open the
// payment modal); the key secret never leaves the server.
export async function GET() {
  const enabled = isRazorpayConfigured();
  return NextResponse.json({ razorpayEnabled: enabled, keyId: enabled ? process.env.RAZORPAY_KEY_ID : null });
}
