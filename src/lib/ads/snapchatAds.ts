// ------------------------------------------------------------------
// Snapchat Ads client — P3 piece 6 (platform 3/4)
// ------------------------------------------------------------------
// Snapchat's object model: Ad Account -> Campaign -> Ad Squad -> Ad,
// where an Ad references a Creative, and a Creative references an
// uploaded Media asset. So like Pinterest it has an extra creative
// step, but Snapchat's is a two-parter (media upload, then creative)
// rather than Pinterest's single Pin.
//
// Everything is created PAUSED, same as every other platform here.
// Activation is the separate, approval-gated action.
//
// UNTESTED AGAINST A LIVE ACCOUNT: built against Snapchat's
// documented Marketing API v1. Needs a registered Snap app with
// Marketing API access before it works with real accounts.
// ------------------------------------------------------------------

const API_BASE = "https://adsapi.snapchat.com/v1";

export interface SnapchatCreds {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string | null;
  adAccountId: string;
}

export async function getValidSnapchatAccessToken(creds: SnapchatCreds): Promise<{ accessToken: string; refreshed?: { accessToken: string; expiry: string } }> {
  const expiresAt = creds.tokenExpiry ? new Date(creds.tokenExpiry).getTime() : 0;
  if (expiresAt - Date.now() > 5 * 60 * 1000) return { accessToken: creds.accessToken };

  const res = await fetch("https://accounts.snapchat.com/login/oauth2/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SNAPCHAT_CLIENT_ID ?? "",
      client_secret: process.env.SNAPCHAT_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? data?.error ?? "Couldn't refresh Snapchat access — reconnect it in Integrations.");

  const expiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  return { accessToken: data.access_token, refreshed: { accessToken: data.access_token, expiry } };
}

// Snapchat wraps every response in a plural container keyed by the
// resource type, each entry having {sub_request_status, <resource>}.
// Pulling the id out is fiddly enough to be worth one helper.
function extractId(data: any, key: string): string {
  const list = data?.[`${key}s`] ?? [];
  const first = list[0]?.[key];
  const id = first?.id;
  if (!id) {
    const reason = list[0]?.sub_request_error_reason ?? data?.debug_message ?? "no id returned";
    throw new Error(`[snapchat] ${key} creation failed — ${reason}`);
  }
  return id;
}

async function snapPost(path: string, accessToken: string, body: any): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[snapchat${path}] ${data?.debug_message ?? data?.error_description ?? `API error (${res.status})`}`);
  }
  return data;
}

export interface SnapchatLaunchInput {
  campaignName: string;
  dailyBudgetInr: number;
  headline: string;
  imageUrl: string;
  destinationUrl: string;
  brandName: string;
}

export interface SnapchatLaunchResult {
  campaignId: string;
  adSquadId: string;
  adId: string;
  creativeId: string;
}

// Snapchat budgets are in micro-currency, same as Google/Pinterest.
const toMicros = (rupees: number) => Math.round(rupees * 1_000_000);

export async function launchSnapchatCampaign(
  creds: SnapchatCreds,
  accessToken: string,
  input: SnapchatLaunchInput
): Promise<SnapchatLaunchResult> {
  const { adAccountId } = creds;

  // Step 1: register the media asset, then upload the actual bytes to
  // it. Snapchat splits these, unlike Pinterest's single Pin call.
  const mediaRes = await snapPost(`/adaccounts/${adAccountId}/media`, accessToken, {
    media: [{ name: `${input.campaignName} image`.slice(0, 100), type: "IMAGE", ad_account_id: adAccountId }],
  });
  const mediaId = extractId(mediaRes, "media");

  const imageRes = await fetch(input.imageUrl);
  if (!imageRes.ok) throw new Error("[snapchat] Couldn't fetch the creative image to upload");
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "creative.png");
  const uploadRes = await fetch(`${API_BASE}/media/${mediaId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`[snapchat] Media upload failed (${uploadRes.status}): ${errText.slice(0, 200)}`);
  }

  // Step 2: creative, referencing the uploaded media.
  const creativeRes = await snapPost(`/adaccounts/${adAccountId}/creatives`, accessToken, {
    creatives: [{
      ad_account_id: adAccountId,
      name: `${input.campaignName} creative`.slice(0, 100),
      type: "SNAP_AD",
      headline: input.headline.slice(0, 34), // Snapchat's documented headline cap
      brand_name: input.brandName.slice(0, 25),
      top_snap_media_id: mediaId,
      call_to_action: "LEARN_MORE",
      web_view_properties: { url: input.destinationUrl },
    }],
  });
  const creativeId = extractId(creativeRes, "creative");

  // Step 3: campaign — PAUSED, no spend starts here.
  const campaignRes = await snapPost(`/adaccounts/${adAccountId}/campaigns`, accessToken, {
    campaigns: [{
      ad_account_id: adAccountId,
      name: input.campaignName.slice(0, 100),
      status: "PAUSED",
      objective: "WEB_VIEW",
      start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // an hour out — a start_time in the past is rejected
      daily_budget_micro: toMicros(input.dailyBudgetInr),
    }],
  });
  const campaignId = extractId(campaignRes, "campaign");

  // Step 4: ad squad (Snapchat's ad-set equivalent) — holds targeting
  // and bidding. India-targeted, matching this platform's user base.
  const adSquadRes = await snapPost(`/campaigns/${campaignId}/adsquads`, accessToken, {
    adsquads: [{
      campaign_id: campaignId,
      name: `${input.campaignName} ad squad`.slice(0, 100),
      status: "PAUSED",
      type: "SNAP_ADS",
      optimization_goal: "IMPRESSIONS",
      placement_v2: { config: "AUTOMATIC" },
      billing_event: "IMPRESSION",
      bid_micro: toMicros(Math.max(1, Math.round(input.dailyBudgetInr / 50))),
      daily_budget_micro: toMicros(input.dailyBudgetInr),
      targeting: { geos: [{ country_code: "in" }] },
    }],
  });
  const adSquadId = extractId(adSquadRes, "adsquad");

  // Step 5: the ad, tying the squad to the creative.
  const adRes = await snapPost(`/adsquads/${adSquadId}/ads`, accessToken, {
    ads: [{
      ad_squad_id: adSquadId,
      creative_id: creativeId,
      name: `${input.campaignName} ad`.slice(0, 100),
      status: "PAUSED",
      type: "SNAP_AD",
    }],
  });
  const adId = extractId(adRes, "ad");

  return { campaignId, adSquadId, adId, creativeId };
}

// The real spend trigger — called only after the same approval gating
// every other platform goes through (P0 10b).
export async function setSnapchatCampaignStatus(
  accessToken: string,
  campaignId: string,
  adAccountId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<void> {
  const res = await fetch(`${API_BASE}/adaccounts/${adAccountId}/campaigns`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ campaigns: [{ id: campaignId, status }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`[snapchat] ${data?.debug_message ?? `Couldn't update campaign status (${res.status})`}`);
}
