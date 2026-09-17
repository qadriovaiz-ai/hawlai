// How a business makes money — the signal every department branches on.
//
// APPROVED 2026-09-17 (industry-agnostic overhaul, Phase 0): a structured
// field (products / services / subscriptions / B2B, any combination) beside
// the free-text category. Before this, nothing reliably said what kind of
// business Hawlai was serving — and business_category defaulted to
// "car dealership" in the database and in the Settings field.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let updates: Row[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const finish = () => {
      if (op === "update") {
        updates.push(values);
        for (const r of rows()) Object.assign(r, values);
      }
      return { data: rows(), error: null };
    };
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      update: (v: Row) => ((op = "update"), (values = v), api),
      maybeSingle: async () => ({ data: finish().data[0] ?? null, error: null }),
      single: async () => ({ data: finish().data[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(finish()).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));

import { cleanBusinessModels, effectiveBusinessModels, describeBusinessModels } from "@/lib/business/businessModel";
import { PATCH as patchDealership } from "@/app/api/dealership/route";
import { gatherBusinessFacts, formatFactsForCopy } from "@/lib/claims/businessFacts";

beforeEach(() => {
  tables = {
    profiles: [{ id: "owner-1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "Glow Dental", business_category: "Dental clinic", business_models: [] }],
    products: [],
  };
  updates = [];
});

const patch = (body: Row) => patchDealership(new Request("https://hawlai.online/api/dealership", { method: "PATCH", body: JSON.stringify(body) }));

describe("the field", () => {
  it("keeps known models, in a fixed order, without duplicates", () => {
    expect(cleanBusinessModels(["b2b", "services", "services"])).toEqual(["services", "b2b"]);
    expect(cleanBusinessModels([])).toEqual([]);
  });

  it.each([[["retail"]], ["services"], [null], [[1]]])("rejects %j", (input) => {
    expect(cleanBusinessModels(input)).toBeNull();
  });

  it("uses what the owner said; otherwise guesses products from a catalogue, and says it's a guess", () => {
    expect(effectiveBusinessModels(["services"], { productCount: 12 })).toEqual({ models: ["services"], inferred: false });
    expect(effectiveBusinessModels([], { productCount: 3 })).toEqual({ models: ["products"], inferred: true });
    expect(effectiveBusinessModels(null, { productCount: 0 })).toEqual({ models: [], inferred: true });
  });

  it("describes itself in plain words", () => {
    expect(describeBusinessModels(["services", "b2b"])).toBe("services, business customers (b2b)");
    expect(describeBusinessModels([])).toBe("not set");
  });
});

describe("saving it", () => {
  it("is saved cleaned", async () => {
    const res = await patch({ business_models: ["b2b", "services"] });
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ business_models: ["services", "b2b"] }]);
  });

  it("an unknown model is refused and nothing is saved", async () => {
    const res = await patch({ business_models: ["car_dealership"] });
    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
  });

  it("other settings saved without it don't touch it", async () => {
    await patch({ business_address: "12 MG Road, Pune" });
    expect(updates).toEqual([{ business_address: "12 MG Road, Pune" }]);
  });
});

describe("every generator is told", () => {
  it("what the owner declared", async () => {
    tables.dealerships[0].business_models = ["services"];
    expect(formatFactsForCopy(await gatherBusinessFacts(db(), "d1"))).toContain("How the business makes money: services.");
  });

  it("a guess from the catalogue, flagged as a guess", async () => {
    tables.products = [{ id: "p1", name: "Whitening kit", price: 1500, is_active: true }];
    expect(formatFactsForCopy(await gatherBusinessFacts(db(), "d1"))).toContain("How the business makes money: products (guessed from its catalogue — not confirmed by the owner).");
  });

  it("nothing known: don't assume", async () => {
    expect(formatFactsForCopy(await gatherBusinessFacts(db(), "d1"))).toContain("How the business makes money: not set — don't assume");
  });
});

describe("no business is a car dealership by default any more", () => {
  it("the database default is dropped, and businesses with a catalogue are marked as selling products", () => {
    const sql = readFileSync(join(__dirname, "../supabase/migrations/186_business_models.sql"), "utf-8");
    expect(sql).toContain("alter table dealerships alter column business_category drop default;");
    expect(sql).toContain("set business_models = array['products']");
    expect(sql).toContain("check (business_models <@ array['products', 'services', 'subscription', 'b2b']::text[])");
  });

  it("the Settings field starts empty and doesn't suggest car dealership first", () => {
    const field = readFileSync(join(__dirname, "../src/components/settings/BusinessCategoryField.tsx"), "utf-8");
    expect(field).toContain('useState(initial ?? "")');
    expect(field).not.toContain('"Car Dealership"');
  });
});
