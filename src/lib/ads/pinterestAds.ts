// ------------------------------------------------------------------
// Pinterest Ads client — P3 piece 6 (platform 2/4)
// ------------------------------------------------------------------
// Pinterest's object model: Ad Account -> Campaign -> Ad Group -> Ad,
// where an Ad references a Pin (the creative). That's one more step
// than Meta/Google — the image has to become a real Pin on a real
// board before it can be advertised — so this creates the Pin too.
//
// Everything is created PAUSED, same as every other platform here.
// Activation is the separate, approval-gated action.
//
// UNTESTED AGAINST A LIVE ACCOUNT: built against Pinterest's
// documented v5 API. Needs a registered Pinterest app + standard
// (non-trial) API access before it works with real accounts — see the
// registration guide in the commit for this piece.
// ------------------------------------------------------------------

const API_BASE = "https://api.pinterest.com/v5";

export interface PinterestCreds {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string | null;
  adAccountId: string;
}

// Pinterest uses Basic auth with the app credentials for refresh
// (unlike Google's client_id/secret in the body).
export async function getValidPinterestAccessToken(creds: PinterestCreds): Promise<{ accessToken: string; refreshed?: { accessToken: string; expiry: string } }> {
  const expiresAt = creds.tokenExpiry ? new Date(creds.tokenExpiry).getTime() : 0;
  if (expiresAt - Date.now() > 5 * 60 * 1000) return { accessToken: creds.accessToken };

  const basic = Buffer.from(`${process.env.PINTEREST_CLIENT_ID ?? ""}:${process.env.PINTEREST_CLIENT_SECRET ?? ""}`).toString("base64");
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: creds.refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? "Couldn't refresh Pinterest access — reconnect it in Integrations.");

  const expiry = new Date(Date.now() + (data.expires_in ?? 2592000) * 1000).toISOString();
  return { accessToken: data.access_token, refreshed: { accessToken: data.access_token, expiry } };
}

async function pinterestPost(path: string, accessToken: string, body: any): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[pinterest${path}] ${data?.message ?? data?.error_description ?? `API error (${res.status})`}`);
  }
  return data;
}

export interface PinterestLaunchInput {
  campaignName: string;
  dailyBudgetInr: number;
  headline: string;
  bodyCopy: string;
  imageUrl: string;
  destinationUrl: string;
  boardId?: string | null;
}

export interface PinterestLaunchResult {
  campaignId: string;
  adGroupId: string;
  adId: string;
  pinId: string;
}

// Pinterest budgets are in micro-currency, same convention as Google.
const toMicros = (rupees: number) => Math.round(rupees * 1_000_000);

// Pinterest requires a board to pin to. Reuses an existing one if the
// account has any, rather than creating a new board per campaign and
// cluttering the business's profile.
async function resolveBoardId(accessToken: string, explicitBoardId?: string | null): Promise<string> {
  if (explicitBoardId) return explicitBoardId;

  const res = await fetch(`${API_BASE}/boards?page_size=1`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (res.ok && data?.items?.length > 0) return data.items[0].id;

  const created = await pinterestPost("/boards", accessToken, {
    name: "Hawlai Ads",
    description: "Pins created for advertising campaigns.",
    privacy: "PUBLIC",
  });
  return created.id;
}

export async function launchPinterestCampaign(
  creds: PinterestCreds,
  accessToken: string,
  input: PinterestLaunchInput
): Promise<PinterestLaunchResult> {
  const { adAccountId } = creds;

  // Step 1: the Pin — Pinterest ads advertise a Pin, so the creative
  // has to exist as one first. This is the extra step Meta/Google
  // don't have.
  const boardId = await resolveBoardId(accessToken, input.boardId);
  const pin = await pinterestPost(`/pins`, accessToken, {
    board_id: boardId,
    title: input.headline.slice(0, 100),
    description: input.bodyCopy.slice(0, 500),
    link: input.destinationUrl,
    media_source: { source_type: "image_url", url: input.imageUrl },
  });

  // Step 2: campaign — PAUSED, no spend starts here.
  const campaign = await pinterestPost(`/ad_accounts/${adAccountId}/campaigns`, accessToken, [{
    ad_account_id: adAccountId,
    name: input.campaignName.slice(0, 100),
    objective_type: "WEB_CONVERSION",
    status: "PAUSED",
    daily_spend_cap: toMicros(input.dailyBudgetInr),
  }]);
  const campaignId = campaign?.items?.[0]?.data?.id ?? campaign?.items?.[0]?.id;
  if (!campaignId) throw new Error("[pinterest] Campaign created but no id returned");

  // Step 3: ad group — holds targeting and the budget schedule.
  const adGroup = await pinterestPost(`/ad_accounts/${adAccountId}/ad_groups`, accessToken, [{
    ad_account_id: adAccountId,
    campaign_id: campaignId,
    name: `${input.campaignName} ad group`.slice(0, 100),
    status: "PAUSED",
    billable_event: "CLICKTHROUGH",
    budget_in_micro_currency: toMicros(input.dailyBudgetInr),
    bid_in_micro_currency: toMicros(Math.max(1, Math.round(input.dailyBudgetInr / 50))),
    auto_targeting_enabled: true,
  }]);
  const adGroupId = adGroup?.items?.[0]?.data?.id ?? adGroup?.items?.[0]?.id;
  if (!adGroupId) throw new Error("[pinterest] Ad group created but no id returned");

  // Step 4: the ad, referencing the Pin from step 1.
  const ad = await pinterestPost(`/ad_accounts/${adAccountId}/ads`, accessToken, [{
    ad_account_id: adAccountId,
    ad_group_id: adGroupId,
    creative_type: "REGULAR",
    pin_id: pin.id,
    name: `${input.campaignName} ad`.slice(0, 100),
    status: "PAUSED",
  }]);
  const adId = ad?.items?.[0]?.data?.id ?? ad?.items?.[0]?.id;
  if (!adId) throw new Error("[pinterest] Ad created but no id returned");

  return { campaignId, adGroupId, adId, pinId: pin.id };
}

// The real spend trigger — called only after the same approval gating
// every other platform goes through (P0 10b).
export async function setPinterestCampaignStatus(
  creds: PinterestCreds,
  accessToken: string,
  campaignId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<void> {
  const res = await fetch(`${API_BASE}/ad_accounts/${creds.adAccountId}/campaigns`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ id: campaignId, status }]),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`[pinterest] ${data?.message ?? `Couldn't update campaign status (${res.status})`}`);
}
