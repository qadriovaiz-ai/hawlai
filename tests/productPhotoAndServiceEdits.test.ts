// E3 + E4 of docs/PLAN-INSTAGRAM-STORE-AND-PRODUCT-EDITS.md, 28 Nov 2026.
//
// E3: a photo sent on WhatsApp with the caption "photo: <exact product
// name>" replaces that product's main photo — as an approval card, like
// every other product edit. Never a guess at which product.
// E4: a service's duration and booking link, changed from chat through
// the same tool, pipeline and card.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { photoReplaceName, replacePhotoFromWhatsApp } from "@/lib/whatsapp/photoProduct";
import { createHawlaiShopPlatform } from "@/lib/publish/platforms/hawlaiShop";
import { productAlreadyHas } from "@/lib/catalog/alreadyHas";
import { ACTION_RISK, ALWAYS_REQUIRES_APPROVAL } from "@/lib/publish/types";
import { getActionPolicy } from "@/lib/executionPolicy";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: Row[];

function db() {
  return {
    from: (table: string) => {
      let op = "select";
      let values: Row = {};
      const api: any = {
        select: () => api, eq: () => api, order: () => api, limit: () => api,
        update: (v: Row) => ((op = "update"), (values = v), api),
        maybeSingle: async () => {
          if (op === "update") {
            writes.push(values);
            Object.assign(tables[table][0], values);
            return { data: { id: tables[table][0].id }, error: null };
          }
          return { data: tables[table]?.[0] ?? null, error: null };
        },
        then: (res: any) => res({ data: tables[table] ?? [], error: null }),
      };
      return api;
    },
  };
}

const MUG = () => ({ id: "p1", name: "Clay mug", price: 499, description: "", images: ["https://cdn.example/old.jpg", "https://cdn.example/side.jpg"], is_active: true, inventory_count: 5, compare_at_price: null, category: null, kind: "product" });
const SESSION = () => ({ id: "s1", name: "Yoga session", price: 800, description: "", images: [], is_active: true, inventory_count: null, compare_at_price: null, category: null, kind: "service", duration_minutes: null, booking_url: null });

const action = (actionKey: string, requestedChanges: Row, targetRef = "p1") =>
  ({ id: "a1", dealershipId: "d1", platform: "hawlai_shop", connectionRef: null, actionKey, targetRef, targetLabel: "", requestedChanges, preview: null, previewedAt: null, status: "draft", idempotencyKey: "k" }) as any;

beforeEach(() => {
  tables = { products: [MUG()] };
  writes = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("E3. 1 — THE CAPTION", () => {
  it("'photo: <name>' NAMES A PRODUCT; any other caption does not", () => {
    expect(photoReplaceName("photo: Clay mug")).toBe("Clay mug");
    expect(photoReplaceName("Photo:   Clay   mug ")).toBe("Clay mug");
    expect(photoReplaceName("photo - Clay mug")).toBe("Clay mug");
    expect(photoReplaceName("Red kurta M ₹899 5 pcs")).toBeNull();
    expect(photoReplaceName("photo:")).toBeNull();
    expect(photoReplaceName("")).toBeNull();
  });
});

describe("E3. 2 — WHICH PRODUCT: EXACTLY ONE, BY ITS EXACT NAME", () => {
  const run = (name: string, over: Partial<Parameters<typeof replacePhotoFromWhatsApp>[0]> = {}) => {
    const requested: any[] = [];
    const deps = {
      supabase: db(),
      dealershipId: "d1",
      download: async () => ({ bytes: Buffer.from("x"), mimeType: "image/jpeg" }),
      store: async () => "https://cdn.example/new.jpg",
      requestChange: async (p: any, url: string) => (requested.push({ p, url }), { ok: true as const, approvalId: "c0de1111-0000", summary: '"Clay mug" — Main photo: replaced with the photo you sent' }),
      codeFor: (id: string) => id.slice(0, 4).toUpperCase(),
      ...over,
    };
    return replacePhotoFromWhatsApp(deps, { phone: "91", mediaId: "m1", caption: `photo: ${name}` }, name).then((reply) => ({ reply, requested }));
  };

  it("THE NAMED PRODUCT GETS A CARD — code, what it does, how to answer; nothing changed yet", async () => {
    const { reply, requested } = await run("clay MUG");
    expect(requested).toEqual([{ p: { id: "p1", name: "Clay mug" }, url: "https://cdn.example/new.jpg" }]);
    expect(reply).toBe('Waiting for your OK:\n• C0DE: "Clay mug" — Main photo: replaced with the photo you sent\n\nReply "haan C0DE" to approve, or "nahi C0DE" to reject. Nothing changes until you do.');
    expect(writes).toEqual([]);
  });

  it("PART OF A NAME IS NOT A MATCH — 'mug' does not replace the Clay mug's photo", async () => {
    const { reply, requested } = await run("mug");
    expect(requested).toEqual([]);
    expect(reply).toMatch(/^No product is called "mug", so the photo wasn't changed/);
  });

  it("TWO PRODUCTS WITH THAT NAME: NEITHER IS TOUCHED", async () => {
    tables.products = [MUG(), { ...MUG(), id: "p2" }];
    const { reply, requested } = await run("Clay mug");
    expect(requested).toEqual([]);
    expect(reply).toMatch(/^More than one product is called "Clay mug"/);
  });

  it("A PHOTO THAT COULDN'T BE SAVED ASKS FOR NOTHING", async () => {
    const { reply, requested } = await run("Clay mug", { download: async () => { throw new Error("expired"); } });
    expect(requested).toEqual([]);
    expect(reply).toMatch(/couldn't be saved \(expired\), so nothing was changed/);
  });

  it("A REFUSED REQUEST SAYS SO", async () => {
    const { reply } = await run("Clay mug", { requestChange: async () => ({ ok: false as const, reason: "store unreadable" }) });
    expect(reply).toBe("The photo change couldn't be set up (store unreadable). Nothing was changed.");
  });
});

describe("E3. 3 — THE STORE: preview, then the write on approval", () => {
  const shop = () => createHawlaiShopPlatform({ supabase: db() });

  it("THE CARD SAYS WHAT HAPPENS, NOT A WEB ADDRESS", async () => {
    const r = await shop().preview(action("update_product_image", { image: "https://cdn.example/new.jpg" }));
    expect(r.ok && r.preview.summary).toBe('"Clay mug" — Main photo: replaced with the photo you sent');
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/photo customers see first/);
  });

  it("ONLY A STORED PICTURE — never any other text", async () => {
    const r = await shop().preview(action("update_product_image", { image: "javascript:alert(1)" }));
    expect(r).toEqual({ ok: false, reason: "That photo isn't a stored picture — send it again." });
  });

  it("APPROVED: THE NEW PHOTO GOES FIRST, THE OTHERS STAY, THE OLD MAIN ONE GOES", async () => {
    const p = shop();
    const pre = await p.preview(action("update_product_image", { image: "https://cdn.example/new.jpg" }));
    if (!pre.ok) throw new Error("preview failed");
    const r = await p.execute({ ...action("update_product_image", { image: "https://cdn.example/new.jpg" }), preview: pre.preview });
    expect(r.ok).toBe(true);
    expect(writes[0].images).toEqual(["https://cdn.example/new.jpg", "https://cdn.example/side.jpg"]);
  });
});

describe("E4 — A SERVICE'S DURATION AND BOOKING LINK", () => {
  beforeEach(() => {
    tables.products = [SESSION()];
  });
  const shop = () => createHawlaiShopPlatform({ supabase: db() });

  it("DURATION: shown as people say it, written as minutes", async () => {
    const p = shop();
    const pre = await p.preview(action("update_product_duration", { duration: "90" }, "s1"));
    expect(pre.ok && pre.preview.summary).toBe('"Yoga session" — Duration: not set → 1 hr 30 min');
    if (!pre.ok) return;
    await p.execute({ ...action("update_product_duration", { duration: "90" }, "s1"), preview: pre.preview });
    expect(writes[0].duration_minutes).toBe(90);
  });

  it("THE PRODUCTS TAB'S OWN LIMITS — not a whole number, or over 24 hours, is refused", async () => {
    expect(await shop().preview(action("update_product_duration", { duration: "45.5" }, "s1"))).toMatchObject({ ok: false });
    expect(await shop().preview(action("update_product_duration", { duration: "2000" }, "s1"))).toMatchObject({ ok: false });
  });

  it("BOOKING LINK: the card names where customers will go", async () => {
    const r = await shop().preview(action("update_product_booking_url", { booking_url: "https://cal.example.com/yoga" }, "s1"));
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/Customers who tap Book will go to cal\.example\.com/);
  });

  it("A LINK THAT ISN'T A WEB ADDRESS IS REFUSED", async () => {
    expect(await shop().preview(action("update_product_booking_url", { booking_url: "call me" }, "s1"))).toEqual({
      ok: false,
      reason: "The booking link must be a full web address starting with https://",
    });
  });

  it("CLEARING THE LINK WRITES null — Book goes back to the booking page", async () => {
    tables.products = [{ ...SESSION(), booking_url: "https://cal.example.com/yoga" }];
    const p = shop();
    const pre = await p.preview(action("update_product_booking_url", { booking_url: "" }, "s1"));
    if (!pre.ok) throw new Error("preview failed");
    expect(pre.preview.summary).toBe('"Yoga session" — Booking link: https://cal.example.com/yoga → your booking page');
    await p.execute({ ...action("update_product_booking_url", { booking_url: "" }, "s1"), preview: pre.preview });
    expect(writes[0].booking_url).toBeNull();
  });

  it("A PRODUCT HAS NO DURATION OR BOOKING LINK — refused, by name", async () => {
    tables.products = [MUG()];
    expect(await shop().preview(action("update_product_duration", { duration: "30" }))).toEqual({
      ok: false,
      reason: '"Clay mug" is a product, not a service — a duration and a booking link are for services.',
    });
  });

  it("ALREADY-SET VALUES ARE NOT A CHANGE (the 8C68 rule, for these too)", () => {
    const s = { id: "s1", name: "Yoga session", price: 800, description: null, images: [], inventory: null, category: null, active: true, kind: "service" as const, durationMinutes: 60, bookingUrl: "https://cal.example.com/yoga" };
    expect(productAlreadyHas(s, "duration", "60")).toBe(true);
    expect(productAlreadyHas(s, "duration", "45")).toBe(false);
    expect(productAlreadyHas(s, "booking_link", "https://cal.example.com/yoga")).toBe(true);
    expect(productAlreadyHas({ ...s, bookingUrl: null }, "booking_link", "")).toBe(true);
  });
});

describe("REGISTERED LIKE EVERY OTHER EDIT (Rule 6)", () => {
  it("EACH NEW ACTION HAS A POLICY, A RISK, AND ALWAYS ASKS", () => {
    for (const key of ["update_product_image", "update_product_duration", "update_product_booking_url"] as const) {
      expect(getActionPolicy(key), key).toBeTruthy();
      expect(ACTION_RISK[key], key).toBe("medium");
      expect(ALWAYS_REQUIRES_APPROVAL, key).toContain(key);
    }
  });
});
