// ------------------------------------------------------------------
// LinkedIn Ads client — P3 piece 6 (platform 4/4)
// ------------------------------------------------------------------
// LinkedIn's object model is the most involved of the four: an Ad
// Account -> Campaign Group -> Campaign -> Creative, where the
// creative references a Share/UGC post owned by an ORGANIZATION (a
// company page), not a person. That organization requirement is why
// this one is built last — it needs a page association the other
// three don't, and it's the one most likely to fail for a business
// that has no LinkedIn company page.
//
// Everything is created PAUSED (LinkedIn's own term is DRAFT/PAUSED
// depending on the object). Activation is the separate,
// approval-gated action.
//
// UNTESTED AGAINST A LIVE ACCOUNT: built against LinkedIn's
// documented Marketing API (Rest.li 2.0, versioned headers). Needs a
// registered LinkedIn app with Marketing Developer Platform access —
// a partner-review process, the strictest of the four platforms.
// ------------------------------------------------------------------

const API_BASE = "https://api.linkedin.com/rest";
// LinkedIn requires an explicit API version header on every call.
const LINKEDIN_VERSION = "202405";

export interface LinkedInCreds {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string | null;
  adAccountId: string;
  organizationId: string;
}

export async function getValidLinkedInAccessToken(creds: LinkedInCreds): Promise<{ accessToken: string; refreshed?: { accessToken: string; expiry: string } }> {
  const expiresAt = creds.tokenExpiry ? new Date(creds.tokenExpiry).getTime() : 0;
  if (expiresAt - Date.now() > 5 * 60 * 1000) return { accessToken: creds.accessToken };

  // Refresh tokens are only issued to apps approved for them; without
  // one the person simply reconnects, same as any other expired
  // connection here.
  if (!creds.refreshToken) {
    throw new Error("LinkedIn access expired — reconnect it in Integrations.");
  }

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? data?.error ?? "Couldn't refresh LinkedIn access — reconnect it in Integrations.");

  const expiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  return { accessToken: data.access_token, refreshed: { accessToken: data.access_token, expiry } };
}

function linkedInHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": LINKEDIN_VERSION,
  };
}

// LinkedIn returns created-resource ids in an x-restli-id header
// rather than the body, unlike every other platform here.
async function linkedInPost(path: string, accessToken: string, body: any): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: linkedInHeaders(accessToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`[linkedin${path}] ${errText.slice(0, 300) || `API error (${res.status})`}`);
  }
  const id = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
  if (id) return id;
  // Some endpoints do return a body id — fall back to it rather than
  // failing a request that actually succeeded.
  const data = await res.json().catch(() => ({}));
  const bodyId = data?.id ?? data?.elements?.[0]?.id;
  if (!bodyId) throw new Error(`[linkedin${path}] created but no id returned`);
  return String(bodyId);
}

export interface LinkedInLaunchInput {
  campaignName: string;
  dailyBudgetInr: number;
  headline: string;
  bodyCopy: string;
  imageUrl: string;
  destinationUrl: string;
}

export interface LinkedInLaunchResult {
  campaignGroupId: string;
  campaignId: string;
  creativeId: string;
}

// Uploads the creative image as a LinkedIn image asset owned by the
// organization. Two-step like Snapchat: register an upload, then PUT
// the bytes to the returned URL.
async function uploadImage(accessToken: string, organizationUrn: string, imageUrl: string): Promise<string> {
  const initRes = await fetch(`${API_BASE}/images?action=initializeUpload`, {
    method: "POST",
    headers: linkedInHeaders(accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner: organizationUrn } }),
  });
  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => "");
    throw new Error(`[linkedin] Image upload init failed (${initRes.status}): ${errText.slice(0, 200)}`);
  }
  const initData = await initRes.json();
  const uploadUrl = initData?.value?.uploadUrl;
  const imageUrn = initData?.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error("[linkedin] Image upload init returned no upload URL");

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error("[linkedin] Couldn't fetch the creative image to upload");
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: new Uint8Array(buffer),
  });
  if (!putRes.ok) throw new Error(`[linkedin] Image byte upload failed (${putRes.status})`);

  return imageUrn;
}

export async function launchLinkedInCampaign(
  creds: LinkedInCreds,
  accessToken: string,
  input: LinkedInLaunchInput
): Promise<LinkedInLaunchResult> {
  const accountUrn = `urn:li:sponsoredAccount:${creds.adAccountId}`;
  const organizationUrn = `urn:li:organization:${creds.organizationId}`;

  // Step 1: the image asset, owned by the company page.
  const imageUrn = await uploadImage(accessToken, organizationUrn, input.imageUrl);

  // Step 2: campaign group — LinkedIn has this extra layer above
  // campaigns that the other three platforms don't.
  const campaignGroupId = await linkedInPost("/adCampaignGroups", accessToken, {
    account: accountUrn,
    name: input.campaignName.slice(0, 100),
    status: "DRAFT",
  });

  // Step 3: campaign — PAUSED, no spend starts here. LinkedIn wants
  // budgets in whole currency units with an explicit currency code,
  // not micros like the other three.
  const campaignId = await linkedInPost("/adCampaigns", accessToken, {
    account: accountUrn,
    campaignGroup: `urn:li:sponsoredCampaignGroup:${campaignGroupId}`,
    name: input.campaignName.slice(0, 100),
    type: "SPONSORED_UPDATES",
    costType: "CPC",
    status: "PAUSED",
    dailyBudget: { amount: String(input.dailyBudgetInr), currencyCode: "INR" },
    locale: { country: "IN", language: "en" },
    // Targeting is required; country-level India is the honest
    // default — anything narrower would be guessing at an audience
    // the business never specified.
    targetingCriteria: {
      include: { and: [{ or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:102713980"] } }] },
    },
    offsiteDeliveryEnabled: false,
  });

  // Step 4: the creative, referencing the uploaded image and the
  // organization that owns it.
  const creativeId = await linkedInPost("/creatives", accessToken, {
    campaign: `urn:li:sponsoredCampaign:${campaignId}`,
    inlineContent: {
      post: {
        author: organizationUrn,
        commentary: input.bodyCopy.slice(0, 600),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED" },
        content: {
          media: { id: imageUrn, title: input.headline.slice(0, 200), landingPage: input.destinationUrl },
        },
        lifecycleState: "PUBLISHED",
      },
    },
    intendedStatus: "PAUSED",
  });

  return { campaignGroupId, campaignId, creativeId };
}

// The real spend trigger — called only after the same approval gating
// every other platform goes through (P0 10b). LinkedIn's active state
// is ACTIVE, matching this app's own vocabulary.
export async function setLinkedInCampaignStatus(
  accessToken: string,
  campaignId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<void> {
  const res = await fetch(`${API_BASE}/adCampaigns/${campaignId}`, {
    method: "POST",
    headers: { ...linkedInHeaders(accessToken), "X-RestLi-Method": "PARTIAL_UPDATE" },
    body: JSON.stringify({ patch: { $set: { status } } }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`[linkedin] Couldn't update campaign status (${res.status}): ${errText.slice(0, 200)}`);
  }
}
