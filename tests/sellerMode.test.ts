// SELLER MODE: THE SWITCH, AND WHERE CUSTOMERS PAY — 28 November 2026, F4 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct revision).
//
// A capability any business can switch on, website or not. Customers pay
// the SELLER's own UPI ID; Hawlai never holds money. Switching it on needs
// three things true; switching it off never needs anything.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { code } from "./helpers/source";

// ---- the owner's session ----------------------------------------------
let row: Record<string, any>;
let updates: Record<string, any>[];
let updateError: any = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        order: () => api,
        limit: async () => ({ data: [], error: null }),
        single: async () => ({ data: table === "profiles" ? { dealership_id: "d1" } : row, error: null }),
        update: (u: Record<string, any>) => {
          updates.push(u);
          return { eq: async () => ({ error: updateError }) };
        },
      };
      return api;
    },
  }),
}));

import { MAX_VPA_LENGTH, normaliseShippingFee, normaliseVpa, sellerModeBlocker, SELLER_MODE_TAKES_ORDERS } from "@/lib/dm/sellerMode";
import { GET, PATCH } from "@/app/api/social/auto-reply-settings/route";

const patch = async (body: any) => {
  const res = await PATCH(new Request("https://hawlai.online/api/social/auto-reply-settings", { method: "PATCH", body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

const READY = { instagram_business_id: "17841", seller_upi_vpa: "shop@okhdfcbank", dm_auto_reply_enabled: true, instagram_selling_enabled: false, fb_page_id: null };

beforeEach(() => {
  row = { ...READY };
  updates = [];
  updateError = null;
});

describe("1. A UPI ID THAT CAN BE PAID", () => {
  it("TRIMMED AND LOWER-CASED — UPI IDs are case-insensitive, and a stray space fails a payment", () => {
    expect(normaliseVpa("  Shop.Name@OKHDFCBANK ")).toEqual({ ok: true, vpa: "shop.name@okhdfcbank" });
    expect(normaliseVpa("9876543210@ybl")).toEqual({ ok: true, vpa: "9876543210@ybl" });
  });

  it("REFUSED WITH A REASON THE OWNER CAN ACT ON — never 'corrected' into someone else's", () => {
    expect(normaliseVpa("")).toMatchObject({ ok: false, reason: expect.stringContaining("Enter your UPI ID") });
    expect(normaliseVpa("shop name@ybl")).toMatchObject({ ok: false, reason: expect.stringContaining("no spaces") });
    expect(normaliseVpa("shopname")).toMatchObject({ ok: false, reason: expect.stringContaining("@") });
    expect(normaliseVpa("shop@1bank")).toMatchObject({ ok: false });
    expect(normaliseVpa("s@ybl")).toMatchObject({ ok: false });
  });

  it("THE APP AND THE DATABASE CHECK THE SAME SHAPE AND LENGTH — one rule, in two places on purpose", () => {
    // Reads 246, which replaced 242's constraint (28 Nov 2026). Identical
    // text was never the whole promise: 242's regex was identical in both
    // places and the DATABASE could not run it. The next test is the guard
    // that would have caught that.
    const app = code("src/lib/dm/sellerMode.ts").match(/const VPA = \/(.+?)\/;/)?.[1];
    const sql = readFileSync("supabase/migrations/246_seller_upi_vpa_regex.sql", "utf8").replace(/^\s*--.*$/gm, "");
    const db = sql.match(/seller_upi_vpa ~ '(.+?)'/)?.[1];
    expect(app).toBeTruthy();
    expect(app).toBe(db);
    expect(sql).toMatch(new RegExp(`char_length\\(seller_upi_vpa\\) <= ${MAX_VPA_LENGTH}`));
  });

  it("NO REGEX IN ANY MIGRATION USES A REPETITION COUNT POSTGRESQL CANNOT RUN (over 255)", () => {
    // THE INCIDENT (28 Nov 2026): 242's `{2,256}` passed in JavaScript and
    // in `create constraint`, and failed on EVERY save — Postgres compiles
    // a constraint's regex when it is used, and caps a bound at 255
    // (RE_DUP_MAX). The founder's first UPI ID was refused with "invalid
    // regular expression: invalid repetition count(s)".
    const SUPERSEDED: Record<string, string> = {
      "242_seller_mode.sql": "its dealerships_seller_upi_vpa_format is dropped and re-added by 246 — 2026-11-28",
    };
    const offenders: string[] = [];
    for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(`supabase/migrations/${file}`, "utf8").replace(/^\s*--.*$/gm, "");
      for (const m of sql.matchAll(/!?~\*?\s*'((?:[^']|'')*)'/g)) {
        for (const c of m[1].matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
          const big = [c[1], c[2]].filter(Boolean).map(Number).some((n) => n > 255);
          if (big && !SUPERSEDED[file]) offenders.push(`${file}: ${c[0]} in ${m[1].slice(0, 60)}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
    // The allowlist is honest only while 246 really replaces that constraint.
    const fix = readFileSync("supabase/migrations/246_seller_upi_vpa_regex.sql", "utf8").replace(/^\s*--.*$/gm, "");
    expect(fix).toMatch(/drop constraint if exists dealerships_seller_upi_vpa_format;\s*alter table dealerships add constraint dealerships_seller_upi_vpa_format/);
    for (const why of Object.values(SUPERSEDED)) expect(why).toMatch(/20\d\d-\d\d-\d\d/);
  });

  it("AND THE MEASURE WOULD SEE ONE — a probe with {2,256} is caught", () => {
    const probe = "check (x ~ '^[a-z]{2,256}$')";
    const found = [...probe.matchAll(/!?~\*?\s*'((?:[^']|'')*)'/g)].flatMap((m) =>
      [...m[1].matchAll(/\{(\d+)(?:,(\d*))?\}/g)].filter((c) => [c[1], c[2]].filter(Boolean).map(Number).some((n) => n > 255))
    );
    expect(found.length).toBe(1);
  });

  it("A UPI ID LONGER THAN THE DATABASE ALLOWS IS REFUSED BY THE APP FIRST", () => {
    expect(normaliseVpa(`${"a".repeat(MAX_VPA_LENGTH)}@ybl`)).toMatchObject({ ok: false, reason: expect.stringContaining("too long") });
    expect(normaliseVpa(`${"a".repeat(MAX_VPA_LENGTH - 4)}@ybl`)).toMatchObject({ ok: true });
  });
});

describe("2. WHEN IT MAY BE SWITCHED ON", () => {
  it("THE MOST FUNDAMENTAL REASON FIRST: Instagram, then the UPI ID, then DM replies", () => {
    expect(sellerModeBlocker({ ...READY, instagram_business_id: null, seller_upi_vpa: null })).toMatch(/Connect Instagram/);
    expect(sellerModeBlocker({ ...READY, seller_upi_vpa: null, dm_auto_reply_enabled: false })).toMatch(/UPI ID/);
    expect(sellerModeBlocker({ ...READY, dm_auto_reply_enabled: false })).toMatch(/DM auto-reply/);
    expect(sellerModeBlocker(READY)).toBeNull();
  });

  it("ORDER-TAKING IS LIVE, and the screen is told so — switched on 28 Nov 2026, after O3/O4′ and migrations 244 + 245", async () => {
    // Was `false` (F4) until the seller could confirm a payment; this pin
    // was written to change at exactly this step.
    expect(SELLER_MODE_TAKES_ORDERS).toBe(true);
    expect((await (await GET()).json()).takesOrders).toBe(true);
  });
});

describe("3. THE DASHBOARD", () => {
  it("ON, WITH EVERYTHING READY", async () => {
    const r = await patch({ sellingEnabled: true });
    expect(r.status).toBe(200);
    expect(updates[0]).toEqual({ instagram_selling_enabled: true });
  });

  it("ON WITHOUT A UPI ID IS REFUSED, SAYS WHY, AND CHANGES NOTHING", async () => {
    row = { ...READY, seller_upi_vpa: null };
    const r = await patch({ sellingEnabled: true });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Save your UPI ID first/);
    expect(updates).toEqual([]);
  });

  it("CHECKED AGAINST THE STATE IT WOULD LEAVE — DM replies and Seller Mode on together pass", async () => {
    row = { ...READY, dm_auto_reply_enabled: false };
    const r = await patch({ dmEnabled: true, sellingEnabled: true });
    expect(r.status).toBe(200);
    expect(updates[0]).toEqual({ dm_auto_reply_enabled: true, instagram_selling_enabled: true });
  });

  it("OFF IS NEVER REFUSED", async () => {
    row = { instagram_business_id: null, seller_upi_vpa: null, dm_auto_reply_enabled: false, instagram_selling_enabled: true };
    expect((await patch({ sellingEnabled: false })).status).toBe(200);
    expect(updates[0]).toEqual({ instagram_selling_enabled: false });
  });

  it("DM REPLIES OFF TAKES SELLER MODE WITH IT — it answers through them", async () => {
    await patch({ dmEnabled: false });
    expect(updates[0]).toEqual({ dm_auto_reply_enabled: false, instagram_selling_enabled: false });
  });

  it("AND A REQUEST TO KEEP SELLING WHILE TURNING DM REPLIES OFF STILL ENDS WITH SELLING OFF", async () => {
    await patch({ dmEnabled: false, sellingEnabled: true });
    expect(updates[0]).toEqual({ dm_auto_reply_enabled: false, instagram_selling_enabled: false });
  });

  it("CLEARING THE UPI ID TAKES SELLER MODE WITH IT — nowhere left to pay", async () => {
    await patch({ upiVpa: "" });
    expect(updates[0]).toEqual({ seller_upi_vpa: null, instagram_selling_enabled: false });
  });

  it("A UPI ID IS SAVED NORMALISED; A BAD ONE IS REFUSED WITH THE REASON", async () => {
    await patch({ upiVpa: " Shop@OKAXIS " });
    expect(updates[0]).toEqual({ seller_upi_vpa: "shop@okaxis" });
    const bad = await patch({ upiVpa: "shop axis" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/no spaces/);
  });

  it("THE CARD CLEARS EVERY 'Saved.' NOTE BEFORE ANY SAVE — a failed UPI save never sits beside the fee's old one", () => {
    // 28 Nov 2026: the founder saw an error and "Saved." together. save()
    // already read the server's answer; the "Saved." was the delivery
    // fee's, left over, because each field cleared only its own note.
    // There is no DOM test setup here, so the function is read, bounded at
    // both ends (Rule 8).
    const src = code("src/components/social/AutoReplySettings.tsx");
    const start = src.indexOf("async function save(change: Record<string, unknown>): Promise<boolean> {");
    const end = src.indexOf("async function saveVpa()", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const save = src.slice(start, end);
    const fetchAt = save.indexOf("await fetch(");
    expect(save.indexOf("setVpaNote(null);")).toBeGreaterThan(-1);
    expect(save.indexOf("setFeeNote(null);")).toBeGreaterThan(-1);
    expect(save.indexOf("setVpaNote(null);")).toBeLessThan(fetchAt);
    expect(save.indexOf("setFeeNote(null);")).toBeLessThan(fetchAt);
    // And a note is set only after save() reports success.
    expect(src).toMatch(/if \(await save\(\{ upiVpa: vpaInput \}\)\) setVpaNote\("Saved\."\);/);
    expect(src).toMatch(/if \(await save\(\{ shippingFee: feeInput \}\)\) setFeeNote\("Saved\."\);/);
    expect(save).toMatch(/if \(!res\.ok\) \{\s*setError\([^)]*\);\s*return false;\s*\}/);
  });

  it("A SAVE THE DATABASE REFUSES SAYS WHICH ONE FAILED, then the cause — and nothing reads as saved", async () => {
    updateError = { message: "invalid regular expression: invalid repetition count(s)" };
    const r = await patch({ upiVpa: "shop@okhdfcbank" });
    expect(r.status).toBe(500);
    expect(r.body.error).toBe("Your UPI ID wasn't saved: invalid regular expression: invalid repetition count(s)");
    expect(r.body.success).toBeUndefined();
  });

  it("AN INSTAGRAM-ONLY BUSINESS IS CONNECTED — this card used to require a Facebook Page", async () => {
    row = { ...READY, fb_page_id: null };
    const d = await (await GET()).json();
    expect(d).toMatchObject({ connected: true, instagramConnected: true, facebookConnected: false });
  });
});

describe("5. THE DELIVERY FEE — migration 243, the founder's call: one flat number", () => {
  it("EMPTY IS FREE DELIVERY; ₹ AND COMMAS ARE HOW SELLERS WRITE MONEY", () => {
    expect(normaliseShippingFee("")).toEqual({ ok: true, fee: 0 });
    expect(normaliseShippingFee(null)).toEqual({ ok: true, fee: 0 });
    expect(normaliseShippingFee("60")).toEqual({ ok: true, fee: 60 });
    expect(normaliseShippingFee(" ₹1,200 ")).toEqual({ ok: true, fee: 1200 });
    expect(normaliseShippingFee("49.50")).toEqual({ ok: true, fee: 49.5 });
    expect(normaliseShippingFee(75)).toEqual({ ok: true, fee: 75 });
  });

  it("REFUSED, NEVER ROUNDED — the customer is quoted this number", () => {
    for (const bad of ["-10", "abc", "12.345", "1e3", "100001"]) {
      expect(normaliseShippingFee(bad), bad).toMatchObject({ ok: false });
    }
    expect(normaliseShippingFee("100000")).toEqual({ ok: true, fee: 100000 });
  });

  it("THE APP'S CEILING IS THE DATABASE'S", () => {
    const db = readFileSync("supabase/migrations/243_seller_shipping_fee.sql", "utf8");
    expect(db).toMatch(/seller_shipping_fee >= 0 and seller_shipping_fee <= 100000/);
  });

  it("SAVED FROM THE CARD, NORMALISED; A BAD ONE IS REFUSED WITH THE REASON", async () => {
    await patch({ shippingFee: "₹60" });
    expect(updates[0]).toEqual({ seller_shipping_fee: 60 });
    await patch({ shippingFee: "" });
    expect(updates[1]).toEqual({ seller_shipping_fee: 0 });
    const bad = await patch({ shippingFee: "free" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/delivery fee in rupees/);
    expect(updates.length).toBe(2);
  });

  it("AND READ BACK FOR THE CARD", async () => {
    row = { ...READY, seller_shipping_fee: 49.5 };
    expect((await (await GET()).json()).shippingFee).toBe(49.5);
  });
});

// The other two doors, read with comments stripped and bounded (Rule 8).
describe("4. THE CHAT TOOL AND THE APPROVAL CHECK THE SAME RULE", () => {
  it("THE CHAT TOOL CHECKS BEFORE IT ASKS — no approval card that cannot work", () => {
    const src = code("src/lib/agents/masterBrainV2.ts");
    const start = src.indexOf('case "set_automation_toggle": {');
    const end = src.indexOf('case "propose_price_change": {', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const tool = src.slice(start, end);
    // THE CONDITION IS THE ANCHOR, not the call inside it. A first version
    // looked for `sellerModeBlocker(row)` alone, and a mutation wrapping
    // the whole check in `if (false)` survived it — the text was still
    // there. Now the guard's own condition, the call and the early return
    // must appear together, before the approval is requested.
    const guard = tool.match(/if \(input\.toggle === "instagram_selling"\) \{[\s\S]*?const blocker = sellerModeBlocker\(row\);\s*if \(blocker\) return \{ error: blocker \};/);
    expect(guard, "the chat tool must check Seller Mode's preconditions under its own condition").toBeTruthy();
    expect(tool.indexOf(guard![0])).toBeLessThan(tool.indexOf("requestApproval(supabase"));
    expect(tool).toMatch(/instagram_selling: "instagram_selling_enabled"/);
    expect(tool).toMatch(/input\.toggle === "dm_auto_reply" \? \{ instagram_selling_enabled: false \}/);
  });

  it("THE APPROVAL CHECKS AGAIN, AT THE MOMENT IT IS APPLIED", () => {
    const src = code("src/lib/approvals/decide.ts");
    const start = src.indexOf('if (approval?.action_type === "set_automation_toggle") {');
    const end = src.indexOf(".update({ [field]: true })", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).toMatch(/instagram_selling: "instagram_selling_enabled"/);
    expect(block).toMatch(/if \(d\.toggle === "instagram_selling"\) \{[\s\S]*?sellerModeBlocker\(row\)[\s\S]*?status: 409/);
  });
});
