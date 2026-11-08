// What Google Maps says this business is called, where it is, and its
// number — read once a month for the G5 comparison.
//
// SEPARATE FROM findPlaceCandidates.ts, which does a TEXT SEARCH when
// the owner connects reviews: different endpoint, different field mask,
// different SKU, different question. That one asks "which listings match
// this name"; this one asks "what does THIS listing say". Folding them
// together would mean one field mask serving two questions, and the mask
// is what Google bills on.
//
// THE MASK IS THREE FIELDS AND NO MORE:
//
//   displayName          what Maps calls the business
//   formattedAddress     where Maps says it is
//   nationalPhoneNumber  the number Maps gives a caller
//
// THE PHONE IS THE EXPENSIVE ONE, knowingly. It puts the request on the
// Place Details ENTERPRISE SKU, and billing is at the highest SKU in the
// request, so it prices the whole call. Enterprise is free for the first
// 1,000 requests a month and $20 per 1,000 after — at one request per
// business per month that is nothing until a thousand businesses. The
// founder took that trade on 8 November 2026 because the phone is what
// local search compares hardest.
//
// NOTHING ELSE GOES IN THE MASK. No rating, no reviews, no location, no
// opening hours. Each addition is money, and a field nothing compares is
// a field somebody later finds a use for.
//
// NOTE ON THE MASK FORMAT: Place Details uses BARE field names
// (`displayName`), while Text Search needs them prefixed
// (`places.displayName`). The mask is mandatory on both — omitting it is
// an error, not a default.

export type PlaceDetails = {
  placeId: string;
  /** What Maps calls it. Null when Maps has no name, not "unknown". */
  name: string | null;
  address: string | null;
  phone: string | null;
};

export type PlaceDetailsResult =
  | { ok: true; details: PlaceDetails }
  | { ok: false; reason: string };

/** The three fields, in one place, so the cost of this call is readable. */
export const PLACE_DETAIL_FIELDS = ["displayName", "formattedAddress", "nationalPhoneNumber"] as const;

function text(value: unknown): string | null {
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/**
 * Read one listing.
 *
 * NEVER THROWS, and never returns a partial success. A failed read must
 * leave the previous snapshot alone rather than overwrite it with
 * nulls — "Maps has no address for you" and "we could not ask Maps" are
 * different facts, and only one of them is the owner's problem. That is
 * the same rule daysSinceChange follows for an unreadable date.
 */
export async function fetchPlaceDetails(
  placeId: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<PlaceDetailsResult> {
  const id = String(placeId ?? "").trim();
  if (!id) return { ok: false, reason: "no Google listing is connected" };

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { ok: false, reason: "Google Places is not configured on this server." };

  try {
    const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        // Mandatory. There is no default set of fields, and the mask is
        // what the request is billed on.
        "X-Goog-FieldMask": PLACE_DETAIL_FIELDS.join(","),
      },
    });

    if (!res.ok) return { ok: false, reason: `Google Places returned ${res.status}.` };
    const data = await res.json();

    return {
      ok: true,
      details: {
        placeId: id,
        // displayName is an object with a `text`, unlike the other two.
        name: text(data?.displayName?.text),
        address: text(data?.formattedAddress),
        phone: text(data?.nationalPhoneNumber),
      },
    };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "Couldn't reach Google Places." };
  }
}
