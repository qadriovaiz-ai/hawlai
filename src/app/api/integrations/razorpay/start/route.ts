import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { buildRazorpayAuthorizeUrl, isRazorpayOAuthConfigured, razorpayRedirectUri } from "@/lib/payments/razorpayOAuth";

// Connect Razorpay, step 1 — hand the browser Razorpay's sign-in URL.
//
// Returns the URL rather than redirecting: the caller is a fetch() from
// the Payments tab. The CSRF state lives in an httpOnly cookie, as for
// Canva: it lasts one redirect round-trip and belongs to one browser.

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "Your account isn't linked to a business yet." }, { status: 400 });

  // Checked before sending anyone to Razorpay: approving access and only
  // then failing on our own missing configuration would look like
  // Razorpay broke.
  if (!isRazorpayOAuthConfigured()) {
    return NextResponse.json({ error: "Connect Razorpay isn't switched on for Hawlai yet." }, { status: 503 });
  }

  const state = crypto.randomBytes(16).toString("base64url");
  const jar = await cookies();
  jar.set("razorpay_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.json({ url: buildRazorpayAuthorizeUrl(state, razorpayRedirectUri(new URL(request.url).origin)) });
}
