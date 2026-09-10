// The token for Meta's Marketing API: the USER token when one is stored,
// the Page token otherwise.
//
// WHY: every Meta call used the Page token, the only Meta credential
// kept. It creates campaigns and switches them on and off, and reads
// the ad itself — but it cannot read an ad account's objects (the connect
// callback says so). Reading a campaign's or ad set's status with it gets
// "(#100) Missing Ads or Marketing Messages permission". That is what the
// Analytics Status column showed, and it is what the three-level status
// check (readCampaignState) needs. The long-lived user token carries
// ads_read / ads_management.
//
// ONE PLACE decides the token, so the Status column, activation,
// pause, the dashboard toggle and the daily snapshot can never present
// different credentials to Meta for the same business
// (metaAdsToken.test.ts asserts it).

import { readMetaPageToken, readMetaUserToken, META_PAGE_TOKEN_SELECT, META_USER_TOKEN_SELECT } from "@/lib/crypto/oauthSecrets";
import { metaLog } from "@/lib/ads/metaLog";

export type AdsToken = { token: string; kind: "user" | "page" };

/**
 * @param pageRow a dealerships row already loaded with the Page token columns, if the caller has one
 */
export async function loadMetaAdsToken(
  supabase: any,
  dealershipId: string,
  pageRow?: Record<string, any> | null
): Promise<AdsToken | null> {
  // A SEPARATE, best-effort query. The user-token columns come from
  // migration 177, and a column production lacks must never turn into
  // "Facebook isn't connected" — the Page token still works for most
  // of what it did before.
  try {
    const { data, error } = await supabase.from("dealerships").select(META_USER_TOKEN_SELECT).eq("id", dealershipId).maybeSingle();
    if (error) {
      metaLog("token.user_unavailable", { dealership: dealershipId, detail: error.message });
    } else {
      const user = data ? readMetaUserToken(data) : null;
      if (user) return { token: user, kind: "user" };
    }
  } catch (err: any) {
    metaLog("token.user_unavailable", { dealership: dealershipId, detail: err?.message ?? String(err) });
  }

  let row = pageRow;
  if (row === undefined) {
    const { data } = await supabase.from("dealerships").select(META_PAGE_TOKEN_SELECT).eq("id", dealershipId).maybeSingle();
    row = data;
  }
  const page = readMetaPageToken(row);
  return page ? { token: page, kind: "page" } : null;
}

/** Just the token, for call sites that only need the string. */
export async function adsTokenFor(supabase: any, dealershipId: string, pageRow?: Record<string, any> | null): Promise<string | null> {
  return (await loadMetaAdsToken(supabase, dealershipId, pageRow))?.token ?? null;
}
