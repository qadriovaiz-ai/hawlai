// Meta lead webhook — R2.3 revenue-path coverage.
//
// WHAT THESE COVER: the subscription verification handshake. This is
// the control deciding whether Meta will deliver leads here at all,
// and whether anyone else can subscribe an endpoint they shouldn't.
// A break means either leads stop arriving silently, or a wrong
// verify-token comparison lets an unintended subscriber through.
//
// WHAT THESE DO NOT COVER — stated rather than implied:
//   - The POST handler that actually ingests leads. It fetches from
//     the Meta Graph API and writes to Supabase; both would need
//     mocking, and a mock shaped by my own assumptions about Meta's
//     payload proves little about the real one.
//   - parseFieldData, which maps Meta's field array into a lead. It is
//     module-private and not exported, so it cannot be reached from a
//     test without changing the module's surface to suit the test.
//   - Payload signature verification (X-Hub-Signature-256). Checked
//     while writing these: the POST handler does NOT verify it. That
//     is a real gap, recorded below rather than fixed here.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/webhooks/meta-leads/route";

const VERIFY_TOKEN = "test-verify-token-123";
const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

function subscribeRequest(params: Record<string, string>) {
  const url = new URL("https://example.test/api/webhooks/meta-leads");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe("subscription verification", () => {
  it("echoes the challenge when the token matches", async () => {
    const res = await GET(
      subscribeRequest({
        "hub.mode": "subscribe",
        "hub.verify_token": VERIFY_TOKEN,
        "hub.challenge": "challenge-value-abc",
      })
    );
    expect(res.status).toBe(200);
    // Meta requires the raw challenge as plain text — returning JSON
    // here fails the handshake and no leads ever arrive.
    expect(await res.text()).toBe("challenge-value-abc");
    expect(res.headers.get("Content-Type")).toContain("text/plain");
  });

  it("rejects a wrong verify token", async () => {
    const res = await GET(
      subscribeRequest({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "challenge-value-abc",
      })
    );
    expect(res.status).toBe(403);
  });

  it("rejects a missing verify token", async () => {
    const res = await GET(
      subscribeRequest({ "hub.mode": "subscribe", "hub.challenge": "abc" })
    );
    expect(res.status).toBe(403);
  });

  it("rejects a mode other than subscribe", async () => {
    const res = await GET(
      subscribeRequest({
        "hub.mode": "unsubscribe",
        "hub.verify_token": VERIFY_TOKEN,
        "hub.challenge": "abc",
      })
    );
    expect(res.status).toBe(403);
  });

  it("does not verify when the server has no token configured", async () => {
    // The dangerous shape would be undefined === undefined passing.
    // An unconfigured server must reject everything, not accept
    // anything that also omits the token.
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    const res = await GET(subscribeRequest({ "hub.mode": "subscribe", "hub.challenge": "abc" }));
    expect(res.status).toBe(403);
  });

  it("does not leak the expected token in a rejection", async () => {
    const res = await GET(
      subscribeRequest({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "abc" })
    );
    const body = await res.text();
    expect(body).not.toContain(VERIFY_TOKEN);
  });

  it("handles a request with no parameters at all without throwing", async () => {
    const res = await GET(new Request("https://example.test/api/webhooks/meta-leads"));
    expect(res.status).toBe(403);
  });
});
