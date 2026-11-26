// A REFUSED page_events INSERT MUST NOT BE SILENT — 26 November 2026.
//
// `select count(*), count(path) from page_events` read 163 rows and 0
// with a path. The first question is whether the column is missing in
// production or whether no visit has happened since it was added, and
// NOTHING THIS ROUTE PRODUCED COULD ANSWER IT: the insert's result was
// never captured, so a refusal and a success looked identical from
// outside.
//
// That matters more than a missing log line, because PostgREST refuses
// the WHOLE row when one column is unknown. A migration committed and
// never run therefore means every page event silently dropped — the
// usage-log bug's exact shape, which recorded almost nothing for ninety
// days behind a missing policy and an unchecked error.
//
// THE RULE THAT IS NOT BEING TRADED AWAY: tracking must never break the
// page. The route still answers ok. These tests hold both halves at
// once, because a "fix" that started failing visitor requests would be
// worse than the silence it replaced.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { code } from "./helpers/source";

let insertError: { code?: string; message: string } | null;
let inserted: any[];

function db() {
  const from = (_table: string) => {
    const filters: [string, any][] = [];
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      limit: () => api,
      maybeSingle: async () => {
        // Only `websites` is asked for a single row here, and it is the
        // one lookup that has to succeed for the insert to be reached.
        const slug = filters.find(([k]) => k === "slug");
        if (slug) return { data: { slug: slug[1], dealership_id: "d1", published: true }, error: null };
        return { data: null, error: null };
      },
      insert: async (row: any) => {
        inserted.push(row);
        return insertError ? { data: null, error: insertError } : { data: row, error: null };
      },
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => { throw new Error("no session"); } }));
vi.mock("@/lib/attribution/pieces", () => ({ ownedPieceId: async () => null }));
vi.mock("@/lib/publicSite", () => ({
  resolvePublicSite: async (_s: any, slug: string) => ({ dealershipId: "d1", slug }),
}));

import { POST } from "@/app/api/public/track/route";

const call = (body: any) =>
  POST(new Request("https://hawlai.online/api/public/track", { method: "POST", body: JSON.stringify(body) }));

let errors: string[];
let spy: any;

beforeEach(() => {
  inserted = [];
  insertError = null;
  errors = [];
  spy = vi.spyOn(console, "error").mockImplementation((...args: any[]) => {
    errors.push(args.map((a) => String(a)).join(" "));
  });
});

afterEach(() => spy.mockRestore());

describe("1. A COLUMN PRODUCTION DOES NOT HAVE IS SAID OUT LOUD", () => {
  it("THE MISSING-COLUMN REFUSAL IS LOGGED, with its code and its message", async () => {
    insertError = { code: "PGRST204", message: "Could not find the 'path' column of 'page_events'" };
    await call({ slug: "candle-by-qaaf", eventType: "view", path: "/site/candle-by-qaaf" });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("page_events");
    expect(errors[0]).toContain("PGRST204");
    expect(errors[0]).toContain("path");
  });

  it("AND SO IS THE POSTGRES FORM OF THE SAME FAULT", async () => {
    insertError = { code: "42703", message: 'column "path" of relation "page_events" does not exist' };
    await call({ slug: "candle-by-qaaf", eventType: "view", path: "/a" });
    expect(errors[0]).toContain("42703");
  });

  it("a refusal with no code still says something rather than nothing", async () => {
    insertError = { message: "connection reset" };
    await call({ slug: "candle-by-qaaf", eventType: "view", path: "/a" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("connection reset");
  });
});

describe("2. AND THE PAGE IS STILL NOT BROKEN BY IT", () => {
  it("THE VISITOR'S REQUEST STILL SUCCEEDS — the older rule wins", async () => {
    insertError = { code: "PGRST204", message: "Could not find the 'path' column of 'page_events'" };
    const res = await call({ slug: "candle-by-qaaf", eventType: "view", path: "/a" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("and a successful insert logs NOTHING, so the line means something when it appears", async () => {
    await call({ slug: "candle-by-qaaf", eventType: "view", path: "/site/candle-by-qaaf/products/1" });
    expect(errors).toEqual([]);
    expect(inserted).toHaveLength(1);
  });
});

describe("3. THE PATH THE CLIENT SENDS IS THE PATH THAT REACHES THE ROW", () => {
  // The question that started this: with the chain working, a real page
  // view MUST produce a non-null path. If this test ever goes red,
  // `with_a_path` staying at 0 is a code fault rather than an absence of
  // traffic.
  it("A REAL PAGE VIEW WRITES A PATH, not a null", async () => {
    await call({ slug: "candle-by-qaaf", eventType: "view", path: "/site/candle-by-qaaf/products/soy" });
    expect(inserted[0].path).toBe("/site/candle-by-qaaf/products/soy");
  });

  it("and the query string is still stripped on the way through", async () => {
    await call({ slug: "candle-by-qaaf", eventType: "view", path: "/site/a/thanks?email=x@y.com" });
    expect(inserted[0].path).toBe("/site/a/thanks");
  });

  it("A CLIENT THAT SENDS NO PATH WRITES NULL, which is 'we could not tell'", async () => {
    await call({ slug: "candle-by-qaaf", eventType: "view" });
    expect(inserted[0].path).toBeNull();
  });
});

describe("4. the guard is in the route and not only in this test", () => {
  it("THE INSERT'S RESULT IS CAPTURED rather than discarded", () => {
    const src = code("src/app/api/public/track/route.ts");
    const line = src.split("\n").find((l) => l.includes('from("page_events").insert('));
    expect(line).toBeDefined();
    // A bare `await supabase.from(...)` is the shape that lost the error.
    expect(line).toMatch(/const\s*\{\s*error/);
  });
});
