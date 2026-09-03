// A3 — the dealer never types a Place ID.
//
// It used to be a text box next to a link to Google's Place ID Finder,
// where you search your business, copy a 27-character `ChIJ...` string
// and paste it back. We already store the business name and city, so
// the search can just be run for them and the result offered as a list
// they click.
//
// Text Search, not Find Place: Find Place returns a single best guess,
// and a wrong single guess is the worst outcome here — it would point
// the reputation agent at some other business's reviews and look
// entirely successful doing it. A list makes the dealer confirm.

export type PlaceCandidate = {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
};

export type PlaceSearchResult =
  | { ok: true; candidates: PlaceCandidate[] }
  | { ok: false; reason: string };

/** The query Google gets. Exported so its shape is testable without a network call. */
export function buildPlaceQuery(name: string | null | undefined, city: string | null | undefined): string | null {
  const parts = [name, city].map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean);
  // Name alone is workable; city alone is not — "Mumbai" would return
  // a list of arbitrary Mumbai businesses for the dealer to pick from,
  // which invites exactly the wrong confirmation.
  if (!name || !name.trim()) return null;
  return parts.join(", ");
}

export async function findPlaceCandidates(
  name: string | null | undefined,
  city: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<PlaceSearchResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { ok: false, reason: "Google Places is not configured on this server." };

  const query = buildPlaceQuery(name, city);
  if (!query) {
    return { ok: false, reason: "Add your business name in Settings first, then search again." };
  }

  try {
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // Field-masked deliberately: Places (New) bills by the fields
        // requested, and asking for reviews here would charge the
        // Enterprise tier on every keystroke-free search.
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
    });

    if (!res.ok) return { ok: false, reason: `Google Places returned ${res.status}.` };
    const data = await res.json();

    const candidates: PlaceCandidate[] = (data?.places ?? [])
      .filter((p: any) => p?.id)
      .map((p: any) => ({
        placeId: p.id,
        name: p.displayName?.text ?? "(unnamed)",
        address: p.formattedAddress ?? "",
        rating: typeof p.rating === "number" ? p.rating : null,
        reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      }));

    return { ok: true, candidates };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "Couldn't reach Google Places." };
  }
}
