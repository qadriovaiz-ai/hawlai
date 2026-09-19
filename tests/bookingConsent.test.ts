// The booking page asks for tracking consent the same way the store does
// (2026-09-20). Its pixel (Retargeting R2) loads only after "Allow", and the
// choice is recorded server-side against the business — found by its
// BOOKING slug, a namespace of its own, never mixed with store slugs.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let upserted: Row | null = null;
  const api: any = {
    select: () => api,
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), api),
    upsert: (p: Row) => ((upserted = p), (tables[table] ??= []).push(p), api),
    maybeSingle: async () => ({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve({ data: upserted, error: null }).then(res, rej),
  };
  return api;
}
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: (t: string) => query(t) }) }));

import { POST } from "@/app/api/public/consent/route";

const consent = (body: Row) => POST(new Request("https://hawlai.test/api/public/consent", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  tables = {
    dealerships: [{ id: "salon", booking_slug: "glow" }, { id: "shop", booking_slug: "other" }],
    // Another business's STORE happens to use the same slug.
    websites: [{ dealership_id: "shop", slug: "glow", published: true }],
    landing_pages: [],
    visitor_consent: [],
  };
});

describe("consent from the booking page", () => {
  it("is recorded against the business that owns the booking page — not a store with the same slug", async () => {
    const res = await consent({ slug: "glow", status: "granted", visitorId: "v1", source: "booking" });
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    expect(tables.visitor_consent).toEqual([expect.objectContaining({ dealership_id: "salon", visitor_id: "v1", status: "granted", scope: "analytics_and_ads" })]);
  });

  it("a store's consent still resolves by store slug, as before", async () => {
    await consent({ slug: "glow", status: "denied", visitorId: "v2" });
    expect(tables.visitor_consent[0]).toMatchObject({ dealership_id: "shop", status: "denied" });
  });

  it("an unknown booking slug records nothing — and never falls back to a store", async () => {
    const res = await consent({ slug: "nobody", status: "granted", visitorId: "v3", source: "booking" });
    expect(await res.json()).toEqual({ ok: true });
    tables.dealerships = [];
    await consent({ slug: "glow", status: "granted", visitorId: "v4", source: "booking" });
    expect(tables.visitor_consent).toEqual([]);
  });
});

describe("the booking page", () => {
  const page = readFileSync("src/app/book/[slug]/page.tsx", "utf8").replace(/\r\n/g, "\n");

  it("shows the store's banner, saying it's the booking page, while the form is up", () => {
    expect(page).toContain('<ConsentBanner slug={slug} businessName={dealershipName} source="booking" />');
    // Only once — in the form, not on the "You're booked!" screen (allowing reloads the page).
    expect(page.split("<ConsentBanner").length - 1).toBe(1);
    const done = page.slice(page.indexOf("if (done) {"), page.indexOf("return (\n    <div className=\"min-h-screen bg-slate-50 px-4 py-10\">"));
    expect(done).not.toContain("ConsentBanner");
  });

  it("the banner sends which kind of slug it has", () => {
    const banner = readFileSync("src/components/website/ConsentBanner.tsx", "utf8");
    expect(banner.match(/recordConsentServerSide\(slug, status, (visitorId|existingId), source\)/g)).toHaveLength(2);
    const lib = readFileSync("src/lib/consent.ts", "utf8");
    expect(lib).toContain("body: JSON.stringify({ slug, status, visitorId, source }),");
  });
});
