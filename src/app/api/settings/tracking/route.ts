import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Per-business tracking configuration (retargeting piece 3/7).
//
// The Conversions API token is a SECRET — it can send conversion data
// to the business's pixel. GET therefore never returns it; it returns
// only whether one is configured, so the UI can show connected state
// without ever putting the token back on the wire.

async function resolveOwnedDealership(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return { error: NextResponse.json({ error: "No dealership" }, { status: 400 }) };

  // Tracking config decides what data leaves the business — owner
  // only, same reasoning as billing identity and the AI employee.
  const { data: owned } = await supabase
    .from("dealerships").select("id").eq("id", dealershipId).eq("owner_id", user.id).maybeSingle();
  if (!owned) return { error: NextResponse.json({ error: "Only the business owner can change tracking settings" }, { status: 403 }) };

  return { dealershipId };
}

export async function GET() {
  const supabase = await createClient();
  const resolved = await resolveOwnedDealership(supabase);
  if (resolved.error) return resolved.error;

  const { data } = await supabase
    .from("dealerships")
    .select("meta_pixel_id, ga_tracking_id, meta_conversions_api_token, google_ads_conversion_id, google_ads_conversion_label, google_remarketing_enabled")
    .eq("id", resolved.dealershipId)
    .single();

  return NextResponse.json({
    metaPixelId: data?.meta_pixel_id ?? "",
    gaTrackingId: data?.ga_tracking_id ?? "",
    // Never the value itself.
    conversionsApiConnected: !!data?.meta_conversions_api_token,
    googleAdsConversionId: data?.google_ads_conversion_id ?? "",
    googleAdsConversionLabel: data?.google_ads_conversion_label ?? "",
    googleRemarketingEnabled: !!data?.google_remarketing_enabled,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveOwnedDealership(supabase);
  if (resolved.error) return resolved.error;

  const { metaPixelId, gaTrackingId, conversionsApiToken, googleAdsConversionId, googleAdsConversionLabel, googleRemarketingEnabled } = await request.json();

  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const update: Record<string, any> = {};
  if (metaPixelId !== undefined) update.meta_pixel_id = clean(metaPixelId);
  if (gaTrackingId !== undefined) update.ga_tracking_id = clean(gaTrackingId);
  if (googleAdsConversionLabel !== undefined) update.google_ads_conversion_label = clean(googleAdsConversionLabel);
  if (googleRemarketingEnabled !== undefined) update.google_remarketing_enabled = googleRemarketingEnabled === true;

  if (googleAdsConversionId !== undefined) {
    const value = clean(googleAdsConversionId);
    // Validated for SHAPE only. A GA4 property id (G-...) pasted here
    // instead of a Google Ads conversion id is a genuinely easy
    // mistake — they're both "the Google tracking id" to a dealer —
    // and it would silently record no conversions at all.
    if (value && !/^AW-\d+$/i.test(value)) {
      return NextResponse.json(
        { error: "A Google Ads conversion ID looks like AW-123456789. If yours starts with G-, that's your Analytics ID — put it in the Analytics field instead." },
        { status: 400 }
      );
    }
    update.google_ads_conversion_id = value ? value.toUpperCase() : null;
  }
  // Only written when a non-empty value is sent, so saving the form
  // without retyping the token can't wipe it. Sending an explicit
  // null is the deliberate way to disconnect.
  if (conversionsApiToken !== undefined) {
    update.meta_conversions_api_token = conversionsApiToken === null ? null : clean(conversionsApiToken);
    if (update.meta_conversions_api_token === null && conversionsApiToken !== null) delete update.meta_conversions_api_token;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ success: true });

  const { error } = await supabase.from("dealerships").update(update).eq("id", resolved.dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
