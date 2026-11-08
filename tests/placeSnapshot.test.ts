// The Maps leg's expensive half: one Place Details read a month.
//
// What matters here is not the comparison (tests/localPresence.test.ts
// has that) but WHEN Google is called and what is stored when it
// answers badly. Every assertion below is about not spending money and
// not overwriting a good snapshot with a bad one.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runPlaceSnapshot } from "@/lib/seo/placeSnapshot";
import { fetchPlaceDetails, PLACE_DETAIL_FIELDS } from "@/lib/google/placeDetails";
import { GROUPS, ALL } from "@/lib/automation/cronGroups";
import { code, sourceWithComments, sql } from "./helpers/source";

const FIRST = new Date("2026-12-01T06:00:00Z");
const NOT_FIRST = new Date("2026-12-14T06:00:00Z");

function db(over: any = {}) {
  const written: any[] = [];
  return {
    written,
    from(table: string) {
      if (table === "dealerships") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => over.dealership ?? { data: { google_place_id: "place-1" }, error: null },
            }),
          }),
        };
      }
      if (table === "place_snapshots") {
        return {
          upsert: async (row: any, opts: any) => {
            written.push({ row, opts });
            return over.writeError ? { error: { message: over.writeError } } : { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

function googleSays(body: any, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, json: async () => body })) as any;
}

beforeEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
});
afterEach(() => {
  delete process.env.GOOGLE_PLACES_API_KEY;
});

describe("1. THE FIELD MASK IS THE BILL", () => {
  it("THREE FIELDS, AND NOT ONE MORE", () => {
    // Places bills by the fields requested, at the HIGHEST SKU in the
    // request. Each addition is money, and a field nothing compares is a
    // field somebody later finds a use for.
    expect([...PLACE_DETAIL_FIELDS]).toEqual(["displayName", "formattedAddress", "nationalPhoneNumber"]);
  });

  it("NO RATING, NO REVIEWS, NO LOCATION, NO OPENING HOURS", () => {
    const src = code("src/lib/google/placeDetails.ts");
    for (const field of ["rating", "userRatingCount", "reviews", "location", "regularOpeningHours", "websiteUri", "photos"]) {
      expect(src.includes(field), `"${field}" must not be in this request`).toBe(false);
    }
  });

  it("THE MASK IS SENT, because omitting it is an error and not a default", async () => {
    const fetcher = googleSays({ displayName: { text: "A Business" }, formattedAddress: "12 A Street", nationalPhoneNumber: "090000 00000" });
    await fetchPlaceDetails("place-1", fetcher);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://places.googleapis.com/v1/places/place-1");
    expect(init.headers["X-Goog-FieldMask"]).toBe("displayName,formattedAddress,nationalPhoneNumber");
    expect(init.headers["X-Goog-Api-Key"]).toBe("test-key");
  });

  it("THE MASK IS UNPREFIXED, unlike the text-search one", () => {
    // Place Details takes bare field names; Text Search needs
    // "places.displayName". Getting this wrong is a runtime error nobody
    // would see until a real business connected a listing.
    const src = code("src/lib/google/placeDetails.ts");
    expect(src).not.toMatch(/places\.displayName/);
    const search = code("src/lib/google/findPlaceCandidates.ts");
    expect(search).toMatch(/places\.displayName/);
  });

  it("the place id is escaped into the path", async () => {
    const fetcher = googleSays({ displayName: { text: "A Business" } });
    await fetchPlaceDetails("a b/c", fetcher);
    expect(String(fetcher.mock.calls[0][0])).toContain("a%20b%2Fc");
  });
});

describe("2. READING THE LISTING, AND FAILING HONESTLY", () => {
  it("displayName comes out of its wrapper object", async () => {
    const r = await fetchPlaceDetails("p1", googleSays({ displayName: { text: "A Business" }, formattedAddress: "12 A Street", nationalPhoneNumber: "090000 00000" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.details.name).toBe("A Business");
      expect(r.details.address).toBe("12 A Street");
      expect(r.details.phone).toBe("090000 00000");
      expect(r.details.placeId).toBe("p1");
    }
  });

  it("A FIELD MAPS DOES NOT HAVE IS NULL, not an empty string", async () => {
    // "Maps has no phone for you" must stay distinguishable from "Maps
    // has a different phone", because only one is a conflict.
    const r = await fetchPlaceDetails("p1", googleSays({ displayName: { text: "A Business" } }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.details.address).toBeNull();
      expect(r.details.phone).toBeNull();
    }
  });

  it("NO LISTING ID MEANS NO CALL", async () => {
    const fetcher = googleSays({});
    for (const id of [null, "", "   "]) {
      const r = await fetchPlaceDetails(id, fetcher);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/no Google listing/i);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("NO API KEY MEANS NO CALL", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const fetcher = googleSays({});
    const r = await fetchPlaceDetails("p1", fetcher);
    expect(r.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("A NON-OK RESPONSE IS A FAILURE, not an empty listing", async () => {
    const r = await fetchPlaceDetails("p1", googleSays({}, false, 404));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("404");
  });

  it("AND A THROWN ERROR IS CAUGHT, never propagated", async () => {
    const r = await fetchPlaceDetails("p1", (async () => {
      throw new Error("network down");
    }) as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("network down");
  });
});

describe("3. MONTHLY, AND ONLY FOR A BUSINESS WITH A LISTING", () => {
  it("RUNS ON THE FIRST", async () => {
    const client = db();
    const run = await runPlaceSnapshot(client, "d1", {
      now: FIRST,
      fetcher: googleSays({ displayName: { text: "A Business" }, formattedAddress: "12 A Street", nationalPhoneNumber: "090000 00000" }),
    });
    expect(run.fetched).toBe(true);
    expect(run.skipped).toBeNull();
    expect(client.written).toHaveLength(1);
  });

  it("AND ON NO OTHER DAY, WITHOUT CALLING GOOGLE", async () => {
    const fetcher = googleSays({});
    const client = db();
    const run = await runPlaceSnapshot(client, "d1", { now: NOT_FIRST, fetcher });
    expect(run.fetched).toBe(false);
    expect(run.skipped).toMatch(/first of the month/i);
    expect(fetcher).not.toHaveBeenCalled();
    expect(client.written).toHaveLength(0);
  });

  it("NO CONNECTED LISTING MEANS NO CALL AND NO BILL", async () => {
    // The common case, and the reason this subsystem needs no flag.
    const fetcher = googleSays({});
    const client = db({ dealership: { data: { google_place_id: null }, error: null } });
    const run = await runPlaceSnapshot(client, "d1", { now: FIRST, fetcher });
    expect(run.fetched).toBe(false);
    expect(run.skipped).toMatch(/no Google listing/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("the day it decides about is India-local, not UTC", async () => {
    const run = await runPlaceSnapshot(db(), "d1", {
      now: new Date("2026-11-30T19:00:00Z"),
      fetcher: googleSays({ displayName: { text: "A Business" } }),
    });
    expect(run.day).toBe("2026-12-01");
    expect(run.fetched).toBe(true);
  });

  it("a failed read of the business calls nothing", async () => {
    const fetcher = googleSays({});
    const run = await runPlaceSnapshot(db({ dealership: { data: null, error: { message: "boom" } } }), "d1", { now: FIRST, fetcher });
    expect(run.fetched).toBe(false);
    expect(run.skipped).toMatch(/boom/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("4. A FAILED READ LEAVES THE PREVIOUS SNAPSHOT ALONE", () => {
  it("GOOGLE FAILING WRITES NOTHING", async () => {
    // Overwriting with nulls would turn "we could not ask Google this
    // month" into "Google has no address for you", and the daily
    // comparison would report a disagreement that does not exist.
    const client = db();
    const run = await runPlaceSnapshot(client, "d1", { now: FIRST, fetcher: googleSays({}, false, 500) });
    expect(run.fetched).toBe(false);
    expect(client.written).toHaveLength(0);
  });

  it("A FAILED WRITE IS NOT REPORTED AS A FETCH", async () => {
    const run = await runPlaceSnapshot(db({ writeError: "no room" }), "d1", {
      now: FIRST,
      fetcher: googleSays({ displayName: { text: "A Business" } }),
    });
    expect(run.fetched).toBe(false);
    expect(run.skipped).toMatch(/could not store/i);
  });

  it("THE CONFLICT TARGET IS THE PRIMARY KEY, which exists", async () => {
    // The I5 lesson: an onConflict naming columns with no unique index
    // behind them fails at runtime, and no test catches it. Migration
    // 225 makes dealership_id the primary key, so this target is real.
    const client = db();
    await runPlaceSnapshot(client, "d1", { now: FIRST, fetcher: googleSays({ displayName: { text: "A Business" } }) });
    expect(client.written[0].opts).toEqual({ onConflict: "dealership_id" });
    const migration = sql("supabase/migrations/225_place_snapshots.sql");
    expect(migration).toMatch(/dealership_id uuid primary key/);
  });

  it("the listing the values came from is stored beside them", async () => {
    // So a snapshot of a PREVIOUS listing is recognisable after the
    // owner reconnects, rather than silently compared.
    const client = db();
    await runPlaceSnapshot(client, "d1", { now: FIRST, fetcher: googleSays({ displayName: { text: "A Business" } }) });
    expect(client.written[0].row.place_id).toBe("place-1");
    expect(client.written[0].row.dealership_id).toBe("d1");
    expect(String(client.written[0].row.fetched_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("5. WHERE IT RUNS, AND WHY NOT IN signals", () => {
  it("IT IS IN heavy AND NOT IN signals", () => {
    // cronGroups' own rule: signals is "database-only and fast", and
    // this is a third-party network call. In signals it would sit in
    // front of the export email.
    expect(GROUPS.heavy).toContain("place_snapshot");
    expect(GROUPS.signals).not.toContain("place_snapshot");
  });

  it("IT RUNS BEFORE daily_autopilot, or it would never run at all", () => {
    expect(GROUPS.heavy.indexOf("place_snapshot")).toBeLessThan(GROUPS.heavy.indexOf("daily_autopilot"));
    expect(GROUPS.heavy[GROUPS.heavy.length - 1]).toBe("daily_autopilot");
  });

  it("AND THE COMPARISON IS NOT IN heavy — it is free and daily", () => {
    // The whole point of storing a snapshot: the slow half writes
    // monthly, the fast half reads every day. site_audit is in signals.
    expect(GROUPS.signals).toContain("site_audit");
    expect(GROUPS.heavy).not.toContain("site_audit");
    const comparison = code("src/lib/seo/localPresence.ts");
    expect(comparison).not.toMatch(/fetchPlaceDetails|places\.googleapis/);
  });

  it("it is registered exactly once, with a runner", async () => {
    expect(ALL.filter((k) => k === "place_snapshot")).toHaveLength(1);
    const { DAILY_RUNNERS } = await import("@/lib/automation/dailyRunners");
    expect(typeof DAILY_RUNNERS.place_snapshot).toBe("function");
  });

  it("WHY IT IS NOT FLAGGED IS WRITTEN DOWN", () => {
    // page_speed and aeo_schedule are both behind flags. A reader who
    // notices this one is not should find the reason, not a gap.
    const src = sourceWithComments("src/lib/seo/placeSnapshot.ts");
    expect(src).toMatch(/NOT BEHIND A FLAG/);
    expect(src).toMatch(/1,000 requests/);
  });
});

describe("6. THE MIGRATION SAYS WHAT IT COSTS AND WHO MAY WRITE IT", () => {
  it("NO CLIENT WRITE POLICY, because these are Google's words", () => {
    // A client that could write them could make the site and the listing
    // "agree" without either changing.
    const migration = sql("supabase/migrations/225_place_snapshots.sql");
    expect(migration).toMatch(/for select using/);
    expect(migration).not.toMatch(/for insert|for update|for delete/);
    expect(migration).toMatch(/enable row level security/);
  });

  it("ONE ROW PER BUSINESS, not a history", () => {
    const migration = sql("supabase/migrations/225_place_snapshots.sql");
    expect(migration).toMatch(/dealership_id uuid primary key/);
  });

  it("AND THE ENTERPRISE SKU DECISION IS RECORDED IN THE FILE", () => {
    // sourceWithComments on purpose: the cost reasoning IS the comment,
    // and rule 8 says to make that choice visible.
    const withComments = sourceWithComments("supabase/migrations/225_place_snapshots.sql");
    expect(withComments).toMatch(/ENTERPRISE SKU/);
    // Whitespace-tolerant: the cost sentence wraps across comment lines,
    // and a regex that assumed one line failed against a file that says
    // exactly the right thing. The same shape as the I6 assertion that
    // spanned a comment code() had stripped.
    expect(withComments.replace(/\s*--\s*/g, " ")).toMatch(/first 1,000\s+requests a month/);
    expect(withComments).toMatch(/\$20 per 1,000/);
  });

  it("no geo, rating or review column was added", () => {
    const migration = sql("supabase/migrations/225_place_snapshots.sql");
    for (const column of ["latitude", "longitude", "geo", "rating", "review"]) {
      expect(migration.includes(column), `"${column}" is not compared and must not be stored`).toBe(false);
    }
  });
});
