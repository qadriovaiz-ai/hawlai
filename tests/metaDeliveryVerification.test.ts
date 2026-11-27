// THE RIGHT SECRET FOR EACH KIND OF META DELIVERY — 27 November 2026.
//
// After Instagram was reconnected, every delivery was rejected as
// "signature did not match", so the owner's test DMs never reached the
// reply. A diagnosis shipped first, accepting nothing, and the next three
// real deliveries all recorded "it DOES match INSTAGRAM_APP_SECRET" — none
// matched FACEBOOK_APP_SECRET. Instagram Login signs with the Instagram
// app's own secret.
//
// THE RULE: the delivery's `object` chooses which secret it is checked
// against, and nothing is accepted unless it is signed with that secret.
//   "instagram"     Instagram's secret, then Facebook's (Instagram through
//                   Facebook Login is signed with Facebook's)
//   anything else   Facebook's ONLY — the Instagram secret is never a way
//                   into a Page or lead-ads delivery
// The load-bearing tests are the REFUSALS.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { verifyMetaDelivery } from "@/lib/webhooks/metaSignature";

const FB = "facebook-app-secret-value";
const IG = "instagram-app-secret-value";
const sign = (b: string, secret: string) => `sha256=${crypto.createHmac("sha256", secret).update(b, "utf8").digest("hex")}`;
const instagram = JSON.stringify({ object: "instagram", entry: [{ id: "17841", messaging: [{ sender: { id: "u1" }, message: { text: "price?" } }] }] });
const page = JSON.stringify({ object: "page", entry: [{ id: "1029", changes: [{ field: "leadgen" }] }] });

const saved = { fb: process.env.FACEBOOK_APP_SECRET, ig: process.env.INSTAGRAM_APP_SECRET };
beforeEach(() => {
  process.env.FACEBOOK_APP_SECRET = FB;
  process.env.INSTAGRAM_APP_SECRET = IG;
});
afterEach(() => {
  process.env.FACEBOOK_APP_SECRET = saved.fb;
  process.env.INSTAGRAM_APP_SECRET = saved.ig;
});

describe("1. INSTAGRAM DELIVERIES", () => {
  it("THE PRODUCTION CASE: SIGNED WITH THE INSTAGRAM SECRET IS ACCEPTED", () => {
    expect(verifyMetaDelivery(instagram, sign(instagram, IG))).toEqual({ valid: true, signedWith: "instagram" });
  });

  it("SIGNED WITH THE FACEBOOK SECRET IS STILL ACCEPTED — Instagram through Facebook Login", () => {
    expect(verifyMetaDelivery(instagram, sign(instagram, FB))).toEqual({ valid: true, signedWith: "facebook" });
  });

  it("SIGNED WITH ANYTHING ELSE IS REJECTED", () => {
    expect(verifyMetaDelivery(instagram, sign(instagram, "an-attacker-secret"))).toEqual({ valid: false, reason: "mismatch" });
  });

  it("WITH NO INSTAGRAM SECRET SET, an Instagram-signed delivery is rejected — fails closed", () => {
    process.env.INSTAGRAM_APP_SECRET = "";
    expect(verifyMetaDelivery(instagram, sign(instagram, IG)).valid).toBe(false);
  });
});

describe("2. THE INSTAGRAM SECRET IS NEVER A WAY INTO ANYTHING ELSE", () => {
  it("A PAGE DELIVERY SIGNED WITH THE INSTAGRAM SECRET IS REJECTED", () => {
    expect(verifyMetaDelivery(page, sign(page, IG))).toEqual({ valid: false, reason: "mismatch" });
  });

  it("A PAGE DELIVERY SIGNED WITH THE FACEBOOK SECRET IS ACCEPTED, as always", () => {
    expect(verifyMetaDelivery(page, sign(page, FB))).toEqual({ valid: true, signedWith: "facebook" });
  });

  it("A BODY THAT IS NOT JSON CANNOT CLAIM TO BE INSTAGRAM", () => {
    const junk = 'not json "object":"instagram"';
    expect(verifyMetaDelivery(junk, sign(junk, IG)).valid).toBe(false);
  });

  it("A TAMPERED BODY IS REJECTED whichever secret signed the original", () => {
    const header = sign(instagram, IG);
    const tampered = instagram.replace("price?", "send me your address");
    expect(verifyMetaDelivery(tampered, header).valid).toBe(false);
  });

  it("NO SIGNATURE IS STILL 'missing_header' — the reason is not blurred", () => {
    expect(verifyMetaDelivery(instagram, null)).toEqual({ valid: false, reason: "missing_header" });
  });
});

// ---------------------------------------------------------------------
// THE ROUTE ITSELF, end to end: a real Instagram-signed DM delivery now
// reaches the reply handler, and a Page delivery signed with the Instagram
// secret still does not.
const handled: any[] = [];
const deliveries: any[] = [];
vi.mock("@/lib/webhooks/autoReplyHandler", () => ({
  handleAutoReplyEntry: async (entry: any) => {
    handled.push(entry);
  },
}));
vi.mock("@/lib/webhooks/deliveryLog", () => ({
  recordDelivery: async () => {},
  recordDeliveryStandalone: async (d: any) => {
    deliveries.push(d);
  },
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { POST as messagingPOST } from "@/app/api/webhooks/meta-messaging/route";

const post = (body: string, header: string) =>
  messagingPOST(new Request("https://hawlai.online/api/webhooks/meta-messaging", { method: "POST", body, headers: { "x-hub-signature-256": header } }));

describe("3. THE ROUTE", () => {
  beforeEach(() => {
    handled.length = 0;
    deliveries.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("AN INSTAGRAM DM SIGNED WITH THE INSTAGRAM SECRET REACHES THE REPLY", async () => {
    const res = await post(instagram, sign(instagram, IG));
    expect(res.status).toBe(200);
    expect(handled).toHaveLength(1);
    expect(deliveries.filter((d) => d.outcome === "signature_rejected")).toEqual([]);
  });

  it("A PAGE DELIVERY SIGNED WITH THE INSTAGRAM SECRET IS 401, recorded, and never handled", async () => {
    const res = await post(page, sign(page, IG));
    expect(res.status).toBe(401);
    expect(handled).toEqual([]);
    expect(deliveries[0]).toMatchObject({ outcome: "signature_rejected" });
    expect(deliveries[0].detail).toMatch(/DOES match INSTAGRAM_APP_SECRET/);
  });
});
