// "Is the post still there?" has three answers, not two.
//
// The unpublish endpoint first used readPostMessage, whose `undefined`
// means BOTH "Facebook says there is no such post" and "Facebook could
// not be asked". Reading that as proof of removal meant a rate limit, an
// expired token or a 503 would have told the owner her still-public post
// was gone — an unverified assumption stated as a fact, which is the
// same mistake as the 8 Oct 2026 incident itself.
//
// These are the actual Graph response shapes, byte for byte as the API
// returns them, driven through the real function.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkPostPresence } from "@/lib/agents/socialMediaAgent";

let served: (() => any) | null = null;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const out = served!();
      if (out instanceof Error) throw out;
      return out;
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

const graph = (status: number, body: any) => () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe("whether a post is still on the Page", () => {
  it("GONE: the object cannot be loaded — this is what a deleted post looks like", async () => {
    // Verbatim from Graph after a successful delete.
    served = graph(400, {
      error: {
        message:
          "Unsupported get request. Object with ID 'PAGE1_123' does not exist, cannot be loaded due to missing permissions, or does not exist",
        type: "GraphMethodException",
        code: 100,
        error_subcode: 33,
      },
    });
    expect(await checkPostPresence("PAGE1_123", "TOKEN")).toEqual({ state: "gone" });
  });

  it("GONE: a bare 404 is still Facebook saying it isn't there", async () => {
    served = graph(404, null);
    expect((await checkPostPresence("PAGE1_123", "TOKEN")).state).toBe("gone");
  });

  it("PRESENT: the object came back", async () => {
    served = graph(200, { id: "PAGE1_123" });
    expect((await checkPostPresence("PAGE1_123", "TOKEN")).state).toBe("present");
  });

  it("UNKNOWN: an expired token says nothing about the post", async () => {
    served = graph(400, {
      error: {
        message: "Error validating access token: Session has expired",
        type: "OAuthException",
        code: 190,
      },
    });
    const r = await checkPostPresence("PAGE1_123", "TOKEN");
    expect(r.state).toBe("unknown");
    // Facebook's own words travel to the owner, not a paraphrase.
    expect(r.detail).toMatch(/Session has expired/);
  });

  it("UNKNOWN: a rate limit is not a removal", async () => {
    served = graph(400, {
      error: { message: "(#4) Application request limit reached", type: "OAuthException", code: 4 },
    });
    const r = await checkPostPresence("PAGE1_123", "TOKEN");
    expect(r.state).toBe("unknown");
    expect(r.detail).toMatch(/request limit reached/);
  });

  it("UNKNOWN: Facebook being down is not a removal", async () => {
    served = graph(503, null);
    const r = await checkPostPresence("PAGE1_123", "TOKEN");
    expect(r.state).toBe("unknown");
    expect(r.detail).toMatch(/HTTP 503/);
  });

  it("UNKNOWN: an unreachable network is not a removal", async () => {
    served = () => new Error("fetch failed");
    const r = await checkPostPresence("PAGE1_123", "TOKEN");
    expect(r.state).toBe("unknown");
    expect(r.detail).toMatch(/fetch failed/);
  });

  it("UNKNOWN: a 200 with nothing recognisable in it is not evidence either way", async () => {
    served = graph(200, {});
    expect((await checkPostPresence("PAGE1_123", "TOKEN")).state).toBe("unknown");
  });

  it("the token never appears in what the owner is told", async () => {
    served = graph(400, { error: { message: "Error validating access token: Session has expired", code: 190 } });
    const r = await checkPostPresence("PAGE1_123", "SECRET_TOKEN_VALUE");
    expect(JSON.stringify(r)).not.toMatch(/SECRET_TOKEN_VALUE/);
  });
});
