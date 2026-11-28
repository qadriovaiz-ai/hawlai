// WHICH PRODUCT A POST'S PHOTO SHOWS — T3, 28 November 2026.
// A guess, cached per post, accepted only as a name the model was shown,
// and never a model call when the cache can't be read.

import { describe, it, expect, vi, beforeEach } from "vitest";

const modelCalls: any[] = [];
let modelAnswer: { ok: boolean; text?: string };
vi.mock("@/lib/ai/claude", () => ({ callClaude: async (body: any, opts: any) => (modelCalls.push({ body, opts }), modelAnswer) }));

import { guessProductFromPhoto, readGuess, MAX_CANDIDATES } from "@/lib/dm/postVision";

let cached: any;
let cacheError: any;
const saved: any[] = [];
function db() {
  return {
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: cached, error: cacheError }),
        upsert: async (row: any, opts: any) => (saved.push({ table, row, opts }), { error: null }),
      };
      return api;
    },
  };
}

const CATALOG = [
  { name: "Clay Mug", images: ["https://cdn/mug.jpg"], kind: "product", active: true },
  { name: "Blue Vase", images: ["https://cdn/vase.jpg"], kind: "product", active: true },
  { name: "Pottery Class", images: ["https://cdn/class.jpg"], kind: "service", active: true },
  { name: "Old Bowl", images: ["https://cdn/bowl.jpg"], kind: "product", active: false },
  { name: "No Photo", images: [], kind: "product", active: true },
];

beforeEach(() => {
  modelCalls.length = 0;
  saved.length = 0;
  cached = null;
  cacheError = null;
  modelAnswer = { ok: true, text: '{"product":"clay mug","confidence":"high"}' };
});

describe("1. THE ANSWER IS ONE OF THE NAMES SHOWN, OR NONE", () => {
  it("A SHOWN NAME, ANY CASE, IS RETURNED AS THE CATALOG SPELLS IT", () => {
    expect(readGuess({ product: "clay mug", confidence: "high" }, ["Clay Mug"])).toEqual({ product: "Clay Mug", confidence: "high" });
  });
  it("A NAME IT WASN'T SHOWN, OR null, IS NO MATCH; A BAD CONFIDENCE IS NO ANSWER", () => {
    expect(readGuess({ product: "Teapot", confidence: "high" }, ["Clay Mug"])).toEqual({ product: null, confidence: "none" });
    expect(readGuess({ product: null, confidence: "low" }, ["Clay Mug"])).toEqual({ product: null, confidence: "none" });
    expect(readGuess({ product: "Clay Mug", confidence: "certain" }, ["Clay Mug"])).toBeNull();
    expect(readGuess("x", ["Clay Mug"])).toBeNull();
  });
});

describe("2. THE COMPARISON", () => {
  it("THE POST PHOTO AND EACH SELLABLE PRODUCT'S OWN PHOTO, NAMED — services, inactive and photo-less left out", async () => {
    const g = await guessProductFromPhoto(db(), "d1", "m1", "https://cdn/post.jpg", CATALOG);
    expect(g).toEqual({ product: "Clay Mug", confidence: "high" });
    const content = modelCalls[0].body.messages[0].content;
    const images = content.filter((c: any) => c.type === "image").map((c: any) => c.source.url);
    expect(images).toEqual(["https://cdn/post.jpg", "https://cdn/mug.jpg", "https://cdn/vase.jpg"]);
    expect(JSON.stringify(content)).not.toMatch(/Pottery Class|Old Bowl|No Photo/);
    expect(modelCalls[0].opts).toMatchObject({ operation: "dm_post_vision", logContext: { dealershipId: "d1" } });
  });

  it("AT MOST EIGHT PRODUCTS IN ONE CALL", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `P${i}`, images: [`https://cdn/${i}.jpg`], kind: "product", active: true }));
    modelAnswer = { ok: true, text: '{"product":null,"confidence":"low"}' };
    await guessProductFromPhoto(db(), "d1", "m1", "https://cdn/post.jpg", many);
    expect(modelCalls[0].body.messages[0].content.filter((c: any) => c.type === "image")).toHaveLength(1 + MAX_CANDIDATES);
  });

  it("CACHED PER POST — and a cached guess costs no call", async () => {
    await guessProductFromPhoto(db(), "d1", "m1", "https://cdn/post.jpg", CATALOG);
    expect(saved).toEqual([{ table: "instagram_post_guesses", row: { dealership_id: "d1", media_id: "m1", product_name: "Clay Mug", confidence: "high" }, opts: { onConflict: "dealership_id,media_id" } }]);
    modelCalls.length = 0;
    cached = { product_name: "Blue Vase", confidence: "low" };
    expect(await guessProductFromPhoto(db(), "d1", "m1", "https://cdn/post.jpg", CATALOG)).toEqual({ product: "Blue Vase", confidence: "low" });
    expect(modelCalls).toEqual([]);
  });

  it("A CACHE THAT CAN'T BE READ MEANS NO CALL — cost is not risked on a database hiccup", async () => {
    cacheError = { message: "boom" };
    expect(await guessProductFromPhoto(db(), "d1", "m1", "https://cdn/post.jpg", CATALOG)).toEqual({ product: null, confidence: "none" });
    expect(modelCalls).toEqual([]);
  });

  it("A FAILED OR UNREADABLE MODEL ANSWER IS NO MATCH, AND IS NOT CACHED — the next message can try again", async () => {
    modelAnswer = { ok: false };
    expect(await guessProductFromPhoto(db(), "d1", "m1", "https://cdn/post.jpg", CATALOG)).toEqual({ product: null, confidence: "none" });
    modelAnswer = { ok: true, text: "I think it's the mug" };
    expect(await guessProductFromPhoto(db(), "d1", "m1", "https://cdn/post.jpg", CATALOG)).toEqual({ product: null, confidence: "none" });
    expect(saved).toEqual([]);
  });

  it("NO PRODUCT HAS A PHOTO: NO CALL", async () => {
    expect(await guessProductFromPhoto(db(), "d1", "m1", "https://cdn/post.jpg", [CATALOG[4]])).toEqual({ product: null, confidence: "none" });
    expect(modelCalls).toEqual([]);
  });
});
