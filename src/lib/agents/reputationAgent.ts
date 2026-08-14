// ------------------------------------------------------------------
// Reputation/external review monitoring — master audit Part D2.
// ------------------------------------------------------------------
// Distinct from get_customer_sentiment (researchAgentV2.ts), which
// only analyzes this business's own internal lead notes. This pulls
// PUBLIC Google Business Profile data — rating, review count, a
// handful of recent review snippets — via the Places API (New) Place
// Details endpoint. No OAuth, no business-ownership verification
// needed since this is all public data, same trust model as the
// platform-wide PEXELS_API_KEY used for stock photos. Requires the
// dealer to paste their own Google Place ID (self-serve, no auth
// flow — same pattern as the Shopify/Website integration fields).
// ------------------------------------------------------------------

export interface GoogleReviewsSnapshotResult {
  fetched: boolean;
  reason?: string;
  rating?: number;
  reviewCount?: number;
}

// One row per dealership per day (unique on dealership_id+snapshot_date,
// migration 103) mirrors snapshotCampaignPerformance's idempotent
// daily-upsert shape in analyticsAgent.ts.
export async function fetchGoogleReviewsSnapshot(supabase: any, dealershipId: string): Promise<GoogleReviewsSnapshotResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { fetched: false, reason: "GOOGLE_PLACES_API_KEY not set" };

  const { data: dealership } = await supabase.from("dealerships").select("google_place_id").eq("id", dealershipId).maybeSingle();
  const placeId = dealership?.google_place_id;
  if (!placeId) return { fetched: false, reason: "No Google Place ID connected" };

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "rating,userRatingCount,reviews",
      },
    });
    if (!res.ok) return { fetched: false, reason: `Places API returned ${res.status}` };
    const place = await res.json();

    const recentReviews = (place.reviews ?? []).slice(0, 5).map((r: any) => ({
      rating: r.rating ?? null,
      text: r.text?.text ?? r.originalText?.text ?? "",
      relativeTime: r.relativePublishTimeDescription ?? null,
      authorName: r.authorAttribution?.displayName ?? null,
    }));

    const { error } = await supabase.from("google_reviews_snapshot").upsert(
      {
        dealership_id: dealershipId,
        snapshot_date: new Date().toISOString().slice(0, 10),
        rating: place.rating ?? null,
        review_count: place.userRatingCount ?? null,
        recent_reviews: recentReviews,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "dealership_id,snapshot_date" }
    );
    if (error) return { fetched: false, reason: error.message };

    return { fetched: true, rating: place.rating, reviewCount: place.userRatingCount };
  } catch (err: any) {
    return { fetched: false, reason: err.message ?? "Places API request failed" };
  }
}
