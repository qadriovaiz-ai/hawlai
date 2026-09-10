// Which campaign did they mean — without guessing.
//
// The existing matchCampaign (campaignEditAgent.ts) hands the list to a
// model and takes whichever index it returns. That is tolerable for a
// budget tweak someone then approves; it is not tolerable for turning a
// campaign ON, which starts real spend. A model picking the wrong one of
// two similar campaigns runs the wrong ad with the merchant's money.
//
// Same rule as the price path's interpretCandidates: one clear match is
// resolved, anything else becomes a numbered question.

export type CampaignRow = {
  id: string;
  headline: string | null;
  car_type?: string | null;
  daily_budget?: number | null;
  meta_status?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  generated_image_url?: string | null;
};

export type CampaignResolution =
  | { status: "resolved"; campaign: CampaignRow }
  | { status: "ambiguous"; candidates: CampaignRow[] }
  | { status: "none" }
  | { status: "invalid_id" };

function norm(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function resolveCampaign(
  rows: CampaignRow[],
  opts: { campaignId?: string | null; description?: string | null }
): CampaignResolution {
  if (rows.length === 0) return { status: "none" };

  // A follow-up after a picker: the id must be one we offered. A
  // hallucinated id, or a real one for another business, must not
  // reach Meta.
  const chosen = (opts.campaignId ?? "").trim();
  if (chosen) {
    const hit = rows.find((r) => r.id === chosen);
    return hit ? { status: "resolved", campaign: hit } : { status: "invalid_id" };
  }

  if (rows.length === 1) return { status: "resolved", campaign: rows[0] };

  const phrase = norm(opts.description);
  if (phrase) {
    const matches = rows.filter((r) => {
      const h = norm(r.headline);
      const t = norm(r.car_type);
      return (h && (h.includes(phrase) || phrase.includes(h))) || (t && (t.includes(phrase) || phrase.includes(t)));
    });
    if (matches.length === 1) return { status: "resolved", campaign: matches[0] };
    if (matches.length > 1) return { status: "ambiguous", candidates: matches };
  }

  return { status: "ambiguous", candidates: rows };
}
