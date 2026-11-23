// Who is allowed to post to the WhatsApp webhook.
//
// THE HOLE, live in production until 23 November 2026 and found while
// auditing the move to Meta Cloud API.
//
// /api/webhooks/whatsapp authenticated NOBODY. middleware.ts's matcher
// explicitly excludes api/webhooks; the route contained zero
// occurrences of signature, hmac, x-hub, verify_token, authorization
// or secret; and it exported POST only. The sole thing identifying the
// caller was the phone number IN THE REQUEST BODY, which the caller
// writes — `owner_whatsapp_verified` checks the stored row, not the
// sender.
//
// So anyone who knew the URL and a connected owner's WhatsApp number
// could post a forged body and reach Master Chat AS THAT OWNER with
// full tool access, and APPROVE n on anything pending below critical
// tier. Neither fact is a secret: the number is usually printed on the
// business's own website.
//
// IT WAS KNOWN AND RECORDED. metaSignature.ts's header says so, and
// the reason it stayed open was right at the time: Gupshup does not
// sign its deliveries, so there was no signature to check. Going
// direct to Meta removes the obstacle.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  verifyWhatsAppSender,
  whatsappChallenge,
  describeWhatsAppRejection,
  SHARED_SECRET_HEADER,
} from "@/lib/whatsapp/verifySender";
import { code, sourceWithComments } from "./helpers/source";

const ROUTE = "src/app/api/webhooks/whatsapp/route.ts";
const APP_SECRET = "an-app-secret";
const SHARED = "a-shared-secret";
const BODY = JSON.stringify({ entry: [{ changes: [] }] });

function signed(body: string, secret = APP_SECRET): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

const headers = (h: Record<string, string> = {}) => new Headers(h);

let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = {
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
    WHATSAPP_WEBHOOK_SECRET: process.env.WHATSAPP_WEBHOOK_SECRET,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  };
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_WEBHOOK_SECRET;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("1. IT FAILS CLOSED, INCLUDING WHEN NOTHING IS CONFIGURED", () => {
  it("THE LOAD-BEARING ONE: no secret set means every delivery is refused", () => {
    // "No secret, so skip the check" turns the fix back into the hole,
    // silently, on exactly the deploy where someone forgot. This is the
    // assertion that keeps the direction right.
    const v = verifyWhatsAppSender(BODY, headers({ "x-hub-signature-256": signed(BODY) }));
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toBe("not_configured");
  });

  it("and the refusal says what to set, because it looks identical to an attack", () => {
    // A misconfiguration and a forged request both show up as "every
    // delivery refused". Only the sentence distinguishes them.
    const v = verifyWhatsAppSender(BODY, headers());
    expect(v.ok).toBe(false);
    const said = describeWhatsAppRejection(v as any);
    expect(said).toMatch(/WHATSAPP_APP_SECRET/);
    expect(said).toMatch(/nothing will arrive/i);
  });
});

describe("2. META'S SIGNATURE, OVER THE RAW BODY", () => {
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  });

  it("THE LOAD-BEARING ONE: a correctly signed body is accepted", () => {
    const v = verifyWhatsAppSender(BODY, headers({ "x-hub-signature-256": signed(BODY) }));
    expect(v.ok, !v.ok ? v.detail : "").toBe(true);
    expect(v.ok && v.via).toBe("meta_signature");
  });

  it("A BODY CHANGED BY ONE BYTE IS REJECTED", () => {
    // Not vacuous — this is the whole point of signing. The signature
    // is computed over the original and the body is what arrives.
    const tampered = BODY.replace("entry", "entrY");
    const v = verifyWhatsAppSender(tampered, headers({ "x-hub-signature-256": signed(BODY) }));
    expect(v.ok).toBe(false);
  });

  it("a signature made with the wrong secret is rejected", () => {
    const v = verifyWhatsAppSender(BODY, headers({ "x-hub-signature-256": signed(BODY, "someone-elses-secret") }));
    expect(v.ok).toBe(false);
  });

  it("a missing or malformed header is rejected, and does not throw", () => {
    // timingSafeEqual throws on a length mismatch, so a short
    // signature must be refused rather than crashing the route — a 500
    // where a 401 belongs.
    for (const h of [{}, { "x-hub-signature-256": "" }, { "x-hub-signature-256": "sha256=" }, { "x-hub-signature-256": "sha256=abc" }, { "x-hub-signature-256": "md5=" + "0".repeat(64) }]) {
      const v = verifyWhatsAppSender(BODY, headers(h as Record<string, string>));
      expect(v.ok, JSON.stringify(h)).toBe(false);
    }
  });

  it("IT DOES NOT FALL THROUGH TO THE WEAKER SCHEME", () => {
    // The downgrade that would undo the whole thing: a caller who can
    // set a header omits the signature and presents the shared secret
    // instead. With an app secret configured, the signature is the
    // only door.
    process.env.WHATSAPP_WEBHOOK_SECRET = SHARED;
    const v = verifyWhatsAppSender(BODY, headers({ [SHARED_SECRET_HEADER]: SHARED }));
    expect(v.ok, "a caller downgraded past the signature").toBe(false);
    expect(!v.ok && v.reason).toBe("bad_signature");
  });
});

describe("3. THE SHARED SECRET, for a provider that does not sign", () => {
  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_SECRET = SHARED;
  });

  it("THE LOAD-BEARING ONE: the right header is accepted, a wrong one is not", () => {
    expect(verifyWhatsAppSender(BODY, headers({ [SHARED_SECRET_HEADER]: SHARED })).ok).toBe(true);
    expect(verifyWhatsAppSender(BODY, headers({ [SHARED_SECRET_HEADER]: "wrong" })).ok).toBe(false);
    expect(verifyWhatsAppSender(BODY, headers()).ok).toBe(false);
  });

  it("THE COMPARISON IS CONSTANT-TIME, which behaviour cannot show", () => {
    // Accept/reject is identical with `===`, and a mutation to `===`
    // SURVIVED every behavioural assertion here. Timing-safety is a
    // choice of FUNCTION, so the function is what is asserted — one of
    // the few places where naming the implementation is the property
    // rather than a proxy for it.
    const src = code("src/lib/whatsapp/verifySender.ts");
    expect(src).toMatch(/crypto\.timingSafeEqual\(left, right\)/);
    expect(src, "a secret is compared with ===").not.toMatch(/return a === b;/);
  });

  it("a near-miss of a different length does not throw", () => {
    // Same timingSafeEqual hazard as the signature path.
    expect(verifyWhatsAppSender(BODY, headers({ [SHARED_SECRET_HEADER]: SHARED + "x" })).ok).toBe(false);
    expect(verifyWhatsAppSender(BODY, headers({ [SHARED_SECRET_HEADER]: "" })).ok).toBe(false);
  });
});

describe("4. THE SUBSCRIPTION HANDSHAKE Meta performs first", () => {
  it("THE LOAD-BEARING ONE: the right token gets the challenge echoed", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "the-token";
    const r = whatsappChallenge("https://x.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=the-token&hub.challenge=12345");
    expect(r.ok, !r.ok ? r.detail : "").toBe(true);
    expect(r.ok && r.challenge).toBe("12345");
  });

  it("AN UNSET TOKEN REFUSES, rather than matching an absent parameter", () => {
    // `token === expectedToken` with both undefined is TRUE, and that
    // would hand the challenge to anyone who asked.
    const r = whatsappChallenge("https://x.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=12345");
    expect(r.ok).toBe(false);

    // AND WITH A TOKEN PRESENT, which is the case the line above
    // cannot reach: it short-circuits on the MISSING token, so a
    // mutation deleting the "expected is unset" guard SURVIVED it.
    // Anyone who guesses a token must not be able to subscribe a
    // webhook to this endpoint just because the owner never set one.
    const withToken = whatsappChallenge("https://x.test/w?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=1");
    expect(withToken.ok, "an unset token accepted a guessed one").toBe(false);
  });

  it("a wrong token, a wrong mode and a missing challenge are all refused", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "the-token";
    for (const q of [
      "hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1",
      "hub.mode=unsubscribe&hub.verify_token=the-token&hub.challenge=1",
      "hub.mode=subscribe&hub.verify_token=the-token",
    ]) {
      expect(whatsappChallenge(`https://x.test/w?${q}`).ok, q).toBe(false);
    }
  });
});

describe("5. THE ROUTE CHECKS BEFORE IT PARSES", () => {
  it("THE LOAD-BEARING ONE: the body is read raw, and verified before JSON.parse", () => {
    // Two failures in one if this order slips. The digest is over the
    // exact bytes, so request.json() makes it unmatchable; and a
    // forged payload parsed first has already been read by the time
    // anyone checks who sent it.
    const src = code(ROUTE);
    const rawAt = src.indexOf("await request.text()");
    const verifyAt = src.indexOf("verifyWhatsAppSender(");
    const parseAt = src.indexOf("JSON.parse(rawBody)");
    expect(rawAt, "the body is not read raw").toBeGreaterThan(-1);
    expect(verifyAt, "nothing verifies the sender").toBeGreaterThan(rawAt);
    expect(parseAt, "the body is parsed before the sender is verified").toBeGreaterThan(verifyAt);
    // And request.json() is gone — it would consume the stream.
    expect(src, "request.json() consumes the body the digest needs").not.toMatch(/await request\.json\(\)/);
  });

  it("an unverified sender gets 401 and reaches nothing", () => {
    const src = code(ROUTE);
    const block = src.slice(src.indexOf("verifyWhatsAppSender("), src.indexOf("JSON.parse(rawBody)"));
    expect(block.length).toBeGreaterThan(80);
    // ANCHORED ON THE CONDITION. Position and contents are not
    // liveness: a mutation replacing this with `if (false)` left every
    // string in place — the call, the 401, the record — and SURVIVED.
    // A source test cannot see a dead branch unless the branch's own
    // condition is what it reads.
    expect(block, "the refusal branch can no longer fire").toMatch(/if \(!sender\.ok\) \{/);
    expect(block).toMatch(/status: 401/);
    expect(block).toMatch(/return NextResponse\.json/);
  });

  it("AND THE REFUSAL IS RECORDED, not only logged", () => {
    // A console line in Vercel is invisible to the owner, and "no
    // secret is set" rejecting every delivery looks identical from
    // outside to the provider never calling at all.
    const src = code(ROUTE);
    expect(src).toMatch(/recordDeliveryStandalone\(\{ source: "whatsapp", outcome: "signature_rejected"/);
  });

  it("the route answers Meta's GET handshake at all", () => {
    // It exported POST only, so a Meta webhook could never have been
    // registered against it.
    const src = code(ROUTE);
    expect(src).toMatch(/export async function GET\(/);
    expect(src).toMatch(/whatsappChallenge\(request\.url\)/);
  });

  it("and the reason it was open is written down where the next reader will see it", () => {
    // Read WITH comments deliberately — rule 8's named exception, for
    // when the comment IS the thing being asserted. A later tidy-up
    // that moved the check after the parse would read as harmless
    // without this.
    //
    // NORMALISED BEFORE MATCHING. The sentence is wrapped across two
    // comment lines, so a continuous regex found nothing — and the
    // next re-wrap would break it again for a reason that has nothing
    // to do with the property. Collapsing the comment markers and the
    // whitespace asserts the sentence rather than its line breaks.
    const prose = sourceWithComments(ROUTE)
      .split("\n")
      .map((l) => l.replace(/^\s*\/\/ ?/, ""))
      .join(" ")
      .replace(/\s+/g, " ");
    expect(prose).toMatch(/phone number was the only thing identifying the caller/i);
    expect(prose).toMatch(/and the caller wrote it/i);
  });
});

describe("6. NOTHING LEAKS INTO A LOG LINE", () => {
  it("THE LOAD-BEARING ONE: no rejection sentence carries a secret or a body", () => {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
    process.env.WHATSAPP_WEBHOOK_SECRET = SHARED;
    const said: string[] = [];
    for (const h of [{}, { "x-hub-signature-256": signed(BODY, "wrong") }, { [SHARED_SECRET_HEADER]: SHARED }]) {
      const v = verifyWhatsAppSender(BODY, headers(h as Record<string, string>));
      if (!v.ok) said.push(describeWhatsAppRejection(v));
    }
    expect(said.length).toBeGreaterThan(0);
    for (const line of said) {
      expect(line, line).not.toContain(APP_SECRET);
      expect(line, line).not.toContain(SHARED);
      expect(line, line).not.toContain("entry");
    }
  });
});
