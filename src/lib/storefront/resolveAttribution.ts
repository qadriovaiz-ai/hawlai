// Turning what the browser sent into something the dashboard can join.
//
// withCampaignTag() stamps utm_campaign=<ad_creatives.id> — the DRAFT
// id, because that is the only stable per-ad identifier that exists
// before Meta hands back its own. The dashboard joins on
// meta_campaign_id, the same column leads use. So the raw tag has to be
// resolved through ad_creatives, and it is done at ORDER time rather
// than at read time: the row is the record of what happened, and a
// campaign deleted later should not silently un-attribute a sale that
// really came from it.
//
// Both values are stored. The raw tag is kept even when it resolves to
// nothing, because "an order arrived tagged with something we could not
// match" is a real observation — a mistyped link, a campaign from
// another tool, someone else's utm — and dropping it would leave no
// trace to look at.

export type OrderAttribution = {
  utm_campaign: string | null;
  utm_source: string | null;
  meta_campaign_id: string | null;
};

const EMPTY: OrderAttribution = { utm_campaign: null, utm_source: null, meta_campaign_id: null };

/** Trimmed, length-capped, null when empty. Mirrors the client's rule. */
function clean(value: unknown): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return v.slice(0, 200);
}

/** Cheap shape check — a draft id is a uuid, and anything else cannot match a row. */
function looksLikeDraftId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Resolve a submitted attribution blob into order columns.
 *
 * NEVER THROWS. This runs inside order creation, and a sale must not
 * fail because a lookup did. Every failure degrades to "we know the tag
 * but not the campaign", which is still more than was recorded before.
 */
export async function resolveOrderAttribution(
  supabase: any,
  dealershipId: string,
  submitted: unknown
): Promise<OrderAttribution> {
  if (!submitted || typeof submitted !== "object") return EMPTY;

  const raw = submitted as Record<string, unknown>;
  const utm_campaign = clean(raw.utm_campaign);
  const utm_source = clean(raw.utm_source);
  if (!utm_campaign && !utm_source) return EMPTY;

  const base: OrderAttribution = { utm_campaign, utm_source, meta_campaign_id: null };
  if (!utm_campaign || !looksLikeDraftId(utm_campaign)) return base;

  try {
    // Scoped to the dealership: a utm_campaign is attacker-controlled,
    // so an id belonging to another business must not attach this
    // order's revenue to their campaign.
    const { data } = await supabase
      .from("ad_creatives")
      .select("meta_campaign_id")
      .eq("id", utm_campaign)
      .eq("dealership_id", dealershipId)
      .maybeSingle();

    return { ...base, meta_campaign_id: data?.meta_campaign_id ?? null };
  } catch {
    return base;
  }
}
