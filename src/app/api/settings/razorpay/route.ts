import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { encryptedWrite } from "@/lib/crypto/commerceSecrets";
import { isRingConfigured } from "@/lib/crypto/secretCrypto";
import { keyCredentials } from "@/lib/payments/razorpay";
import { isRazorpayOAuthConfigured } from "@/lib/payments/razorpayOAuth";
import { razorpayStatus } from "@/lib/payments/razorpayConnection";

// The Website Builder's Payments tab.
//
// GET says whether Razorpay is connected and how — never a key, a
// secret or a token. Not even the Key ID: it's publishable, but nobody
// needs to see stored credentials to know they're connected, and
// showing them back invites copying them around.
//
// PATCH is the paste-your-keys FALLBACK, accepted only when Connect
// Razorpay isn't configured on this server. When it is, keys can't be
// pasted at all — the owner signs in with Razorpay instead
// (/api/integrations/razorpay/start).

async function dealershipFor(supabase: any): Promise<{ id?: string; response?: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return { response: NextResponse.json({ error: "Your account isn't linked to a business yet." }, { status: 400 }) };
  return { id: profile.dealership_id };
}

export async function GET() {
  const supabase = await createClient();
  const d = await dealershipFor(supabase);
  if (d.response) return d.response;

  // select("*"): the Connect Razorpay columns arrive with migration 178,
  // run by hand — naming them would fail this read until it runs.
  const { data: row, error } = await supabase.from("dealerships").select("*").eq("id", d.id).maybeSingle();
  if (error) {
    console.error("[settings/razorpay] load failed:", error.message);
    return NextResponse.json({ error: "Couldn't load your payment settings. Nothing was changed — try again." }, { status: 500 });
  }
  return NextResponse.json({ ...razorpayStatus(row), oauthAvailable: isRazorpayOAuthConfigured() });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const d = await dealershipFor(supabase);
  if (d.response) return d.response;

  if (isRazorpayOAuthConfigured()) {
    return NextResponse.json({ error: "Use Connect Razorpay — you'll sign in with Razorpay instead of pasting keys." }, { status: 409 });
  }
  if (!isRingConfigured("commerce")) {
    return NextResponse.json({ error: "Payment keys can't be saved until encryption is set up on the server." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const keyId = String(body?.keyId ?? "").trim();
  const keySecret = String(body?.keySecret ?? "").trim();
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) {
    return NextResponse.json({ error: "That doesn't look like a Razorpay Key ID — it starts with rzp_live_ or rzp_test_." }, { status: 400 });
  }
  // Both, every time: saved keys are never shown back, so there's no
  // "keep the old secret" — a new Key ID needs its own secret anyway.
  if (!keySecret) return NextResponse.json({ error: "Enter the Key Secret too." }, { status: 400 });

  // Checked with Razorpay before saving, so "connected" means Razorpay
  // accepted them — not that two boxes were filled in.
  let check: Response | null = null;
  try {
    check = await fetch("https://api.razorpay.com/v1/orders?count=1", { headers: { Authorization: keyCredentials(keyId, keySecret)!.authorization } });
  } catch {
    check = null;
  }
  if (!check) return NextResponse.json({ error: "Couldn't reach Razorpay to check these keys. Try again in a moment." }, { status: 502 });
  if (check.status === 401) return NextResponse.json({ error: "Razorpay didn't accept these keys. Check both were copied in full." }, { status: 400 });
  if (!check.ok) return NextResponse.json({ error: `Razorpay couldn't confirm these keys right now (${check.status}). Try again in a moment.` }, { status: 502 });

  const { error } = await supabase
    .from("dealerships")
    .update({ razorpay_key_id: keyId, ...encryptedWrite("razorpay_key_secret", keySecret) })
    .eq("id", d.id);
  if (error) {
    console.error("[settings/razorpay] save failed:", error.message);
    return NextResponse.json({ error: "Couldn't save your Razorpay keys. Try again." }, { status: 500 });
  }
  return NextResponse.json({ connected: true, method: "keys" });
}
