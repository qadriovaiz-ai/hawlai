import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/canva/client";

// Forces a token freshness check for the signed-in user.
//
// Day-to-day refreshing is automatic — every call that needs a token
// goes through getValidAccessToken(), which refreshes when one is
// within five minutes of expiry. This route exists for the case where
// the UI wants to know whether the connection is still alive without
// performing an action, e.g. when the Design & Edit page loads after
// the tab has been open for hours.
//
// Never returns the token itself. The browser has no use for it, and
// an access token in a JSON response is one XSS away from being
// someone else's Canva account.

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const token = await getValidAccessToken(supabase, user.id);
    // null covers both "never connected" and "refresh failed, row
    // removed" — from the UI's point of view these are the same state
    // and lead to the same button.
    return NextResponse.json({ connected: Boolean(token) });
  } catch (err: any) {
    console.error("[canva] refresh check failed:", err?.message);
    return NextResponse.json(
      { connected: false, error: "Your Canva connection needs to be set up again." },
      { status: 200 }
    );
  }
}
