// A visual email sent through a business's own Gmail arrives as the
// visual email — Gmail's send API is given the HTML part, not just text.

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/crypto/oauthSecrets", () => ({
  tokenSelect: () => "gmail_access_token",
  readToken: () => "ACCESS",
  tokenWrite: () => ({}),
}));

import { sendEmail } from "@/lib/agents/gmailAgent";

function db() {
  const api: any = {
    select: () => api,
    eq: () => api,
    update: () => api,
    single: async () => ({ data: { gmail_email: "shop@gmail.com", dealership_name: "candle_by_qaaf", gmail_token_expiry: new Date(Date.now() + 3600_000).toISOString() }, error: null }),
  };
  return { from: () => api };
}

afterEach(() => vi.unstubAllGlobals());

describe("Gmail send", () => {
  it("sends multipart/alternative with the HTML part when given HTML", async () => {
    const raws: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        raws.push(Buffer.from(JSON.parse(init.body).raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
        return { ok: true, json: async () => ({ id: "m1" }) };
      })
    );
    const r = await sendEmail(db(), "d1", "a@example.com", "Diwali", "Plain version", { html: "<h1>Visual version</h1>" });
    expect(r.success).toBe(true);
    expect(raws[0]).toContain("multipart/alternative");
    expect(raws[0]).toContain(Buffer.from("<h1>Visual version</h1>").toString("base64"));
    expect(raws[0]).toContain(Buffer.from("Plain version").toString("base64"));
  });
});
