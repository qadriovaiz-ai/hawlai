import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getValidGoogleAdsAccessToken } from "@/lib/ads/googleAds";
import { listConversionActions } from "@/lib/ads/googleConversions";
import { readToken, tokenWrite } from "@/lib/crypto/oauthSecrets";

// A4 — list this dealer's Google Ads conversion actions so they click
// one instead of copying an ID and a label out of a tag snippet.
//
// POST, not GET: this is a billed third-party call behind a token
// refresh, and it must not be prefetched or retried by anything that
// treats GET as free.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // Conversion tracking decides what sales data leaves the business —
  // owner only, matching /api/settings/tracking rather than inventing
  // a second rule for the same data.
  const { data: dealership } = await supabase
    .from("dealerships")
    // Columns named literally, NOT via tokenSelect("google_ads"). A
    // template literal or a computed string defeats the typed client's
    // row-type inference and everything downstream silently becomes
    // any — the same trap five other routes hit during migration 165.
    .select(
      "owner_id, google_ads_customer_id, google_ads_token_expiry, google_ads_access_token, google_ads_access_token_encrypted, google_ads_refresh_token, google_ads_refresh_token_encrypted"
    )
    .eq("id", dealershipId)
    .single();

  if (!dealership || dealership.owner_id !== user.id) {
    return NextResponse.json({ error: "Only the business owner can change conversion tracking" }, { status: 403 });
  }

  const accessToken = readToken(dealership, "google_ads", "access_token");
  const refreshToken = readToken(dealership, "google_ads", "refresh_token");
  if (!refreshToken) {
    return NextResponse.json({ error: "Google Ads isn't connected yet. Connect it first, then come back." }, { status: 400 });
  }

  let token: string;
  try {
    const refreshed = await getValidGoogleAdsAccessToken({
      accessToken: accessToken ?? "",
      refreshToken,
      tokenExpiry: dealership.google_ads_token_expiry,
      customerId: dealership.google_ads_customer_id ?? "",
    });
    token = refreshed.accessToken;
    // Persist a refreshed token so the next call doesn't refresh again.
    if (refreshed.refreshed) {
      await supabase
        .from("dealerships")
        .update({
          ...tokenWrite("google_ads", "access_token", refreshed.refreshed.accessToken),
          google_ads_token_expiry: refreshed.refreshed.expiry,
        })
        .eq("id", dealershipId);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const result = await listConversionActions(dealership.google_ads_customer_id ?? "", token);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

  // Only actions with both halves are offerable — one without a label
  // cannot record a conversion, so showing it would be offering a
  // choice that silently does nothing.
  const usable = result.actions.filter((a) => a.conversionId && a.conversionLabel);
  return NextResponse.json({
    actions: usable,
    // Reported so the UI can explain a short list rather than just
    // showing one, which reads like a bug.
    skipped: result.actions.length - usable.length,
  });
}
