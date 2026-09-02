// Canva OAuth PKCE — restored from the harness written with the OAuth
// flow (commit 5f59adc).
//
// These assert conformance to RFC 7636 as Canva requires it. A
// verifier outside the charset or length range is rejected by Canva's
// token endpoint with a generic error, which is a slow thing to debug
// against a live API — cheap to catch here instead.

import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";

beforeAll(() => {
  process.env.CANVA_CLIENT_ID = "test-client-id";
  process.env.CANVA_CLIENT_SECRET = "test-client-secret";
  process.env.CANVA_REDIRECT_URI = "https://example.test/api/canva/oauth/callback";
});

async function mod() {
  return import("@/lib/canva/client");
}

describe("PKCE verifier", () => {
  it("is within RFC 7636's 43-128 character range", async () => {
    const { generateCodeVerifier } = await mod();
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it("uses only unreserved characters", async () => {
    const { generateCodeVerifier } = await mod();
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("is different on every call", async () => {
    const { generateCodeVerifier } = await mod();
    const seen = new Set(Array.from({ length: 20 }, () => generateCodeVerifier()));
    expect(seen.size).toBe(20);
  });
});

describe("PKCE challenge", () => {
  it("is base64url with no padding", async () => {
    const { generateCodeVerifier, codeChallengeFor } = await mod();
    const challenge = codeChallengeFor(generateCodeVerifier());
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(challenge).not.toContain("=");
  });

  it("is 43 characters — a base64url SHA-256 digest", async () => {
    const { generateCodeVerifier, codeChallengeFor } = await mod();
    expect(codeChallengeFor(generateCodeVerifier())).toHaveLength(43);
  });

  it("is deterministic for a given verifier", async () => {
    const { generateCodeVerifier, codeChallengeFor } = await mod();
    const v = generateCodeVerifier();
    expect(codeChallengeFor(v)).toBe(codeChallengeFor(v));
  });

  it("differs for different verifiers", async () => {
    const { generateCodeVerifier, codeChallengeFor } = await mod();
    expect(codeChallengeFor(generateCodeVerifier())).not.toBe(codeChallengeFor(generateCodeVerifier()));
  });

  it("is genuinely S256, matching an independent SHA-256", async () => {
    const { generateCodeVerifier, codeChallengeFor } = await mod();
    const v = generateCodeVerifier();
    // Computed here rather than trusting the implementation's own
    // claim — this is what proves the method is S256 and not plain.
    const expected = crypto.createHash("sha256").update(v).digest("base64url");
    expect(codeChallengeFor(v)).toBe(expected);
  });
});

describe("authorize URL", () => {
  it("carries every parameter Canva requires", async () => {
    const { buildAuthorizeUrl, generateCodeVerifier, codeChallengeFor } = await mod();
    const url = new URL(buildAuthorizeUrl("state-123", codeChallengeFor(generateCodeVerifier())));

    expect(url.origin + url.pathname).toBe("https://www.canva.com/api/oauth/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("requests the scopes the integration actually needs, and no more", async () => {
    const { CANVA_SCOPES } = await mod();
    const scopes = CANVA_SCOPES.split(" ");
    // design:content:read is the one that is easy to drop by mistake:
    // it is what the EXPORT endpoint requires, and there is no
    // separate export scope.
    expect(scopes).toContain("design:content:read");
    expect(scopes).toContain("design:content:write");
    expect(scopes).toContain("asset:write");
    // Each extra scope is another line on a dealer's consent screen.
    expect(scopes).not.toContain("folder:write");
    expect(scopes).not.toContain("comment:write");
  });

  it("never puts the client secret in the authorize URL", async () => {
    const { buildAuthorizeUrl, generateCodeVerifier, codeChallengeFor } = await mod();
    const url = buildAuthorizeUrl("s", codeChallengeFor(generateCodeVerifier()));
    // The authorize URL goes into the browser address bar. The secret
    // belongs only in the server-side token exchange's Basic header.
    expect(url).not.toContain("test-client-secret");
  });

  it("reports configuration state without throwing when vars are absent", async () => {
    const { isCanvaConfigured } = await mod();
    expect(isCanvaConfigured()).toBe(true);
    const saved = process.env.CANVA_CLIENT_SECRET;
    delete process.env.CANVA_CLIENT_SECRET;
    expect(isCanvaConfigured()).toBe(false);
    process.env.CANVA_CLIENT_SECRET = saved;
  });
});
