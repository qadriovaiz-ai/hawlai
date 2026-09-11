// A settings form may only save what it has shown to be the stored state.
//
// THE BUG: the Shipping and Payments tabs did fetch(...).then(r =>
// r.json()) without checking r.ok. A failed load left Shipping on its
// default, "Always Free", with Save enabled — and saving wrote "free"
// over the business's real flat-rate shipping. Both tabs now load
// through loadSettings, and Shipping only builds a save from a
// successful load (shippingSaveBody).

import { describe, it, expect } from "vitest";
import { loadSettings, shippingFromWebsite, shippingSaveBody, type ShippingSettings } from "@/lib/settingsLoad";

/** A fetch that answers once with `status` and `body` (undefined = not JSON). */
function answer(status: number, body?: unknown): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError("Unexpected end of JSON input");
      return body;
    },
  })) as unknown as typeof fetch;
}

const MISSING = "Create your website first — shipping settings are saved with it.";
const load = (f: typeof fetch) => loadSettings("/api/website-builder/generate", shippingFromWebsite, MISSING, f);
// What a failed load used to leave on screen.
const DEFAULTS: ShippingSettings = { mode: "free", rate: "", freeThreshold: "" };

describe("a load that failed is never treated as loaded", () => {
  it("a server error: not loaded, the server's own message shown, and nothing can be saved", async () => {
    const r = await load(answer(500, { error: "Couldn't load your website. (websites query timed out after 8000ms)" }));
    expect(r).toEqual({ ok: false, error: "Couldn't load your website. (websites query timed out after 8000ms)" });
    expect(shippingSaveBody(r, DEFAULTS)).toBeNull();
  });

  it("an expired session: not loaded", async () => {
    const r = await load(answer(401, { error: "Unauthorized" }));
    expect(r.ok).toBe(false);
    expect(shippingSaveBody(r, DEFAULTS)).toBeNull();
  });

  it("an error page that isn't JSON: not loaded, with the status in the message", async () => {
    const r = await load(answer(504));
    expect(r).toEqual({ ok: false, error: "Couldn't load these settings (error 504)." });
  });

  it("no network: not loaded", async () => {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const r = await load(offline);
    expect(r.ok).toBe(false);
    expect(shippingSaveBody(r, DEFAULTS)).toBeNull();
  });

  it("a 200 with no website: there's nothing to save shipping onto, and the owner is told why", async () => {
    const r = await load(answer(200, { website: null, pages: [] }));
    expect(r).toEqual({ ok: false, error: MISSING });
    expect(shippingSaveBody(r, DEFAULTS)).toBeNull();
  });

  it("still loading: nothing can be saved either", () => {
    expect(shippingSaveBody(null, DEFAULTS)).toBeNull();
  });
});

describe("a load that worked shows — and saves — the real settings", () => {
  it("flat ₹60 shipping loads as flat ₹60, not the 'Always Free' default", async () => {
    const r = await load(answer(200, { website: { shipping_mode: "flat", shipping_rate: 60, shipping_free_threshold: null }, pages: [] }));
    expect(r).toEqual({ ok: true, data: { mode: "flat", rate: "60", freeThreshold: "" } });
    expect(shippingSaveBody(r, (r as any).data)).toEqual({ shippingMode: "flat", shippingRate: "60", shippingFreeThreshold: null });
  });

  it("free-above keeps its threshold; free always saves a zero rate", async () => {
    const r = await load(answer(200, { website: { shipping_mode: "free_above", shipping_rate: 50, shipping_free_threshold: 999 } }));
    expect(r.ok && r.data).toEqual({ mode: "free_above", rate: "50", freeThreshold: "999" });
    expect(shippingSaveBody(r, { mode: "free", rate: "50", freeThreshold: "999" })).toEqual({ shippingMode: "free", shippingRate: 0, shippingFreeThreshold: null });
  });

  it("an unknown stored mode falls back to free rather than showing nothing selected", async () => {
    const r = await load(answer(200, { website: { shipping_mode: null } }));
    expect(r.ok && r.data.mode).toBe("free");
  });
});
