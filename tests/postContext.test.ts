// "WHICH POST DO THEY MEAN?" — T1, 28 November 2026, built on the two
// shapes RECORDED live from the founder's test:
//   shared post  attachments[ig_post{payload:ig_post_media_id,url}], no text
//   story reply  text + reply_to{story:id,url}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readPostRef, productFromCaption, withPostContext } from "@/lib/dm/postContext";

const CATALOG = [{ name: "Clay Mug" }, { name: "Kurta – Red – M" }, { name: "Vase" }, { name: "vase" }];

describe("1. READING WHAT THE DM POINTS AT — the recorded shapes", () => {
  it("A SHARED POST: its media id", () => {
    expect(readPostRef({ mid: "m", attachments: [{ type: "ig_post", payload: { ig_post_media_id: "17912345678901234", url: "https://x" } }] })).toEqual({ kind: "post", mediaId: "17912345678901234" });
  });

  it("A STORY REPLY: the story's id", () => {
    expect(readPostRef({ mid: "m", text: "iska price?", reply_to: { story: { id: "18012345678901234", url: "https://x" } } })).toEqual({ kind: "story", mediaId: "18012345678901234" });
  });

  it("AN ID THAT ISN'T ONE IS NOT USED — the post is still known to be pointed at", () => {
    expect(readPostRef({ attachments: [{ type: "ig_post", payload: { ig_post_media_id: "../me?x" } }] })).toEqual({ kind: "post", mediaId: null });
  });

  it("A PLAIN MESSAGE, AN IMAGE, OR NOTHING POINTS AT NO POST", () => {
    expect(readPostRef({ mid: "m", text: "hi" })).toBeNull();
    expect(readPostRef({ attachments: [{ type: "image", payload: { url: "x" } }] })).toBeNull();
    expect(readPostRef(null)).toBeNull();
  });
});

describe("2. THE PRODUCT, ONLY BY THE SELLER'S OWN TAG", () => {
  it("#HawlaiTag: <name> MATCHING EXACTLY ONE PRODUCT, IGNORING CASE AND SPACING", () => {
    expect(productFromCaption("New in! ✨\n#HawlaiTag: clay  mug\n#handmade", CATALOG)).toBe("Clay Mug");
    expect(productFromCaption("#hawlaitag:Kurta – Red – M", CATALOG)).toBe("Kurta – Red – M");
  });

  it("NO TAG, AN UNKNOWN NAME, OR TWO PRODUCTS SHARING IT: NO PRODUCT — never a guess", () => {
    expect(productFromCaption("Our clay mug, handmade", CATALOG)).toBeNull();
    expect(productFromCaption("#HawlaiTag: Teapot", CATALOG)).toBeNull();
    expect(productFromCaption("#HawlaiTag: Vase", CATALOG)).toBeNull();
    expect(productFromCaption(null, CATALOG)).toBeNull();
  });
});

describe("3. THE CAPTION, WITH THE SHOP'S OWN TOKEN — every failure degrades, none throws", () => {
  // The REAL function: section 5 mocks it for the webhook.
  let fetchCaption: (t: string, id: string) => Promise<string | null>;
  let answer: () => any;
  const calls: any[] = [];
  beforeEach(async () => {
    fetchCaption = (await vi.importActual<any>("@/lib/dm/postContext")).fetchCaption;
    calls.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => (calls.push({ url, auth: init?.headers?.Authorization }), answer())));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("READS IT", async () => {
    answer = () => ({ ok: true, json: async () => ({ caption: "  #HawlaiTag: Clay Mug " }) });
    expect(await fetchCaption("tok", "17912345678901234")).toBe("#HawlaiTag: Clay Mug");
    expect(calls[0]).toEqual({ url: "https://graph.instagram.com/v26.0/17912345678901234?fields=caption", auth: "Bearer tok" });
  });

  it("REFUSED, NO CAPTION, UNREADABLE, OR UNREACHABLE: null", async () => {
    answer = () => ({ ok: false, json: async () => ({ error: { message: "story expired" } }) });
    expect(await fetchCaption("tok", "1")).toBeNull();
    answer = () => ({ ok: true, json: async () => ({ id: "1" }) });
    expect(await fetchCaption("tok", "1")).toBeNull();
    answer = () => ({ ok: true, json: async () => { throw new Error("not json"); } });
    expect(await fetchCaption("tok", "1")).toBeNull();
    answer = () => { throw new Error("network"); };
    expect(await fetchCaption("tok", "1")).toBeNull();
  });
});

describe("4. WHAT THE REPLY IS TOLD", () => {
  const post = { kind: "post" as const, mediaId: "1" };
  const story = { kind: "story" as const, mediaId: "1" };

  it("THE PRODUCT, WHEN THE TAG NAMED ONE", () => {
    expect(withPostContext("iska price?", story, "#HawlaiTag: Clay Mug", "Clay Mug")).toBe('[The customer replied to your Instagram story showing the product "Clay Mug".] Their message: "iska price?"');
  });

  it("ELSE THE CAPTION — AND A SHARE WITH NO WORDS IS STILL A MESSAGE", () => {
    expect(withPostContext("", post, "Handmade\nmugs", null)).toBe('[The customer shared your Instagram post. Its caption: "Handmade mugs"] They sent no message with it.');
  });

  it("ELSE: SAY IT COULDN'T BE READ, AND ASK WHICH PRODUCT", () => {
    expect(withPostContext("", post, null, null)).toMatch(/couldn't be read — ask which product they mean/);
  });
});

// ---- the webhook -----------------------------------------------------------
const replies: string[] = [];
let caption: string | null;
const captionCalls: string[] = [];
vi.mock("@/lib/dm/postContext", async (orig) => ({
  ...(await orig<any>()),
  fetchCaption: async (_t: string, id: string) => (captionCalls.push(id), caption),
}));
vi.mock("@/lib/agents/socialManagementAgent", () => ({ generateAutoReply: async (...a: any[]) => (replies.push(a[1]), { reply: "Ordinary reply." }) }));
vi.mock("@/lib/integrations/health", () => ({ recordHealth: async () => ({ recorded: true, notified: false }) }));
vi.mock("@/lib/dm/thread", async (orig) => ({ ...(await orig<any>()), readDmThread: async () => ({ turns: [], lastCustomerAt: null }) }));
vi.mock("@/lib/businessBrain", () => ({ getBusinessContext: async () => ({ toneOfVoice: null, facts: { brand: { language: "english" } }, knowledgeFacts: null }) }));
vi.mock("@/lib/agents/personas", () => ({ resolvePersona: async () => ({ goals: [] }) }));
vi.mock("@/lib/claims/businessFacts", () => ({ fetchCatalog: async () => [{ id: "p1", name: "Clay Mug", price: 450, kind: "product", active: true }] }));
vi.mock("@/lib/email/consent", () => ({ siteUrl: () => "https://example.test" }));
vi.mock("@/lib/leads/dmLeadLinking", () => ({ resolveDmLead: async () => "lead-1" }));
vi.mock("@/lib/businessMemory/getLeadMemory", () => ({ getLeadMemory: async () => [] }));
vi.mock("@/lib/webhooks/deliveryLog", () => ({ recordDelivery: async () => {} }));
vi.mock("@/lib/instagram/dm", () => ({ sendInstagramDmReply: async () => {}, sendInstagramDmImage: async () => {} }));
vi.mock("@/lib/crypto/oauthSecrets", () => ({
  readMetaPageToken: () => null,
  INSTAGRAM_TOKEN_SELECT: "instagram_access_token",
  readInstagramToken: (d: any) => d?.instagram_access_token ?? null,
}));

import { handleAutoReplyEntry } from "@/lib/webhooks/autoReplyHandler";

const logged: any[] = [];
function db() {
  return {
    from: (table: string) => {
      const f: Record<string, any> = {};
      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => ((f[c] = v), api),
        maybeSingle: async () => ({
          data: table === "dealerships" && f.instagram_business_id
            ? { id: "d1", dealership_name: "A Shop", business_category: "x", instagram_access_token: "tok", dm_auto_reply_enabled: true, comment_auto_reply_enabled: false, instagram_selling_enabled: false, seller_upi_vpa: null }
            : null,
          error: null,
        }),
        insert: async (row: any) => (table === "auto_reply_log" && logged.push(row), { error: null }),
      };
      return api;
    },
  } as any;
}
const entry = (message: any) => ({ id: "ig-1", messaging: [{ sender: { id: "cust-1" }, message }] });

describe("5. THE WEBHOOK ANSWERS A DM THAT POINTS AT A POST", () => {
  beforeEach(() => {
    replies.length = 0;
    logged.length = 0;
    captionCalls.length = 0;
    caption = "#HawlaiTag: Clay Mug";
  });

  it("A SHARED POST WITH NO TEXT IS ANSWERED NOW — knowing the product its tag names", async () => {
    await handleAutoReplyEntry(entry({ mid: "m", attachments: [{ type: "ig_post", payload: { ig_post_media_id: "17912345678901234", url: "x" } }] }), db());
    expect(captionCalls).toEqual(["17912345678901234"]);
    expect(replies).toEqual(['[The customer shared your Instagram post showing the product "Clay Mug".] They sent no message with it.']);
    // The conversation's memory keeps what they pointed at.
    expect(logged[0].incoming_text).toBe(replies[0]);
  });

  it("A STORY REPLY KEEPS THE CUSTOMER'S WORDS, WITH WHAT THEY REPLIED TO", async () => {
    caption = "Fresh batch today";
    await handleAutoReplyEntry(entry({ mid: "m", text: "iska price?", reply_to: { story: { id: "18012345678901234", url: "x" } } }), db());
    expect(replies).toEqual(['[The customer replied to your Instagram story. Its caption: "Fresh batch today"] Their message: "iska price?"']);
  });

  it("AN ORDINARY TEXT DM IS UNCHANGED, and no caption is fetched", async () => {
    await handleAutoReplyEntry(entry({ mid: "m", text: "hello" }), db());
    expect(replies).toEqual(["hello"]);
    expect(captionCalls).toEqual([]);
  });

  it("AN UNREADABLE POST IS STILL ANSWERED — asking which product", async () => {
    caption = null;
    await handleAutoReplyEntry(entry({ mid: "m", attachments: [{ type: "ig_post", payload: { ig_post_media_id: "17912345678901234" } }] }), db());
    expect(replies[0]).toMatch(/couldn't be read — ask which product/);
  });

  it("AN ECHO OF THE SHOP'S OWN SHARE IS NOT ANSWERED", async () => {
    await handleAutoReplyEntry(entry({ mid: "m", is_echo: true, attachments: [{ type: "ig_post", payload: { ig_post_media_id: "17912345678901234" } }] }), db());
    expect(replies).toEqual([]);
    expect(captionCalls).toEqual([]);
  });
});
