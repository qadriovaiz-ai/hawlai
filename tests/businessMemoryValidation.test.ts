// Editing a memory's category returned a 500.
//
// POST validated the category against a list and fell back to "general".
// PATCH had no list: whatever arrived went straight into the update, hit
// business_memory_category_check, and came back as a 500 carrying a raw
// Postgres message. The owner was shown a server fault for what is a
// validation problem, with nothing telling them which values are
// allowed.
//
// The allowed values here were read from the LIVE database
// (pg_get_constraintdef, 2026-10-03), not from the repo's migrations —
// prod has drifted from them before, and a list that disagrees with the
// CHECK promises a value the write then rejects.
//
// These run the real route handlers against a fake database that
// enforces the real constraint.

import { describe, it, expect, vi, beforeEach } from "vitest";

const LIVE_CATEGORIES = ["campaign_performance", "audience_insight", "content_preference", "timing", "general"];

let rows: any[] = [];
let lastUpdate: any = null;

/** A fake that refuses what the live CHECK refuses, and nothing else. */
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from(table: string) {
      const filters: Record<string, any> = {};
      const chain: any = {
        select: () => chain,
        order: async () => ({ data: rows }),
        eq(column: string, value: any) {
          filters[column] = value;
          return chain;
        },
        async single() {
          if (table === "profiles") return { data: { dealership_id: "d1" } };
          return { data: rows[0] ?? null, error: null };
        },
        insert(values: any) {
          if (values.category && !LIVE_CATEGORIES.includes(values.category)) {
            return { select: () => ({ single: async () => ({ data: null, error: { message: 'new row for relation "business_memory" violates check constraint "business_memory_category_check"' } }) }) };
          }
          const row = { id: "m1", ...values };
          rows.push(row);
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
        update(values: any) {
          lastUpdate = values;
          // The database's job, done the way the database does it.
          if (values.category && !LIVE_CATEGORIES.includes(values.category)) {
            const rejected = { data: null, error: { message: 'new row for relation "business_memory" violates check constraint "business_memory_category_check"' } };
            return { eq: () => ({ eq: () => ({ select: async () => rejected }) }) };
          }
          const matched = rows.filter((r) => r.id === "m1");
          return { eq: () => ({ eq: () => ({ select: async () => ({ data: matched.map((r) => ({ id: r.id })), error: null }) }) }) };
        },
      };
      return chain;
    },
  }),
}));

async function call(method: "POST" | "PATCH", body: any) {
  const route = await import("@/app/api/business-memory/route");
  const handler = method === "POST" ? route.POST : route.PATCH;
  const response = await handler(new Request("https://hawlai.online/api/business-memory", { method, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  rows = [{ id: "m1", dealership_id: "d1", category: "audience_insight", insight: "Diwali pe lavender sabse zyada bika" }];
  lastUpdate = null;
});

describe("editing a memory's category", () => {
  it("refuses an unknown category with a specific error, not a 500", async () => {
    const { status, body } = await call("PATCH", { id: "m1", category: "pricing_note" });

    expect(status).toBe(400);
    // "pricing_note" is real — in business_knowledge, a DIFFERENT table.
    // The error names the value, and says which ones do work.
    expect(body.error).toContain('"pricing_note" isn\'t a memory category');
    expect(body.error).toContain("audience_insight");
    expect(body.allowed).toEqual(LIVE_CATEGORIES);
    // Nothing reached the database.
    expect(lastUpdate).toBeNull();
    // And no raw Postgres text was handed to the owner.
    expect(body.error).not.toMatch(/violates check constraint|relation "/);
  });

  it("accepts every category the live constraint allows", async () => {
    for (const category of LIVE_CATEGORIES) {
      const { status } = await call("PATCH", { id: "m1", category });
      expect(status, category).toBe(200);
    }
  });

  it("refuses blanking a memory instead of saving an empty one", async () => {
    const { status, body } = await call("PATCH", { id: "m1", insight: "   " });
    expect(status).toBe(400);
    expect(body.error).toMatch(/can't be empty/);
    expect(lastUpdate).toBeNull();
  });

  it("saves an edit to the words, trimmed", async () => {
    const { status } = await call("PATCH", { id: "m1", insight: "  Diwali pe lavender aur mogra dono bike  " });
    expect(status).toBe(200);
    expect(lastUpdate.insight).toBe("Diwali pe lavender aur mogra dono bike");
  });

  it("says so when the row isn't this business's", async () => {
    // Supabase reports a scoped update that matched nothing as a success
    // with no rows, which read as "saved" and saved nothing.
    rows = [];
    const { status, body } = await call("PATCH", { id: "m1", insight: "changed" });
    expect(status).toBe(404);
    expect(body.error).toMatch(/isn't one of yours/);
  });
});

describe("adding a memory stays best-effort, but says where it landed", () => {
  it("files an unknown category under General and names what happened", async () => {
    const { status, body } = await call("POST", { insight: "Diwali pe lavender chala", category: "pricing_note" });
    // Not a refusal: "remember this" shouldn't fail over a category.
    expect(status).toBe(200);
    expect(body.memory.category).toBe("general");
    // But not silent either — this was a reclassification.
    expect(body.note).toMatch(/isn't one of the categories, so this was filed under General/);
  });

  it("says nothing extra when the category was already right", async () => {
    const { body } = await call("POST", { insight: "Diwali pe lavender chala", category: "audience_insight" });
    expect(body.memory.category).toBe("audience_insight");
    expect(body.note).toBeUndefined();
  });

  it("still refuses an empty insight", async () => {
    const { status, body } = await call("POST", { insight: "  " });
    expect(status).toBe(400);
    expect(body.error).toMatch(/insight required/);
  });
});

describe("the two memory tables are not one table", () => {
  it("does not accept business_knowledge's vocabulary", async () => {
    // business_knowledge allows hours, pricing_note, policy, faq,
    // general, business_story. business_memory allows the five above.
    // Only "general" is in both — so a value from the other table is a
    // real mistake to catch, not a near miss.
    for (const foreign of ["hours", "pricing_note", "policy", "faq", "business_story"]) {
      const { status } = await call("PATCH", { id: "m1", category: foreign });
      expect(status, foreign).toBe(400);
    }
    const { status } = await call("PATCH", { id: "m1", category: "general" });
    expect(status).toBe(200);
  });
});
