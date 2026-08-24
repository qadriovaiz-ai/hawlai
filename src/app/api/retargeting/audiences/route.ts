import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import {
  createWebsiteAudience,
  createCustomerListAudience,
  createLookalikeAudience,
  addUsersToAudience,
  fetchAudienceCount,
  type AudienceResult,
} from "@/lib/ads/metaCustomAudiences";
import { buildSuppressionList, hashPhone, hashEmail, isSuppressed } from "@/lib/ads/audienceHashing";

// Meta Custom Audience sync — retargeting piece 5/7.
//
// Creates/refreshes the retargeting lists in the business's own Meta
// ad account. Each audience has a stable audience_key so re-syncing
// updates the same Meta audience rather than creating duplicates
// (enforced by unique(dealership_id, audience_key), migration 155).

type AudienceKey = "abandoned_cart" | "viewed_no_purchase" | "buyers" | "buyers_lookalike";

const DEFINITIONS: Record<AudienceKey, { name: string; type: "website" | "customer_list" | "lookalike"; label: string; description: string }> = {
  abandoned_cart: {
    name: "Hawlai — Added to cart, didn't buy",
    type: "website",
    label: "Added to cart but didn't buy",
    description: "People who put something in their cart in the last 30 days and haven't ordered.",
  },
  viewed_no_purchase: {
    name: "Hawlai — Viewed a product, didn't buy",
    type: "website",
    label: "Viewed a product but didn't buy",
    description: "People who looked at a product in the last 30 days and haven't ordered.",
  },
  buyers: {
    name: "Hawlai — Customers who bought",
    type: "customer_list",
    label: "Existing customers",
    description: "People who have actually ordered from you.",
  },
  buyers_lookalike: {
    name: "Hawlai — People like your customers",
    type: "lookalike",
    label: "People similar to your customers",
    description: "New people whose behaviour resembles your existing customers.",
  },
};

async function resolveOwner(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return { error: NextResponse.json({ error: "No dealership" }, { status: 400 }) };
  const { data: owned } = await supabase.from("dealerships").select("id").eq("id", dealershipId).eq("owner_id", user.id).maybeSingle();
  if (!owned) return { error: NextResponse.json({ error: "Only the business owner can manage audiences" }, { status: 403 }) };
  return { dealershipId };
}

export async function GET() {
  const supabase = await createClient();
  const resolved = await resolveOwner(supabase);
  if (resolved.error) return resolved.error;

  const [{ data: rows }, { data: dealership }] = await Promise.all([
    supabase.from("meta_custom_audiences").select("*").eq("dealership_id", resolved.dealershipId),
    supabase.from("dealerships").select("fb_ad_account_id, meta_pixel_id, fb_page_access_token").eq("id", resolved.dealershipId).single(),
  ]);

  const byKey = new Map((rows ?? []).map((r: any) => [r.audience_key, r]));

  return NextResponse.json({
    // Reports readiness rather than silently offering a sync that
    // can't work — both a pixel and an ad account are required.
    ready: !!(dealership?.fb_ad_account_id && dealership?.meta_pixel_id && dealership?.fb_page_access_token),
    missing: {
      adAccount: !dealership?.fb_ad_account_id,
      pixel: !dealership?.meta_pixel_id,
      connection: !dealership?.fb_page_access_token,
    },
    audiences: (Object.keys(DEFINITIONS) as AudienceKey[]).map((key) => {
      const row = byKey.get(key);
      return {
        key,
        label: DEFINITIONS[key].label,
        description: DEFINITIONS[key].description,
        type: DEFINITIONS[key].type,
        syncStatus: row?.sync_status ?? null,
        syncError: row?.sync_error ?? null,
        approximateCount: row?.approximate_count ?? null,
        lastSyncedAt: row?.last_synced_at ?? null,
        metaAudienceId: row?.meta_audience_id ?? null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const resolved = await resolveOwner(supabase);
  if (resolved.error) return resolved.error;
  const { dealershipId } = resolved;

  const { audienceKey } = await request.json();
  const definition = DEFINITIONS[audienceKey as AudienceKey];
  if (!definition) return NextResponse.json({ error: "Unknown audience" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_ad_account_id, meta_pixel_id, fb_page_access_token")
    .eq("id", dealershipId)
    .single();

  const token = dealership?.fb_page_access_token;
  const rawAccount = dealership?.fb_ad_account_id;
  if (!token || !rawAccount) {
    return NextResponse.json({ error: "Connect your Facebook Page and ad account first, in Integrations." }, { status: 400 });
  }
  const adAccountId = String(rawAccount).startsWith("act_") ? String(rawAccount) : `act_${rawAccount}`;

  if (definition.type === "website" && !dealership?.meta_pixel_id) {
    return NextResponse.json({ error: "Add your Meta Pixel ID in Integrations first — website audiences are built from pixel activity." }, { status: 400 });
  }

  const service = createServiceClient();

  // Reuse the existing Meta audience if one was already created for
  // this purpose; only create when there genuinely isn't one.
  const { data: existing } = await service
    .from("meta_custom_audiences")
    .select("id, meta_audience_id")
    .eq("dealership_id", dealershipId)
    .eq("audience_key", audienceKey)
    .maybeSingle();

  let result: AudienceResult;
  let audienceId = existing?.meta_audience_id as string | undefined;

  try {
    if (definition.type === "website") {
      if (audienceId) {
        // Website audiences are rule-based — Meta keeps them current
        // on its own side, so there is nothing to re-push.
        result = { success: true, audienceId };
      } else {
        result = await createWebsiteAudience({
          adAccountId,
          accessToken: token,
          pixelId: dealership!.meta_pixel_id!,
          name: definition.name,
          includeEvent: audienceKey === "abandoned_cart" ? "AddToCart" : "ViewContent",
          excludeEvent: "Purchase",
          description: definition.description,
        });
        audienceId = result.audienceId;
      }
    } else if (definition.type === "customer_list") {
      if (!audienceId) {
        result = await createCustomerListAudience({ adAccountId, accessToken: token, name: definition.name, description: definition.description });
        audienceId = result.audienceId;
      } else {
        result = { success: true, audienceId };
      }

      // Unlike website audiences, a customer list must be pushed —
      // Meta has no way to see our orders table.
      if (result.success && audienceId) {
        const { data: orders } = await service
          .from("orders")
          .select("customer_phone, customer_email")
          .eq("dealership_id", dealershipId)
          .neq("status", "cancelled");

        // Same suppression as the CSV export (piece 1) — an opted-out
        // person must not reach Meta through this path either.
        const suppression = await buildSuppressionList(service, dealershipId);
        const rows = (orders ?? [])
          .filter((o: any) => !isSuppressed(suppression, o.customer_phone, o.customer_email))
          .map((o: any) => ({ phoneHash: hashPhone(o.customer_phone), emailHash: hashEmail(o.customer_email) }));

        result = await addUsersToAudience({ audienceId, accessToken: token, rows });
      }
    } else {
      // Lookalike needs its source list to exist first — Meta models
      // from real people, so there's nothing to model without it.
      const { data: source } = await service
        .from("meta_custom_audiences")
        .select("meta_audience_id")
        .eq("dealership_id", dealershipId)
        .eq("audience_key", "buyers")
        .maybeSingle();

      if (!source?.meta_audience_id) {
        return NextResponse.json(
          { error: "Sync \"Existing customers\" first — a lookalike is built from that list." },
          { status: 400 }
        );
      }

      if (audienceId) {
        result = { success: true, audienceId };
      } else {
        result = await createLookalikeAudience({
          adAccountId,
          accessToken: token,
          name: definition.name,
          originAudienceId: source.meta_audience_id,
        });
        audienceId = result.audienceId;
      }
    }

    const approximateCount = result.success && audienceId ? await fetchAudienceCount(audienceId, token) : null;

    await service.from("meta_custom_audiences").upsert(
      {
        dealership_id: dealershipId,
        audience_key: audienceKey,
        audience_type: definition.type,
        name: definition.name,
        meta_audience_id: audienceId ?? null,
        approximate_count: approximateCount,
        sync_status: result.success ? "synced" : "failed",
        sync_error: result.success ? null : result.error ?? "Unknown error",
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "dealership_id,audience_key" }
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error, needsTermsAcceptance: result.needsTermsAcceptance ?? false }, { status: 400 });
    }
    return NextResponse.json({ success: true, audienceId, approximateCount });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Sync failed" }, { status: 500 });
  }
}
