// Which provider sends, and what Meta is actually sent.
//
// M1 and M3 of docs/RESEARCH-WHATSAPP-META-DIRECT.md, together,
// because a client with no caller is unreachable code that looks
// wired — the same reason the WordPress adapter waited for its
// registry entry, and the reason an ungated WordPress publisher was
// deleted the day before.
//
// THE OWNER KEPT GUPSHUP rather than deleting it: a BSP is a real
// fallback if a direct integration is ever rate-limited or suspended.
// So there are two transports and something has to choose.
//
// UNVERIFIED AGAINST A LIVE API. The Meta payloads below are written
// from Meta's documented Cloud API shape and nothing else, because
// there is no token yet. The calibration for what that costs is in
// this repo: Shopify needed FOUR corrections after meeting a real
// store, three invisible to a green suite; WordPress, probed against
// a live site first, needed none. The live run is M4.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { code } from "./helpers/source";

const ROUTE = "src/app/api/webhooks/whatsapp/route.ts";

let saved: Record<string, string | undefined>;
let sent: { url: string; init: any }[];

beforeEach(() => {
  saved = {
    WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    GUPSHUP_API_KEY: process.env.GUPSHUP_API_KEY,
    GUPSHUP_SOURCE_NUMBER: process.env.GUPSHUP_SOURCE_NUMBER,
  };
  for (const k of Object.keys(saved)) delete process.env[k];
  sent = [];
  vi.stubGlobal("fetch", (async (url: any, init: any) => {
    sent.push({ url: String(url), init });
    // BOTH READERS, because the two clients differ: metaClient reads
    // text() and parses (so a 200 that is not JSON is a failure rather
    // than an empty success), while gupshupClient calls json()
    // directly. A fake that offered only one made the Gupshup path
    // throw a TypeError that looked like a bug in the client.
    const payload = { messages: [{ id: "wamid.test" }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(payload), json: async () => payload };
  }) as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("1. THE PROVIDER IS DECLARED, NEVER INFERRED", () => {
  it("THE LOAD-BEARING ONE: credentials alone do not choose a provider", async () => {
    // The tempting version is "Meta if a token is set, else Gupshup".
    // That picks a provider from whichever secrets a deploy happens to
    // carry — so a half-finished migration, or a leftover key in one
    // environment, routes a merchant's messages through a provider
    // nobody chose. Messages still send, from the wrong number, and
    // the first sign is a customer replying to a thread the business
    // cannot see.
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
    process.env.WHATSAPP_ACCESS_TOKEN = "a-token";
    process.env.GUPSHUP_API_KEY = "a-key";
    process.env.GUPSHUP_SOURCE_NUMBER = "919999999999";
    const { activeProvider, sendWhatsAppText } = await import("@/lib/whatsapp/client");
    expect(() => activeProvider()).toThrow(/WHATSAPP_PROVIDER/);
    await expect(sendWhatsAppText("919000000000", "hi")).rejects.toThrow(/WHATSAPP_PROVIDER/);
    expect(sent, "it sent through a provider nobody chose").toHaveLength(0);
  });

  it("an unrecognised value is refused, and the message names it", async () => {
    process.env.WHATSAPP_PROVIDER = "twilio";
    const { activeProvider } = await import("@/lib/whatsapp/client");
    expect(() => activeProvider()).toThrow(/"twilio"/);
  });

  it("the two real values are accepted, case and padding forgiven", async () => {
    const { activeProvider } = await import("@/lib/whatsapp/client");
    for (const [given, expected] of [["meta", "meta"], ["Meta", "meta"], [" gupshup ", "gupshup"], ["GUPSHUP", "gupshup"]] as const) {
      process.env.WHATSAPP_PROVIDER = given;
      expect(activeProvider(), given).toBe(expected);
    }
  });
});

describe("2. WHAT META IS ACTUALLY SENT", () => {
  beforeEach(() => {
    process.env.WHATSAPP_PROVIDER = "meta";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    process.env.WHATSAPP_ACCESS_TOKEN = "a-token";
  });

  it("THE LOAD-BEARING ONE: the URL carries the PHONE NUMBER ID, not a phone number", async () => {
    // Gupshup's `source` is the business's number in digits. Meta's
    // path segment is an opaque id that looks enough like a phone
    // number that pasting the real one is the obvious error — and it
    // fails as a 400 naming an object id, which does not point at the
    // cause.
    const { sendWhatsAppText } = await import("@/lib/whatsapp/client");
    await sendWhatsAppText("919000000000", "hello");
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toContain("/123456789/messages");
    expect(sent[0].url).toMatch(/graph\.facebook\.com\/v\d+\.\d+\//);
    // The recipient goes in the BODY, not the path.
    expect(sent[0].url).not.toContain("919000000000");
  });

  it("messaging_product is on every send, because Graph rejects the call without it", async () => {
    const { sendWhatsAppText, sendWhatsAppImage } = await import("@/lib/whatsapp/client");
    await sendWhatsAppText("919000000000", "hello");
    await sendWhatsAppImage("919000000000", "https://cdn.test/a.png", "a caption");
    expect(sent).toHaveLength(2);
    for (const call of sent) {
      expect(JSON.parse(call.init.body).messaging_product).toBe("whatsapp");
    }
  });

  it("the token travels as a Bearer header and never in the URL", async () => {
    const { sendWhatsAppText } = await import("@/lib/whatsapp/client");
    await sendWhatsAppText("919000000000", "hello");
    expect(sent[0].init.headers.Authorization).toBe("Bearer a-token");
    expect(sent[0].url, "the token is in the URL, where it reaches logs and proxies").not.toContain("a-token");
  });

  it("LINK PREVIEWS ARE OFF, because an approval card must not grow an unrelated picture", async () => {
    // Meta renders a preview from whatever the URL resolves to at send
    // time. Under a decision the owner is about to take, that is not a
    // cosmetic question.
    const { sendWhatsAppText } = await import("@/lib/whatsapp/client");
    await sendWhatsAppText("919000000000", "Approve at https://hawlai.online/x");
    expect(JSON.parse(sent[0].init.body).text.preview_url).toBe(false);
  });

  it("an image is sent by link, with the caption only when there is one", async () => {
    const { sendWhatsAppImage } = await import("@/lib/whatsapp/client");
    await sendWhatsAppImage("919000000000", "https://cdn.test/a.png");
    expect(JSON.parse(sent[0].init.body).image).toEqual({ link: "https://cdn.test/a.png" });
    await sendWhatsAppImage("919000000000", "https://cdn.test/a.png", "words");
    expect(JSON.parse(sent[1].init.body).image).toEqual({ link: "https://cdn.test/a.png", caption: "words" });
  });

  it("MISSING CREDENTIALS THROW, so a caller cannot mistake 'not configured' for 'sent'", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const { sendWhatsAppText } = await import("@/lib/whatsapp/client");
    await expect(sendWhatsAppText("919000000000", "hi")).rejects.toThrow(/WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN/);
    expect(sent).toHaveLength(0);
  });
});

describe("3. WHEN META REFUSES, THE OWNER GETS META'S OWN WORDS", () => {
  beforeEach(() => {
    process.env.WHATSAPP_PROVIDER = "meta";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    process.env.WHATSAPP_ACCESS_TOKEN = "a-token";
  });

  it("THE LOAD-BEARING ONE: the message, the code and the trace id travel", async () => {
    // "(#131030) Recipient phone number not in allowed list" tells you
    // the test number is not registered. "400" does not. The
    // fbtrace_id is what Meta support asks for.
    vi.stubGlobal("fetch", (async () => ({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ error: { message: "(#131030) Recipient phone number not in allowed list", code: 131030, fbtrace_id: "AbC123" } }),
    })) as unknown as typeof fetch);
    const { sendWhatsAppText } = await import("@/lib/whatsapp/client");
    await expect(sendWhatsAppText("919000000000", "hi")).rejects.toThrow(/not in allowed list/);
    await expect(sendWhatsAppText("919000000000", "hi")).rejects.toThrow(/131030/);
    await expect(sendWhatsAppText("919000000000", "hi")).rejects.toThrow(/AbC123/);
  });

  it("a non-JSON error does not become an unreadable throw", async () => {
    vi.stubGlobal("fetch", (async () => ({ ok: false, status: 502, text: async () => "<html>Bad gateway</html>" })) as unknown as typeof fetch);
    const { sendWhatsAppText } = await import("@/lib/whatsapp/client");
    await expect(sendWhatsAppText("919000000000", "hi")).rejects.toThrow(/HTTP 502/);
  });

  it("A 200 THAT IS NOT JSON IS A FAILURE, not an empty success", async () => {
    // Something answered in front of Graph — a gateway, a WAF.
    // Returning {} would let the caller report a send that never
    // happened.
    vi.stubGlobal("fetch", (async () => ({ ok: true, status: 200, text: async () => "<html>ok</html>" })) as unknown as typeof fetch);
    const { sendWhatsAppText } = await import("@/lib/whatsapp/client");
    await expect(sendWhatsAppText("919000000000", "hi")).rejects.toThrow(/not with a result we could read/);
  });

  it("and no failure message carries the token", async () => {
    vi.stubGlobal("fetch", (async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: "Invalid OAuth access token" } }) })) as unknown as typeof fetch);
    const { sendWhatsAppText } = await import("@/lib/whatsapp/client");
    await expect(sendWhatsAppText("919000000000", "hi")).rejects.toThrow(/Invalid OAuth/);
    try {
      await sendWhatsAppText("919000000000", "hi");
    } catch (err: any) {
      expect(String(err?.message)).not.toContain("a-token");
    }

    // AND ON THE NON-JSON PATH, which is a different sentence built by
    // a different branch. Asserting only the JSON one left a mutation
    // that appended the token to the fallback message ALIVE — the
    // branch that runs precisely when something unexpected answered,
    // which is when a log is most likely to be pasted into a ticket.
    vi.stubGlobal("fetch", (async () => ({ ok: false, status: 502, text: async () => "<html>Bad gateway</html>" })) as unknown as typeof fetch);
    try {
      await sendWhatsAppText("919000000000", "hi");
      throw new Error("it did not reject");
    } catch (err: any) {
      expect(String(err?.message)).toMatch(/HTTP 502/);
      expect(String(err?.message), "the fallback message carries the token").not.toContain("a-token");
    }
  });
});

describe("4. GUPSHUP STILL WORKS, because it was kept on purpose", () => {
  it("THE LOAD-BEARING ONE: choosing gupshup sends to Gupshup", async () => {
    process.env.WHATSAPP_PROVIDER = "gupshup";
    process.env.GUPSHUP_API_KEY = "a-key";
    process.env.GUPSHUP_SOURCE_NUMBER = "919999999999";
    const { sendWhatsAppText } = await import("@/lib/whatsapp/client");
    await sendWhatsAppText("919000000000", "hello");
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toContain("api.gupshup.io");
    expect(sent[0].init.headers.apikey).toBe("a-key");
  });

  it("and choosing meta never reaches Gupshup, even with Gupshup configured", async () => {
    process.env.WHATSAPP_PROVIDER = "meta";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1";
    process.env.WHATSAPP_ACCESS_TOKEN = "t";
    process.env.GUPSHUP_API_KEY = "a-key";
    process.env.GUPSHUP_SOURCE_NUMBER = "919999999999";
    const { sendWhatsAppText } = await import("@/lib/whatsapp/client");
    await sendWhatsAppText("919000000000", "hello");
    expect(sent[0].url).not.toContain("gupshup");
  });
});

describe("5. THE NUMBER SHAPE IS ONE ANSWER, NOT TWO", () => {
  it("THE LOAD-BEARING ONE: digits only, whichever provider is live", async () => {
    const { normalizePhoneNumber } = await import("@/lib/whatsapp/client");
    for (const given of ["+91 81150 15907", "0091-81150-15907", "918115015907"]) {
      expect(normalizePhoneNumber(given), given).toBe("918115015907");
    }
  });

  it("and the callers get it from the provider-neutral module", async () => {
    // Three files imported it from a module named after one provider
    // while having nothing to do with that provider.
    for (const path of [
      ROUTE,
      "src/app/api/whatsapp-connect/start/route.ts",
      "src/app/api/whatsapp-connect/verify/route.ts",
    ]) {
      expect(code(path), path).toMatch(/from "@\/lib\/whatsapp\/client"/);
      expect(code(path), path).not.toMatch(/from "@\/lib\/whatsapp\/gupshupClient"/);
    }
  });
});
