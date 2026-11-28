// A PRODUCT FROM A PHOTO ON WHATSAPP — W1, 28 November 2026.
// The seller's own caption is read into name / price / stock, and each
// value is accepted only if the caption itself contains it. Nothing is
// invented; a missing price adds nothing and says what to send.

import { describe, it, expect, beforeEach } from "vitest";
import { code } from "./helpers/source";
import { readPhotoMessages, checkAgainstCaption, addProductFromPhoto, ASK_FOR_CAPTION } from "@/lib/whatsapp/photoProduct";

describe("1. READING A PHOTO MESSAGE", () => {
  it("AN IMAGE WITH ITS MEDIA ID AND CAPTION, FROM ITS SENDER", () => {
    const body = { entry: [{ changes: [{ field: "messages", value: { messages: [{ from: "919800000001", type: "image", image: { id: "123456789012", caption: " Red kurta M ₹899 5 pcs " } }] } }] }] };
    expect(readPhotoMessages(body)).toEqual([{ phone: "919800000001", mediaId: "123456789012", caption: "Red kurta M ₹899 5 pcs" }]);
  });

  it("TEXT, BUTTONS, OTHER FIELDS AND AN IMAGE WITH NO ID ARE NOT PHOTOS", () => {
    const body = { entry: [{ changes: [
      { field: "messages", value: { messages: [{ from: "91", type: "text", text: { body: "hi" } }, { from: "91", type: "button", button: { payload: "x" } }, { from: "91", type: "image", image: {} }] } },
      { field: "account_update", value: { messages: [{ from: "91", type: "image", image: { id: "1" } }] } },
    ] }] };
    expect(readPhotoMessages(body)).toEqual([]);
    expect(readPhotoMessages(null)).toEqual([]);
  });
});

describe("2. ONLY WHAT THE CAPTION SAYS", () => {
  const caption = "Red Kurta – M, ₹1,299, 5 pcs";

  it("NAME, PRICE AND STOCK, EACH FOUND IN THE CAPTION — commas in prices allowed", () => {
    expect(checkAgainstCaption({ name: "Red Kurta – M", price: 1299, inventory: 5 }, caption)).toEqual({ ok: true, fields: { name: "Red Kurta – M", price: 1299, inventory: 5 } });
  });

  it("A PRICE THE CAPTION DOESN'T SAY IS REFUSED — never invented", () => {
    expect(checkAgainstCaption({ name: "Red Kurta", price: 999, inventory: 5 }, caption)).toEqual({ ok: false, missing: "the price" });
    expect(checkAgainstCaption({ name: "Red Kurta", price: null }, "Red Kurta")).toEqual({ ok: false, missing: "the price" });
  });

  it("A NAME WITH A WORD THE CAPTION DOESN'T HAVE IS REFUSED — no 'Handmade Silk Kurta'", () => {
    expect(checkAgainstCaption({ name: "Handmade Red Kurta", price: 1299 }, caption)).toEqual({ ok: false, missing: "the product's name" });
  });

  it("A STOCK THE CAPTION DOESN'T SAY IS DROPPED, NOT USED — the product still goes in", () => {
    expect(checkAgainstCaption({ name: "Red Kurta", price: 1299, inventory: 50 }, caption)).toEqual({ ok: true, fields: { name: "Red Kurta", price: 1299, inventory: null } });
  });
});

describe("3. ADDING IT", () => {
  let inserted: any[];
  let existing: any[];
  let stored: any[];
  let downloadFails: boolean;
  let reading: any;
  const supabase = () => ({
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        ilike: () => api,
        limit: async () => ({ data: existing, error: null }),
        insert: async (row: any) => (inserted.push({ table, row }), { error: null }),
      };
      return api;
    },
  });
  const deps = () => ({
    supabase: supabase(),
    dealershipId: "d1",
    download: async (id: string) => {
      if (downloadFails) throw new Error("WhatsApp didn't give the photo.");
      return { bytes: Buffer.from("img"), mimeType: "image/jpeg" };
    },
    store: async (_b: Buffer, mime: string) => (stored.push(mime), "https://cdn/website-assets/d1/product-1.jpg"),
    read: async () => reading,
  });
  const photo = (caption: string) => ({ phone: "91", mediaId: "123456789012", caption });

  beforeEach(() => {
    inserted = [];
    existing = [];
    stored = [];
    downloadFails = false;
    reading = { name: "Red Kurta M", price: 899, inventory: 5 };
  });

  it("THE PRODUCT, ACTIVE, WITH THE PHOTO AS ITS IMAGE — and the seller told exactly what was added", async () => {
    const reply = await addProductFromPhoto(deps(), photo("Red kurta M ₹899 5 pcs"));
    expect(inserted).toEqual([{ table: "products", row: { dealership_id: "d1", name: "Red Kurta M", price: 899, inventory_count: 5, images: ["https://cdn/website-assets/d1/product-1.jpg"], is_active: true } }]);
    expect(reply).toBe('Added to your products: "Red Kurta M" · ₹899 · 5 in stock. Change anything on the Products tab.');
  });

  it("NO CAPTION: NOTHING ADDED, AND IT SAYS WHAT TO SEND", async () => {
    expect(await addProductFromPhoto(deps(), photo(""))).toBe(ASK_FOR_CAPTION);
    expect(inserted).toEqual([]);
  });

  it("NO PRICE IN THE CAPTION: NOTHING ADDED, AND IT SAYS WHICH THING WAS MISSING", async () => {
    reading = { name: "Red Kurta M", price: 899 };
    const reply = await addProductFromPhoto(deps(), photo("Red kurta M, 5 pcs"));
    expect(reply).toMatch(/couldn't find the price in your caption, so nothing was added/);
    expect(inserted).toEqual([]);
    expect(stored).toEqual([]);
  });

  it("A PRODUCT THAT ALREADY EXISTS IS NOT ADDED TWICE", async () => {
    existing = [{ id: "p1" }];
    expect(await addProductFromPhoto(deps(), photo("Red kurta M ₹899 5 pcs"))).toMatch(/already in your products/);
    expect(inserted).toEqual([]);
  });

  it("A PHOTO THAT CAN'T BE DOWNLOADED ADDS NOTHING — never a product with no picture by accident", async () => {
    downloadFails = true;
    expect(await addProductFromPhoto(deps(), photo("Red kurta M ₹899 5 pcs"))).toMatch(/couldn't be saved \(WhatsApp didn't give the photo\.\)/);
    expect(inserted).toEqual([]);
  });

  it("A CAPTION THE AI COULDN'T READ ADDS NOTHING", async () => {
    reading = null;
    expect(await addProductFromPhoto(deps(), photo("Red kurta M ₹899 5 pcs"))).toMatch(/couldn't read that caption/);
    expect(inserted).toEqual([]);
  });
});

describe("4. THE WEBHOOK — read with comments stripped", () => {
  const src = code("src/app/api/webhooks/whatsapp/route.ts");

  it("PHOTOS ARE READ BY THEIR OWN PARSER, META ONLY, EACH HANDLED", () => {
    expect(src).toMatch(/const photos = provider === "meta" \? readPhotoMessages\(body\) : \[\];\s*for \(const photo of photos\) \{\s*await handleOnePhoto\(photo, supabase\);/);
  });

  it("ONLY A VERIFIED OWNER, ON A PLAN WITH WHATSAPP AUTOMATION", () => {
    const start = src.indexOf("async function handleOnePhoto(");
    const end = src.indexOf("export async function GET(", start);
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, end);
    expect(fn).toMatch(/\.eq\("owner_whatsapp_number", photo\.phone\)\s*\.eq\("owner_whatsapp_verified", true\)/);
    expect(fn).toMatch(/if \(!dealership\) \{[\s\S]*?return;\s*\}/);
    expect(fn).toMatch(/if \(!hasFeature\(limits, "whatsappAutomation"\)\) \{[\s\S]*?return;\s*\}\s*const reply = await addProductFromPhoto\(/);
  });

  it("THE PHOTO GOES WHERE THE PRODUCTS TAB PUTS ITS PHOTOS", () => {
    const lib = code("src/lib/whatsapp/photoProduct.ts");
    expect(lib).toMatch(/const filePath = `website-assets\/\$\{dealershipId\}\/product-\$\{Date\.now\(\)\}\.\$\{ext\}`;/);
    expect(lib).toMatch(/storage\.from\("ad-creatives"\)\.upload\(filePath/);
  });
});
