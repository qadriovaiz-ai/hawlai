// ------------------------------------------------------------------
// Google Ads client — P3 piece 6 (Advanced Integrations)
// ------------------------------------------------------------------
// OAuth + token storage already existed (migration 035, the
// /api/auth/google-ads/callback route) but were auth-only — nothing
// ever launched a campaign. This adds the real launch capability.
//
// Supports BOTH ad formats:
// - SEARCH: Responsive Search Ad, keyword-targeted, text only. High
//   intent, what SMBs usually want from Google. Needs keywords.
// - DISPLAY: Responsive Display Ad, image-based. Uses the same
//   uploaded-photo creative the Meta flow already produces, so the
//   two flows stay visually consistent for the dealer.
// They share campaign + ad-group + budget creation; only the ad object
// and the keyword step differ, so this is meaningfully less than 2x
// the work of one format.
//
// Everything is created PAUSED, exactly like the Meta path — nothing
// here starts spending. Activation is a separate, approval-gated
// action (/api/ads/[id]/status, P0 10b's gating reused unchanged).
//
// UNTESTED AGAINST A LIVE ACCOUNT: built against Google's documented
// v19 REST API (the version the existing callback already targets).
// No developer token or test account exists in this environment, and
// the callback itself notes the developer token may still be on Test
// Account Access. First real launch needs verification.
// ------------------------------------------------------------------

const API_VERSION = "v19";
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

export type GoogleAdFormat = "search" | "display";

export interface GoogleAdsCreds {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string | null;
  customerId: string;
}

// Same refresh shape as getValidYoutubeAccessToken — returns the
// refreshed pair so the caller can persist it, rather than writing to
// the DB from in here.
export async function getValidGoogleAdsAccessToken(creds: GoogleAdsCreds): Promise<{ accessToken: string; refreshed?: { accessToken: string; expiry: string } }> {
  const expiresAt = creds.tokenExpiry ? new Date(creds.tokenExpiry).getTime() : 0;
  if (expiresAt - Date.now() > 5 * 60 * 1000) return { accessToken: creds.accessToken };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: creds.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? data?.error ?? "Couldn't refresh Google Ads access — reconnect it in Integrations.");

  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
  return { accessToken: data.access_token, refreshed: { accessToken: data.access_token, expiry } };
}

async function googleAdsMutate(customerId: string, accessToken: string, resource: string, operations: any[]): Promise<string> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN isn't set — Google Ads launching can't work without it.");

  const res = await fetch(`${API_BASE}/customers/${customerId}/${resource}:mutate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": devToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operations }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    // Google nests the useful message deep; surface the most specific
    // one available rather than a generic "request failed".
    const detail = data?.error?.details?.[0]?.errors?.[0]?.message ?? data?.error?.message ?? `Google Ads API error (${res.status})`;
    throw new Error(`[${resource}] ${detail}`);
  }
  const resourceName = data?.results?.[0]?.resourceName;
  if (!resourceName) throw new Error(`[${resource}] Google Ads returned no resource name`);
  return resourceName;
}

export interface GoogleLaunchInput {
  format: GoogleAdFormat;
  campaignName: string;
  dailyBudgetInr: number;
  headline: string;
  bodyCopy: string;
  finalUrl: string;
  keywords?: string[]; // search only
  imageUrl?: string | null; // display only
  businessName: string;
}

export interface GoogleLaunchResult {
  campaignId: string;
  adGroupId: string;
  adId: string;
}

// Google bills in micros (1 unit = 1,000,000 micros).
const toMicros = (rupees: number) => Math.round(rupees * 1_000_000);

// Responsive Search Ads want 3+ headlines and 2+ descriptions. The AI
// gives us one strong headline + body, so the rest are derived rather
// than invented — Google rotates them, so weak filler would actively
// hurt performance.
function buildSearchHeadlines(headline: string, businessName: string): { text: string }[] {
  return [
    { text: headline.slice(0, 30) },
    { text: businessName.slice(0, 30) },
    { text: `${businessName} — Enquire Now`.slice(0, 30) },
  ];
}

export async function launchGoogleCampaign(
  creds: GoogleAdsCreds,
  accessToken: string,
  input: GoogleLaunchInput
): Promise<GoogleLaunchResult> {
  const { customerId } = creds;

  // Step 1: shared budget. Every campaign needs one; created
  // explicitly rather than reusing an existing budget so this
  // campaign's spend can never affect another one's.
  const budgetResource = await googleAdsMutate(customerId, accessToken, "campaignBudgets", [{
    create: {
      name: `${input.campaignName} budget ${Date.now()}`,
      amountMicros: String(toMicros(input.dailyBudgetInr)),
      deliveryMethod: "STANDARD",
      explicitlyShared: false,
    },
  }]);

  // Step 2: campaign — PAUSED, always. Nothing here starts spending.
  const campaignResource = await googleAdsMutate(customerId, accessToken, "campaigns", [{
    create: {
      name: `${input.campaignName} ${Date.now()}`,
      status: "PAUSED",
      advertisingChannelType: input.format === "search" ? "SEARCH" : "DISPLAY",
      campaignBudget: budgetResource,
      manualCpc: {},
      networkSettings: input.format === "search"
        ? { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false }
        : { targetGoogleSearch: false, targetSearchNetwork: false, targetContentNetwork: true },
    },
  }]);

  // Step 3: ad group.
  const adGroupResource = await googleAdsMutate(customerId, accessToken, "adGroups", [{
    create: {
      name: `${input.campaignName} ad group`,
      campaign: campaignResource,
      status: "ENABLED", // the PAUSED campaign above is what holds spend back
      type: input.format === "search" ? "SEARCH_STANDARD" : "DISPLAY_STANDARD",
      cpcBidMicros: String(toMicros(Math.max(1, Math.round(input.dailyBudgetInr / 20)))),
    },
  }]);

  // Step 4 (search only): keywords. Broad match — a narrower match
  // type on a small SMB budget usually means near-zero impressions.
  if (input.format === "search" && input.keywords && input.keywords.length > 0) {
    await googleAdsMutate(customerId, accessToken, "adGroupCriteria",
      input.keywords.slice(0, 20).map((kw) => ({
        create: { adGroup: adGroupResource, status: "ENABLED", keyword: { text: kw, matchType: "BROAD" } },
      }))
    );
  }

  // Step 5: the ad itself.
  const adResource = await googleAdsMutate(customerId, accessToken, "adGroupAds", [{
    create: {
      adGroup: adGroupResource,
      status: "ENABLED",
      ad: input.format === "search"
        ? {
            finalUrls: [input.finalUrl],
            responsiveSearchAd: {
              headlines: buildSearchHeadlines(input.headline, input.businessName),
              descriptions: [
                { text: input.bodyCopy.slice(0, 90) },
                { text: `Contact ${input.businessName} today.`.slice(0, 90) },
              ],
            },
          }
        : {
            finalUrls: [input.finalUrl],
            responsiveDisplayAd: {
              headlines: [{ text: input.headline.slice(0, 30) }],
              longHeadline: { text: input.headline.slice(0, 90) },
              descriptions: [{ text: input.bodyCopy.slice(0, 90) }],
              businessName: input.businessName.slice(0, 25),
              marketingImages: input.imageUrl ? [{ asset: input.imageUrl }] : [],
            },
          },
    },
  }]);

  return {
    campaignId: campaignResource.split("/").pop() ?? campaignResource,
    adGroupId: adGroupResource.split("/").pop() ?? adGroupResource,
    adId: adResource.split("/").pop() ?? adResource,
  };
}

// Activation/pause — the real spend trigger, called only after the
// same approval gating the Meta path uses (P0 10b).
export async function setGoogleCampaignStatus(
  creds: GoogleAdsCreds,
  accessToken: string,
  campaignId: string,
  status: "ENABLED" | "PAUSED"
): Promise<void> {
  await googleAdsMutate(creds.customerId, accessToken, "campaigns", [{
    update: { resourceName: `customers/${creds.customerId}/campaigns/${campaignId}`, status },
    updateMask: "status",
  }]);
}
