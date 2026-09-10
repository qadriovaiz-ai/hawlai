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
  /** The product, read from plan_json.car_type — there is no such column. */
  car_type?: string | null;
  body_copy?: string | null;
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

// Words that say what to DO, or are grammar, not which campaign. People
// describe campaigns in Hinglish and by product, not by headline:
// "lavender candle wala campaign activate karo" has to match on
// "lavender" and "candle" alone. The first version compared the whole
// phrase to the headline, so "lavender candle wala" never matched
// "Ghar ko do lavender ki shanti".
const FILLER = new Set([
  "campaign", "campaigns", "wala", "wali", "wale", "vala", "vali", "vale",
  "karo", "kardo", "karna", "karde", "kar", "hai", "haan", "please", "plz",
  "the", "and", "for", "that", "this", "one", "mera", "meri", "mere", "apna", "apni",
  "activate", "start", "resume", "chalu", "chala", "chalao", "run", "live", "turn",
  "pause", "stop", "band", "off", "halt", "kill",
  "advert", "ads",
]);

function significantWords(s: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const w of norm(s).split(/[^\p{L}\p{N}]+/u)) {
    if (w.length >= 3 && !FILLER.has(w)) seen.add(w);
  }
  return [...seen];
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

  // Score each campaign by how many of their words it contains. Substring
  // on purpose, so "candle" finds "candles". Only a SINGLE top scorer
  // resolves; a tie is a question, never a pick. Nothing is spent on a
  // resolve either — activation still shows the campaign on an approval
  // card first.
  const words = significantWords(opts.description);
  if (words.length > 0) {
    const scored = rows.map((r) => {
      const text = norm([r.headline, r.car_type, r.body_copy].filter(Boolean).join(" "));
      return { r, score: words.filter((w) => text.includes(w)).length };
    });
    const best = Math.max(...scored.map((s) => s.score));
    if (best > 0) {
      const top = scored.filter((s) => s.score === best).map((s) => s.r);
      return top.length === 1 ? { status: "resolved", campaign: top[0] } : { status: "ambiguous", candidates: top };
    }
  }

  return { status: "ambiguous", candidates: rows };
}
