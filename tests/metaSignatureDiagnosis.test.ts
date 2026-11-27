// WHICH SECRET A REJECTED META DELIVERY WAS SIGNED WITH — 27 November 2026.
//
// After Instagram was reconnected, Meta started delivering, and every
// delivery was rejected with "signature did not match" — the owner's test
// DMs among them. Both Meta routes verify against FACEBOOK_APP_SECRET; an
// app using Instagram Login also has an Instagram app secret, and Meta's
// documentation does not say which one signs. So the rejection now records
// which secret matches, and the fix waits for that evidence.
//
// THE LOAD-BEARING HALF IS THE NEGATIVE ONE: a delivery the Instagram
// secret would accept is STILL REJECTED. This is a diagnosis, not a door.

import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";
import { code } from "./helpers/source";
import { verifyMetaSignature, rejectionDiagnosis } from "@/lib/webhooks/metaSignature";

const FB = "facebook-app-secret-value";
const IG = "instagram-app-secret-value";
const body = JSON.stringify({ object: "instagram", entry: [{ id: "1784", messaging: [{ message: { text: "price?" } }] }] });
const sign = (b: string, secret: string) => `sha256=${crypto.createHmac("sha256", secret).update(b, "utf8").digest("hex")}`;

const saved = { fb: process.env.FACEBOOK_APP_SECRET, ig: process.env.INSTAGRAM_APP_SECRET };
afterEach(() => {
  process.env.FACEBOOK_APP_SECRET = saved.fb;
  process.env.INSTAGRAM_APP_SECRET = saved.ig;
});

describe("1. THE DIAGNOSIS SAYS WHICH SECRET MATCHES", () => {
  it("A DELIVERY SIGNED WITH THE INSTAGRAM SECRET IS NAMED AS SUCH", () => {
    process.env.FACEBOOK_APP_SECRET = FB;
    process.env.INSTAGRAM_APP_SECRET = IG;
    expect(rejectionDiagnosis(body, sign(body, IG))).toMatch(/DOES match INSTAGRAM_APP_SECRET/);
  });

  it("ONE SIGNED WITH NEITHER SAYS SO — a third secret, or a rotated one", () => {
    process.env.FACEBOOK_APP_SECRET = FB;
    process.env.INSTAGRAM_APP_SECRET = IG;
    expect(rejectionDiagnosis(body, sign(body, "something-else"))).toMatch(/matches neither/);
  });

  it("NO INSTAGRAM SECRET TO COMPARE IS SAID, not guessed", () => {
    process.env.INSTAGRAM_APP_SECRET = "";
    expect(rejectionDiagnosis(body, sign(body, IG))).toMatch(/INSTAGRAM_APP_SECRET is not set/);
  });

  it("IT NEVER CARRIES A SECRET OR THE BODY", () => {
    process.env.INSTAGRAM_APP_SECRET = IG;
    for (const header of [sign(body, IG), sign(body, "x")]) {
      const d = rejectionDiagnosis(body, header);
      expect(d).not.toContain(IG);
      expect(d).not.toContain(FB);
      expect(d).not.toContain("price?");
    }
  });
});

// CHANGED 27 NOVEMBER 2026, ON THE OWNER'S EXPLICIT INSTRUCTION, after this
// diagnosis did its job: three real deliveries all matched
// INSTAGRAM_APP_SECRET. This section used to hold that the routes call
// verifyMetaSignature once with no override — "not a door" — because the
// evidence was not in yet. The routes now verify with verifyMetaDelivery,
// whose own tests (tests/metaDeliveryVerification.test.ts) hold the new,
// narrower rule: the Instagram secret opens ONLY deliveries that say they
// are Instagram. What stays pinned here: the diagnosis feeds nothing but
// the recorded reason, and a rejection is still a 401.
describe("2. THE DIAGNOSIS FEEDS ONLY THE RECORDED REASON", () => {
  it("verifyMetaSignature ITSELF STILL DEFAULTS TO FACEBOOK_APP_SECRET", () => {
    process.env.FACEBOOK_APP_SECRET = FB;
    process.env.INSTAGRAM_APP_SECRET = IG;
    expect(verifyMetaSignature(body, sign(body, IG))).toEqual({ valid: false, reason: "mismatch" });
  });

  for (const route of ["src/app/api/webhooks/meta-leads/route.ts", "src/app/api/webhooks/meta-messaging/route.ts"]) {
    it(`${route.split("/").at(-2)}: the diagnosis only feeds the recorded reason, and the 401 still follows`, () => {
      const src = code(route);
      const start = src.indexOf("if (!signature.valid) {");
      const end = src.indexOf("status: 401", start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      const block = src.slice(start, end);
      // Called inside the rejection branch, into `why`, and nowhere that
      // could change the outcome.
      expect(block).toMatch(/rejectionDiagnosis\(rawBody, request\.headers\.get\("x-hub-signature-256"\)\)/);
      expect(block).toMatch(/outcome: "signature_rejected", detail: why/);
      // ONE verification, through the one function that knows which secret
      // goes with which kind of delivery — and no direct call that could
      // pass a secret of its own.
      expect(src.match(/verifyMetaDelivery\(/g)).toHaveLength(1);
      expect(src).toMatch(/verifyMetaDelivery\(rawBody, request\.headers\.get\("x-hub-signature-256"\)\)/);
      expect(src).not.toMatch(/verifyMetaSignature\(/);
    });
  }
});
