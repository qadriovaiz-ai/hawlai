import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearedWrite } from "@/lib/crypto/commerceSecrets";
import { exchangeRazorpayCode, isRazorpayOAuthConfigured, oauthTokensWrite, razorpayOAuthEnv, razorpayRedirectUri } from "@/lib/payments/razorpayOAuth";

// Connect Razorpay, step 2 — Razorpay sends the owner's browser back
// here after they approve (or cancel).
//
// Always redirects to the Payments tab, never answers JSON: a person
// lands here. The result travels as a short code the tab turns into a
// sentence — never free text from the URL, which anyone could craft.

function backTo(request: Request, params: Record<string, string>) {
  const url = new URL("/dashboard/website-builder", new URL(request.url).origin);
  url.searchParams.set("tab", "payments");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

const failed = (request: Request, reason: string) => backTo(request, { razorpay: "failed", reason });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expected = jar.get("razorpay_oauth_state")?.value;
  // Single-use: cleared on every way out, failures included.
  jar.delete("razorpay_oauth_state");

  // The owner pressed Cancel on Razorpay's page — a choice, not an error.
  if (url.searchParams.get("error")) return backTo(request, { razorpay: "cancelled" });

  if (!code || !state || !expected) return failed(request, "expired");
  if (state !== expected) return failed(request, "mismatch");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", url.origin));
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return failed(request, "no_business");
  if (!isRazorpayOAuthConfigured()) return failed(request, "not_configured");

  let write: Record<string, unknown>;
  try {
    const tokens = await exchangeRazorpayCode(code, razorpayRedirectUri(url.origin));
    write = {
      ...oauthTokensWrite({ ...tokens, publicToken: tokens.publicToken! }, razorpayOAuthEnv().mode),
      // One connection, not two: pasted keys are removed once Razorpay
      // itself has connected the account.
      razorpay_key_id: null,
      ...clearedWrite("razorpay_key_secret"),
    };
  } catch (err: any) {
    // Razorpay's words are logged for whoever maintains this; the owner
    // gets a sentence they can act on.
    console.error("[razorpay-connect] token exchange failed:", err?.message);
    return failed(request, "exchange_failed");
  }

  const { error } = await supabase.from("dealerships").update(write).eq("id", dealershipId);
  if (error) {
    // e.g. migration 178 not run yet. The whole update failed, so any
    // pasted keys are still in place and checkout is unchanged.
    console.error("[razorpay-connect] couldn't save the connection:", error.message);
    return failed(request, "save_failed");
  }

  return backTo(request, { razorpay: "connected" });
}
