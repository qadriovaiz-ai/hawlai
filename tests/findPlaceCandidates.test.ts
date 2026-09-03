// A3 — the dealer never types a Place ID.
//
// The stored business name and city are searched against Google Places
// and the matches offered as a list. Tested with an injected fetch, so
// these run without a network call or an API key.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildPlaceQuery, findPlaceCandidates } from "@/lib/google/findPlaceCandidates";

describe("buildPlaceQuery", () => {
  it("combines name and city", () => {
    expect(buildPlaceQuery("Sharma Motors", "Pune")).toBe("Sharma Motors, Pune");
  });

  it("works with a name alone", () => {
    expect(buildPlaceQuery("Sharma Motors", null)).toBe("Sharma Motors");
    expect(buildPlaceQuery("Sharma Motors", "   ")).toBe("Sharma Motors");
  });

  it("refuses to search on city alone", () => {
    // "Pune" would return five arbitrary Pune businesses under a
    // heading asking "which one is you?" — an invitation to confirm
    // the wrong listing. No name means no search.
    expect(buildPlaceQuery(null, "Pune")).toBeNull();
    expect(buildPlaceQuery("", "Pune")).toBeNull();
    expect(buildPlaceQuery("   ", "Pune")).toBeNull();
  });
});

describe("findPlaceCandidates", () => {
  const OLD_KEY = process.env.GOOGLE_PLACES_API_KEY;
  beforeEach(() => { process.env.GOOGLE_PLACES_API_KEY = "test-key"; });
  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = OLD_KEY;
  });

  const okResponse = (body: unknown) =>
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }) as unknown as typeof fetch;

  it("maps Places results into candidates", async () => {
    const fetchImpl = okResponse({
      places: [
        {
          id: "ChIJabc",
          displayName: { text: "Sharma Motors" },
          formattedAddress: "FC Road, Pune",
          rating: 4.6,
          userRatingCount: 231,
        },
      ],
    });
    const result = await findPlaceCandidates("Sharma Motors", "Pune", fetchImpl);
    expect(result).toEqual({
      ok: true,
      candidates: [{ placeId: "ChIJabc", name: "Sharma Motors", address: "FC Road, Pune", rating: 4.6, reviewCount: 231 }],
    });
  });

  it("requests only the cheap field mask", async () => {
    // Places (New) bills by requested field, and the Enterprise tier
    // starts at `reviews`. Asking for it here would charge the top
    // rate on every search — the reviews come later, once per day,
    // from the reputation agent.
    const fetchImpl = okResponse({ places: [] });
    await findPlaceCandidates("Sharma Motors", "Pune", fetchImpl);
    const [, init] = (fetchImpl as any).mock.calls[0];
    const mask = init.headers["X-Goog-FieldMask"];
    expect(mask).not.toContain("reviews");
    expect(mask).toContain("places.id");
    expect(JSON.parse(init.body)).toMatchObject({ textQuery: "Sharma Motors, Pune" });
  });

  it("survives a listing with no rating yet", async () => {
    // A newly claimed business has no rating. null, not 0 — a 0 would
    // render as "0★" next to the name the dealer is about to confirm.
    const fetchImpl = okResponse({ places: [{ id: "ChIJnew", displayName: { text: "New Shop" } }] });
    const result = await findPlaceCandidates("New Shop", "Pune", fetchImpl);
    expect(result).toEqual({
      ok: true,
      candidates: [{ placeId: "ChIJnew", name: "New Shop", address: "", rating: null, reviewCount: null }],
    });
  });

  it("drops results with no place id", async () => {
    const fetchImpl = okResponse({ places: [{ displayName: { text: "Broken" } }, { id: "ChIJok", displayName: { text: "Fine" } }] });
    const result = await findPlaceCandidates("x", "y", fetchImpl);
    expect(result.ok && result.candidates.map((c) => c.placeId)).toEqual(["ChIJok"]);
  });

  it("reports an empty list rather than an error when Google finds nothing", async () => {
    // The UI distinguishes these: no matches tells the dealer to check
    // their name or claim their listing; a failure offers a retry.
    const fetchImpl = okResponse({});
    expect(await findPlaceCandidates("Nonexistent", "Nowhere", fetchImpl)).toEqual({ ok: true, candidates: [] });
  });

  it("reports a non-2xx as a failure, not as no matches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }) as unknown as typeof fetch;
    const result = await findPlaceCandidates("x", "y", fetchImpl);
    expect(result).toEqual({ ok: false, reason: "Google Places returned 403." });
  });

  it("reports a thrown network error instead of crashing the route", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    expect(await findPlaceCandidates("x", "y", fetchImpl)).toEqual({ ok: false, reason: "ECONNRESET" });
  });

  it("does not call Google when the business has no name stored", async () => {
    const fetchImpl = okResponse({ places: [] });
    const result = await findPlaceCandidates(null, "Pune", fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not call Google when the key is missing", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const fetchImpl = okResponse({ places: [] });
    const result = await findPlaceCandidates("Sharma Motors", "Pune", fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
