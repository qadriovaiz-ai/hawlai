// ------------------------------------------------------------------
// Research Agent — Phase 2 basic version
// ------------------------------------------------------------------
// Uses Meta's public Ad Library API to show what competitor
// dealerships are currently running as ads — no separate API keys
// needed, it reuses whatever Facebook token the dealer already
// connected. Costs nothing since Meta doesn't charge for Ad Library
// reads.
// ------------------------------------------------------------------

const GRAPH_VERSION = "v23.0";

export interface CompetitorAd {
  page_name: string;
  body: string | null;
  title: string | null;
  started_running: string | null;
  is_active: boolean;
}

export async function searchCompetitorAds(
  token: string,
  query: string
): Promise<{ ads: CompetitorAd[]; error?: string }> {
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/ads_archive`);
    url.searchParams.set("search_terms", query);
    url.searchParams.set("ad_reached_countries", JSON.stringify(["IN"]));
    url.searchParams.set("ad_active_status", "ALL");
    url.searchParams.set(
      "fields",
      "page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time"
    );
    url.searchParams.set("limit", "15");
    url.searchParams.set("access_token", token);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok || data.error) {
      return { ads: [], error: data.error?.message ?? "Meta Ad Library request failed" };
    }

    const ads: CompetitorAd[] = (data.data ?? []).map((item: any) => ({
      page_name: item.page_name ?? "Unknown",
      body: item.ad_creative_bodies?.[0] ?? null,
      title: item.ad_creative_link_titles?.[0] ?? null,
      started_running: item.ad_delivery_start_time ?? null,
      is_active: !item.ad_delivery_stop_time,
    }));

    return { ads };
  } catch (err: any) {
    console.error("[research-agent] searchCompetitorAds error:", err.message);
    return { ads: [], error: err.message };
  }
}
