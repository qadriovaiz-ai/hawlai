// VARIANTS AS SEPARATE PRODUCTS — V1 of docs/PLAN-INSTAGRAM-SELLER-MODE.md,
// 28 November 2026. No schema: "Kurta – Red – M" is its own product with
// its own price and stock. Names are read, nothing is guessed: a customer
// who names only the item is shown the options from the catalog.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { splitVariantName, variantsOf, hasVariants, VARIANT_NOTE } from "@/lib/catalog/variants";
import { handleOrderTurn, EMPTY_DRAFT, type Extraction, type OrderTurnDeps } from "@/lib/dm/orderConversation";

const KURTAS = [
  { id: "k1", name: "Kurta – Red – M" },
  { id: "k2", name: "Kurta – Red – L" },
  { id: "k3", name: "Kurta - Blue - M" },
  { id: "m1", name: "Clay Mug" },
  { id: "t1", name: "T-shirt" },
  { id: "v1", name: "Vase – Tall" },
];

describe("1. READING A NAME", () => {
  it("THE PART BEFORE THE FIRST SPACED SEPARATOR IS THE ITEM; THE REST IS THE OPTION", () => {
    expect(splitVariantName("Kurta – Red – M")).toEqual({ base: "Kurta", option: "Red – M" });
    expect(splitVariantName("Kurta - Blue")).toEqual({ base: "Kurta", option: "Blue" });
    expect(splitVariantName("Saree | Silk")).toEqual({ base: "Saree", option: "Silk" });
    expect(splitVariantName("Bag / Large")).toEqual({ base: "Bag", option: "Large" });
  });

  it("A HYPHEN INSIDE A WORD IS NOT A SEPARATOR — 'T-shirt' is one product", () => {
    expect(splitVariantName("T-shirt")).toEqual({ base: "T-shirt", option: null });
    expect(splitVariantName("Kurta|M")).toEqual({ base: "Kurta|M", option: null });
    expect(splitVariantName("Clay Mug")).toEqual({ base: "Clay Mug", option: null });
  });

  it("SIBLINGS ARE TWO OR MORE PRODUCTS SHARING THE ITEM — one product is not a choice", () => {
    expect(variantsOf("kurta", KURTAS).map((p) => p.id)).toEqual(["k1", "k2", "k3"]);
    expect(variantsOf("Vase", KURTAS)).toEqual([]);
    expect(variantsOf("Clay Mug", KURTAS)).toEqual([]);
    expect(variantsOf("", KURTAS)).toEqual([]);
  });

  it("A CATALOG HAS VARIANTS ONLY WHEN SOME ITEM HAS TWO OPTIONS", () => {
    expect(hasVariants(KURTAS)).toBe(true);
    expect(hasVariants([{ name: "Vase – Tall" }, { name: "Clay Mug" }, { name: "T-shirt" }])).toBe(false);
  });
});

describe("2. THE ORDER FLOW ASKS WHICH ONE — from the catalog, never a guess", () => {
  const priced: string[] = [];
  const saves: any[] = [];
  const deps = (ex: Extraction): OrderTurnDeps => ({
    now: new Date("2026-11-28T12:00:00Z"),
    language: "english",
    catalog: KURTAS,
    loadDraft: async () => null,
    saveDraft: async (p: any) => void saves.push(p),
    claimReadback: async () => true,
    extract: async () => ex,
    price: async () => (priced.push("price"), { ok: false, status: 500, error: "should not be priced" }),
    placeOrder: async () => ({ ok: false, error: "no" }),
    paymentRequest: () => ({ text: "", qrUrl: "" }),
    notifySeller: async () => {},
  } as any);
  const ex = (product: string): Extraction => ({ intent: "order", items: [{ product, quantity: 1 }], name: "Asha", phone: "9800000001", address: "12 Lake Road, Pune" } as any);

  it("ONLY THE ITEM NAMED, AND IT COMES IN OPTIONS: THE OPTIONS ARE LISTED, EXACTLY AS THE CATALOG SPELLS THEM", async () => {
    const t: any = await handleOrderTurn("ek kurta chahiye", deps(ex("Kurta")));
    expect(t.messages[0].text).toBe("Which Kurta would you like?\n• Kurta – Red – M\n• Kurta – Red – L\n• Kurta - Blue - M\nSend the one you want.");
    expect(priced).toEqual([]);
    // The unresolved item is not kept as if it were an order line.
    expect(saves.at(-1).draft.items).toEqual([]);
    expect(saves.at(-1).readback).toBeNull();
  });

  it("AN ITEM WITH ONE OPTION, OR NO SUCH ITEM, IS STILL 'which product?' — not a list of one", async () => {
    expect(((await handleOrderTurn("vase", deps(ex("Vase")))) as any).messages[0].text).toMatch(/couldn't find "Vase"/);
    expect(((await handleOrderTurn("lamp", deps(ex("Lamp")))) as any).messages[0].text).toMatch(/couldn't find "Lamp"/);
  });

  it("AN EXACT VARIANT NAME IS AN EXACT MATCH — straight to pricing", async () => {
    await handleOrderTurn("red kurta in M", deps(ex("Kurta – Red – M")));
    expect(priced).toEqual(["price"]);
  });
});

describe("3. THE MODEL IS TOLD HOW TO READ SUCH NAMES — read with comments stripped", () => {
  it("THE DM REPLY GETS THE NOTE, AND ONLY WHEN THE CATALOG HAS VARIANTS", () => {
    const src = code("src/lib/agents/socialManagementAgent.ts");
    expect(src).toMatch(/const variantContext = productCatalog && hasVariants\(productCatalog\) \? `\\n\$\{VARIANT_NOTE\}` : "";/);
    expect(src).toContain("${catalogContext}${variantContext}");
    expect(VARIANT_NOTE).toMatch(/answer ONLY from the product whose name has that exact option/);
  });

  it("THE ORDER READER IS TOLD TO GIVE THE EXACT VARIANT, OR JUST THE ITEM", () => {
    expect(code("src/lib/dm/orderConversation.ts")).toMatch(/when they name only the item \("a kurta"\) without saying which, give just the item name/);
  });
});

void EMPTY_DRAFT;
