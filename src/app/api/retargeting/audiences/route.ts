import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import {
  createWebsiteAudience,
  createCustomerListAudience,
  createLookalikeAudience,
  replaceAudienceUsers,
  fetchAudienceCount,
  type AudienceResult,
} from "@/lib/ads/metaCustomAudiences";
import { buildSuppressionList, hashPhone, hashEmail, isSuppressed } from "@/lib/ads/audienceHashing";
import { loadMetaAudienceToken } from "@/lib/ads/metaToken";
import { effectiveBusinessModels } from "@/lib/business/businessModel";
import { bookingPageUrl } from "@/lib/catalog/catalogItem";
import { variantsFor, parseVariant, listMembers, type Variant } from "@/lib/retargeting/audiences";

// Meta Custom Audience sync — retargeting piece 5/7.
//
// Creates/refreshes the retargeting lists in the business's own Meta
// ad account. Each audience has a stable audience_key so re-syncing
// updates the same Meta audience rather than creating duplicates
// (enforced by unique(dealership_id, audience_key), migration 155).
//
// TOKEN (Retargeting R1, 2026-09-20): audiences are ad-account objects, so
// create, upload and count use the USER token (lib/ads/metaToken.ts
// loadMetaAudienceToken) — never the Page token, which can't manage them.
// An expired one says "reconnect" instead of failing at Meta.
//
// BY BUSINESS MODEL (R2, 2026-09-20): which audiences a business gets
// depends on how it makes money (lib/retargeting/audiences.ts). Customer
// lists are REPLACED on every sync, so people who have since booked,
// converted or opted out drop off.
//
// RECENCY AND EXCLUSIONS (R3, 2026-09-20): an audience of recent interest
// is three — 1-3, 4-14 and 15-30 days — each its own Meta audience, keyed
// "abandoned_cart:4_14". People who already bought or booked are left out
// of all of them.

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

/** The business's setup: ad account, pixel, booking page, and the audiences for how it makes money. */
async function setupOf(supabase: any, dealershipId: string) {
  const [{ data: dealership }, { data: catalogue }] = await Promise.all([
    supabase.from("dealerships").select("fb_ad_account_id, meta_pixel_id, business_models, booking_slug").eq("id", dealershipId).single(),
    supabase.from("products").select("kind").eq("dealership_id", dealershipId).eq("is_active", true),
  ]);
  const productCount = (catalogue ?? []).filter((p: any) => p.kind !== "service").length;
  const serviceCount = (catalogue ?? []).length - productCount;
  const models = effectiveBusinessModels(dealership?.business_models, { productCount, serviceCount });
  return { dealership, models, variants: variantsFor(models.models) };
}

/** Why this audience can't be created right now, or null when it can. */
function blockedBy(v: Variant, dealership: any): string | null {
  if (v.def.type === "website" && !dealership?.meta_pixel_id) return "Add your Meta Pixel ID in Integrations first — this audience is built from pixel activity.";
  if (v.def.rule && "includeUrl" in v.def.rule && !dealership?.booking_slug) return "Set up your booking page first — this audience is the people who open it.";
  return null;
}

export async function GET() {
  const supabase = await createClient();
  const resolved = await resolveOwner(supabase);
  if (resolved.error) return resolved.error;

  const [{ data: rows }, setup, token] = await Promise.all([
    supabase.from("meta_custom_audiences").select("*").eq("dealership_id", resolved.dealershipId),
    setupOf(supabase, resolved.dealershipId),
    loadMetaAudienceToken(supabase, resolved.dealershipId),
  ]);
  const { dealership, models, variants } = setup;
  const byKey = new Map((rows ?? []).map((r: any) => [r.audience_key, r]));

  return NextResponse.json({
    // A pixel is only needed for the pixel-based audiences — each one says
    // what's missing for it rather than the whole panel going dark.
    ready: !!(dealership?.fb_ad_account_id && token.ok),
    missing: {
      adAccount: !dealership?.fb_ad_account_id,
      pixel: !dealership?.meta_pixel_id && variants.some((v) => v.def.type === "website"),
      connection: !token.ok,
    },
    // What to do about the connection, in words: connect, or reconnect.
    connection: token.ok ? null : { reason: token.reason, message: token.message },
    models: models.models,
    modelsGuessed: models.inferred,
    audiences: variants.map((v) => {
      const row = byKey.get(v.id);
      return {
        key: v.id,
        group: v.def.key,
        tier: v.tier?.label ?? null,
        label: v.label,
        description: v.description,
        type: v.def.type,
        blocked: blockedBy(v, dealership),
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
  const { dealership, models, variants } = await setupOf(supabase, dealershipId);
  // Only an audience for how this business makes money, and a tier it has.
  const variant = variants.find((v) => v.id === audienceKey);
  const definition = variant?.def;
  if (!variant || !definition) return NextResponse.json({ error: parseVariant(audienceKey) ? "That audience isn't one for how your business makes money." : "Unknown audience" }, { status: 400 });

  // Nothing goes to Meta without a user token — no Page-token fallback.
  const access = await loadMetaAudienceToken(supabase, dealershipId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message, needsReconnect: access.reason !== "missing" }, { status: 400 });
  }
  const token = access.token;
  const rawAccount = dealership?.fb_ad_account_id;
  if (!rawAccount) {
    return NextResponse.json({ error: "No Meta ad account is linked yet — choose one in Integrations." }, { status: 400 });
  }
  const adAccountId = String(rawAccount).startsWith("act_") ? String(rawAccount) : `act_${rawAccount}`;
  const blocked = blockedBy(variant, dealership);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

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
  /** Said on the row when a list had nobody to send. */
  let note: string | null = null;

  try {
    if (definition.type === "website") {
      if (audienceId) {
        // Website audiences are rule-based — Meta keeps them current
        // on its own side, so there is nothing to re-push.
        result = { success: true, audienceId };
      } else {
        const rule = definition.rule!;
        result = await createWebsiteAudience({
          adAccountId,
          accessToken: token,
          pixelId: dealership!.meta_pixel_id!,
          name: variant.name,
          includeEvent: "includeEvent" in rule ? rule.includeEvent : "PageView",
          includeUrlContains: "includeUrl" in rule ? bookingPageUrl(dealership!.booking_slug)! : undefined,
          excludeEvent: rule.excludeEvent,
          window: variant.tier ? { fromDays: variant.tier.fromDays, toDays: variant.tier.toDays } : undefined,
          description: variant.description,
        });
        audienceId = result.audienceId;
      }
    } else if (definition.type === "customer_list") {
      if (!audienceId) {
        result = await createCustomerListAudience({ adAccountId, accessToken: token, name: variant.name, description: variant.description });
        audienceId = result.audienceId;
      } else {
        result = { success: true, audienceId };
      }

      // Unlike website audiences, a customer list must be pushed — Meta
      // has no way to see our records. Replaced, not appended.
      if (result.success && audienceId) {
        const members = await listMembers(service, dealershipId, variant.id, Date.now(), models.models);
        // Same suppression as the CSV export (piece 1) — an opted-out
        // person must not reach Meta through this path either.
        const suppression = await buildSuppressionList(service, dealershipId);
        const rows = members
          .filter((m) => !isSuppressed(suppression, m.phone, m.email))
          .map((m) => ({ phoneHash: hashPhone(m.phone), emailHash: hashEmail(m.email) }));
        const replaced = await replaceAudienceUsers({ audienceId, accessToken: token, rows });
        result = replaced;
        if (replaced.success && replaced.sent === 0) {
          note = existing?.meta_audience_id
            ? "Nobody is in this group right now. Meta still has the people from the last sync — pause any campaign aimed at it."
            : "Nobody is in this group yet — sync again once there is.";
        }
      }
    } else {
      // Lookalike needs its source list to exist first — Meta models
      // from real people, so there's nothing to model without it.
      const { data: source } = await service
        .from("meta_custom_audiences")
        .select("meta_audience_id")
        .eq("dealership_id", dealershipId)
        // A seed is a plain list (the converters), never a tier — its key is its id.
        .eq("audience_key", definition.seed!)
        .maybeSingle();

      if (!source?.meta_audience_id) {
        return NextResponse.json(
          { error: `Sync "${parseVariant(definition.seed!)!.label}" first — a lookalike is built from that list.` },
          { status: 400 }
        );
      }

      if (audienceId) {
        result = { success: true, audienceId };
      } else {
        result = await createLookalikeAudience({
          adAccountId,
          accessToken: token,
          name: variant.name,
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
        name: variant.name,
        meta_audience_id: audienceId ?? null,
        approximate_count: approximateCount,
        sync_status: result.success ? "synced" : "failed",
        sync_error: result.success ? note : result.error ?? "Unknown error",
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "dealership_id,audience_key" }
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error, needsTermsAcceptance: result.needsTermsAcceptance ?? false, needsReconnect: result.needsReconnect ?? false }, { status: 400 });
    }
    return NextResponse.json({ success: true, audienceId, approximateCount, note });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Sync failed" }, { status: 500 });
  }
}
