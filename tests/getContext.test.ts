// C1 — one read, one slice, everything citable has an id.
//
// docs/PLAN-CORE-ARCHITECTURE.md §2 (C1). getContext is a thin
// task-slicing wrapper over gatherBusinessFacts, which the founder
// chose as the spine on 2026-10-15 — and the reason it must be a
// wrapper rather than a second reader is that the claims guard already
// checks copy against gatherBusinessFacts. Two readers would leave the
// writer and the guard reading different truths.

import { describe, it, expect, vi } from "vitest";
import { getContext, productsForTopic, productKey } from "@/lib/facts/getContext";
import { resolveFactId, isUnlicensable, type FactRecord } from "@/lib/facts/factRecord";
import { code } from "./helpers/source";

const TENANT = "biz_1";

function product(name: string, price: number, extra: Record<string, unknown> = {}) {
  return {
    id: name.toLowerCase().replace(/\W+/g, "_"),
    name,
    kind: "product",
    price,
    description: null,
    images: [],
    inventory: null,
    category: null,
    active: true,
    durationMinutes: null,
    bookingUrl: null,
    ...extra,
  } as any;
}

const CANDLE_FACTS = {
  businessName: "Candle by Qaaf",
  category: "Home fragrance",
  categoryKnown: true,
  city: "Shahjahanpur",
  products: [product("Lavender candle", 999), product("Rose candle", 850)],
  offers: [{ code: "FIRST10", label: "10% off", percent: 10, flat: null }],
  shipping: { mode: "free", rate: null, freeThreshold: null },
  allTime: { paidOrders: 2, leads: 1 },
  ownerFacts: [
    { category: "general", title: "What you refuse to do", content: "Kabhi sasta paraffin wax mix nahi karti." },
  ],
  unreadable: [],
} as any;

/** getContext's only dependency is gatherBusinessFactsSafely. */
function withFacts(facts: any) {
  vi.doMock("@/lib/claims/businessFacts", async (importOriginal) => {
    const real = (await importOriginal()) as any;
    return { ...real, gatherBusinessFactsSafely: async () => facts };
  });
}

async function context(facts: any, topic: string, kind: any = "email") {
  vi.resetModules();
  withFacts(facts);
  const { getContext: fresh } = await import("@/lib/facts/getContext");
  return fresh({}, TENANT, { kind, topic });
}

const keys = (records: FactRecord[]) => records.map((r) => r.key);

describe("1. the slice", () => {
  it("NARROWS TO THE PRODUCT THE TASK NAMES — the candle-03 failure", () => {
    // "Dono Rs 850 se shuru hoti hain" was produced for a post about
    // how the candles are made, with both prices in front of the model.
    // A task about the lavender gets the lavender's number.
    const { kept, narrowed } = productsForTopic("welcome email for the lavender candle", CANDLE_FACTS.products);
    expect(kept.map((p: any) => p.name)).toEqual(["Lavender candle"]);
    expect(narrowed).toBe(true);
  });

  it("keeps the whole catalogue when the topic names no product", () => {
    // A welcome email legitimately covers the range, and an empty
    // slice would be worse than a wide one: it would make the model
    // invent.
    const { kept, narrowed } = productsForTopic("write a welcome email", CANDLE_FACTS.products);
    expect(kept).toHaveLength(2);
    expect(narrowed).toBe(false);
  });

  it("matches on one distinctive word, not only the full name", () => {
    expect(productsForTopic("post about lavender", CANDLE_FACTS.products).kept.map((p: any) => p.name)).toEqual(["Lavender candle"]);
  });

  it("DOES NOT MATCH ON A SHORT COMMON WORD", () => {
    // "candle" is in both names, so a topic naming it is not a
    // narrowing. Matching on "the" or "oil" would silently drop a
    // product's price and the model would reach for another one.
    expect(productsForTopic("post about our candles", CANDLE_FACTS.products).kept).toHaveLength(2);
  });

  it("reports what it kept, so the owner can be told", async () => {
    const ctx = await context(CANDLE_FACTS, "email about the rose candle");
    expect(ctx.slice).toEqual({ products: ["Rose candle"], narrowedByTopic: true });
    expect(keys(ctx.records)).toContain("product.rose_candle.price");
    expect(keys(ctx.records)).not.toContain("product.lavender_candle.price");
  });
});

describe("2. the records", () => {
  it("carries price, shipping, offer and counts, each with an id", async () => {
    const ctx = await context(CANDLE_FACTS, "welcome email");
    expect(keys(ctx.records)).toEqual(
      expect.arrayContaining([
        "product.lavender_candle.price",
        "product.rose_candle.price",
        "shipping.mode",
        "offer.first10.percent",
        "business.paid_orders",
        "business.leads",
      ])
    );
    for (const r of ctx.records) {
      expect(r.id, r.key).toBeTruthy();
      expect(r.dealershipId).toBe(TENANT);
      expect(r.observedAt).toBeTruthy();
    }
  });

  it("A NUMBER COMES FROM THE RECORD, with its unit", async () => {
    const ctx = await context(CANDLE_FACTS, "welcome email");
    const price = ctx.records.find((r) => r.key === "product.lavender_candle.price")!;
    expect(price.value).toBe(999);
    expect(price.unit).toBe("inr");
    expect(price.confidence).toBe("counted");
    expect(price.source).toBe("catalogue");
  });

  it("the owner's rows arrive as records too, read by the extractor", async () => {
    const ctx = await context(CANDLE_FACTS, "welcome email");
    const paraffin = ctx.records.find((r) => r.key === "material.paraffin");
    expect(paraffin?.value).toBe(false);
    expect(paraffin?.source).toBe("owner_stated");
  });

  it("A SERVICE'S DURATION IS A RECORD — the fact every dry run missed", async () => {
    const salon = {
      ...CANDLE_FACTS,
      products: [product("Keratin treatment", 3500, { kind: "service", durationMinutes: 90 })],
      shipping: null,
    };
    const ctx = await context(salon, "email about the keratin treatment");
    const d = ctx.records.find((r) => r.key === "product.keratin_treatment.duration_minutes");
    expect(d?.value).toBe(90);
    expect(d?.unit).toBe("minutes");
  });

  it("A KNOWN-UNKNOWN IS A RECORD, NOT AN ABSENCE — the salon that ships nothing", async () => {
    const salon = { ...CANDLE_FACTS, shipping: null };
    const ctx = await context(salon, "broadcast about free shipping on treatments");
    const mode = ctx.records.find((r) => r.key === "shipping.mode");
    // The record EXISTS and its value is null. That is what lets a
    // verifier say "nothing on record says anything ships" rather than
    // saying nothing at all.
    expect(mode).toBeTruthy();
    expect(mode!.value).toBeNull();
    expect(ctx.unknowns.join(" ")).toMatch(/nothing on record says anything ships/);
  });

  it("every id resolves within this tenant and nowhere else", async () => {
    const ctx = await context(CANDLE_FACTS, "welcome email");
    for (const r of ctx.records) {
      expect(resolveFactId(ctx.records, TENANT, r.id)?.key).toBe(r.key);
      expect(resolveFactId(ctx.records, "another_business", r.id)).toBeNull();
    }
  });

  it("NO RECORD LICENSES A BENEFIT OR A SAFETY CLAIM", () => {
    // "sleep better" and "safe for babies" are refused by the absence
    // of a licence, not by a pattern. If a source ever grants one, this
    // goes red before any copy does.
    expect(isUnlicensable("benefit")).toBe(true);
    expect(isUnlicensable("safety")).toBe(true);
  });

  it("THE PRODUCT NAME IS A RECORD, because facts hide inside it", async () => {
    // The S1 exit run refused "a 500 ml jar" — true — because 500ml
    // exists nowhere except in the name "Desi ghee 500ml". A size, a
    // weight, a pack count: the owner typed them into the name and
    // nothing else holds them.
    const dairy = { ...CANDLE_FACTS, products: [product("Desi ghee 500ml", 850)] };
    const ctx = await context(dairy, "welcome email");
    const name = ctx.records.find((r) => r.key === "product.desi_ghee_500ml.name");
    expect(name?.value).toBe("Desi ghee 500ml");
    expect(name?.source).toBe("catalogue");
    // It must grant `value`, or a figure cited from it cannot be
    // checked against it.
    expect(name?.licenses).toContain("value");
  });

  it("holds no link records, deliberately", async () => {
    // A URL is not a claim. The generators take links from `facts` and
    // repairBookingLinks already owns them; a second home for them
    // would be a second truth.
    const ctx = await context(CANDLE_FACTS, "welcome email");
    expect(keys(ctx.records).filter((k) => /link|url/i.test(k))).toEqual([]);
  });
});

describe("3. it fails closed", () => {
  it("UNREADABLE RECORDS PRODUCE AN EMPTY CONTEXT THAT SAYS SO — F-01", () => {
    // The mistake that turned the whole claim layer off on a transient
    // read error was `facts ? guard() : skip`. A context that returned
    // zero products without saying why would read as "this business has
    // nothing", and the model would fill the gap.
    return context({ ...CANDLE_FACTS }, "x").then(async () => {
      const ctx = await context(null, "welcome email for the lavender candle");
      expect(ctx.facts).toBeNull();
      expect(ctx.records).toEqual([]);
      expect(ctx.unknowns.join(" ")).toMatch(/could not be read/);
      expect(ctx.slice).toEqual({ products: [], narrowedByTopic: false });
    });
  });

  it("an empty catalogue is named as an unknown rather than left silent", async () => {
    const ctx = await context({ ...CANDLE_FACTS, products: [] }, "welcome email");
    expect(ctx.unknowns.join(" ")).toMatch(/catalogue is empty/);
  });

  it("carries whatever gatherBusinessFacts could not read", async () => {
    const ctx = await context({ ...CANDLE_FACTS, unreadable: ["the website's pages"] }, "welcome email");
    expect(ctx.unknowns).toContain("the website's pages");
  });
});

describe("4. it is a wrapper, not a second reader", () => {
  it("READS NO TABLE OF ITS OWN — every fact comes through gatherBusinessFacts", () => {
    const src = code("src/lib/facts/getContext.ts");
    expect(src).toContain("gatherBusinessFactsSafely");
    // The whole point of the founder's decision. A .from("products")
    // here would be the second reader that re-forks the truth.
    expect(src).not.toMatch(/\.from\(/);
    expect(src).not.toMatch(/supabase\s*\.\s*from/);
  });

  it("product keys are stable and safe", () => {
    expect(productKey("Lavender candle")).toBe("lavender_candle");
    expect(productKey("Desi ghee 500ml")).toBe("desi_ghee_500ml");
    expect(productKey("  ")).toBe("");
  });
});
