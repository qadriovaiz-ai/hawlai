import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, saveNewConnection } from "@/lib/canva/client";

// Handles Canva's redirect back after the consent screen.
//
// Always redirects to the Design & Edit page rather than returning
// JSON — a person's browser lands here, not a script, and a raw JSON
// body on screen would read as a crash.

const DESTINATION = "/dashboard/design-edit";

function backTo(request: Request, params: Record<string, string>) {
  const url = new URL(DESTINATION, new URL(request.url).origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const jar = await cookies();
  const expectedState = jar.get("canva_oauth_state")?.value;
  const verifier = jar.get("canva_code_verifier")?.value;

  // Single-use by design: cleared on every path out of here, including
  // failures, so a stale verifier can't be replayed against a later
  // authorization code.
  jar.delete("canva_oauth_state");
  jar.delete("canva_code_verifier");

  // The user pressed Cancel on Canva's consent screen. Not an error
  // worth alarming language — they made a choice.
  if (error) {
    return backTo(request, { canva: "cancelled" });
  }

  if (!code || !state || !expectedState || !verifier) {
    return backTo(request, { canva: "failed", reason: "The connection attempt expired. Please try again." });
  }

  // CSRF check. timingSafeEqual isn't used because both values are
  // already random 128-bit tokens compared for exact equality — there
  // is no secret to leak through timing here.
  if (state !== expectedState) {
    return backTo(request, { canva: "failed", reason: "That connection request didn't match. Please try again." });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Session expired while they were on Canva's side.
  if (!user) return NextResponse.redirect(new URL("/auth/login", url.origin));

  try {
    const tokens = await exchangeCodeForTokens(code, verifier);
    await saveNewConnection(supabase, user.id, tokens);
  } catch (err: any) {
    // Canva's own message is not shown to the customer — it can carry
    // client-configuration detail that means nothing to a dealer. It's
    // logged for whoever maintains the integration instead.
    console.error("[canva] token exchange failed:", err?.message);
    return backTo(request, { canva: "failed", reason: "Canva couldn't complete the connection. Please try again." });
  }

  return backTo(request, { canva: "connected" });
}
