// Acting on generated content inside the chat.
//
// Chat could generate a website draft or a caption and say it had, but
// the only way to act on it was to leave for the department page. These
// tests pin Phase A: a publish action on the artifact, an explicit
// confirm sentence naming exactly what goes live, Reject that discards
// the draft, and — crucially — publishing through the SAME endpoints the
// department pages use, never a chat-only path.
//
// Nothing here is live-verified: site publish and social posting have
// never been confirmed against production, which is why the button
// asks first.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { code } from "./helpers/source";
import {
  socialPublishAction,
  attachTurnImages,
  SOCIAL_POST_TYPES,
} from "@/lib/chat/publishActions";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let deletes: { table: string; filters: [string, any][] }[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, ilike: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (v: Row) => ((op = "insert"), (values = v), api),
      update: (v: Row) => ((op = "update"), (values = v), api),
      delete: () => ((op = "delete"), api),
      maybeSingle: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      single: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => {
        if (op === "delete") deletes.push({ table, filters: [...filters] });
        return Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { from };
}

const CANDLE = (): Record<string, Row[]> => ({
  profiles: [{ id: "u1", dealership_id: "d1" }],
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow", fb_page_id: "PAGE1" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: false, shipping_mode: "flat", shipping_rate: 60 }],
  website_pages: [],
  products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", images: ["https://cdn.example/lavender.jpg"], inventory_count: 5, is_active: true, order_index: 0 }],
  discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [], business_knowledge: [],
  brand_profiles: [{ tone_of_voice: "warm", messaging_pillars: [] }],
  brand_kits: [], team_members: [], business_memory: [], content_pieces: [{ id: "cp1", dealership_id: "d1" }],
  chat_conversations: [], chat_messages: [], api_usage_logs: [], daily_message_usage: [],
});

const FB_PAGE = { platform: "facebook" as const, name: "Candle by Qaaf", connected: true, why: null };
const FB_OFF = { platform: "facebook" as const, name: null, connected: false, why: "Your Facebook Page isn't connected." };
const IG = { platform: "instagram" as const, name: null, connected: true, why: null };
const IG_OFF = { platform: "instagram" as const, name: null, connected: false, why: "Posting to Instagram isn't connected." };

describe("what the owner is asked before anything goes live", () => {
  it("PUBLISHING THE SITE STILL WARNS IT IS THE WHOLE SITE", () => {
    // Moved off websitePublishAction on 2026-10-10: that descriptor is
    // gone (G-3 step 2b) and the sentence is written by the chat tool
    // onto the approval row instead. Asserted at the source that writes
    // it, because a test against a deleted helper would keep passing
    // while the real wording drifted.
    //
    // There is no per-page publish - websites.published is one flag for
    // the whole site - so saying so is the whole point of the sentence.
    const brain = code("src/lib/agents/masterBrainV2.ts");
    const at = brain.indexOf('actionType: "publish_site"');
    expect(at).toBeGreaterThan(-1);
    const confirm = brain.slice(brain.lastIndexOf("const confirmText =", at), at);
    expect(confirm).toMatch(/ENTIRE live site/);
    expect(confirm).toMatch(/every page, not just this one/);
    expect(confirm).toMatch(/unpublish again from Website Builder/);
  });


  it("the button says WHICH Facebook Page, and the confirm says it will be public", () => {
    const a = socialPublishAction({ text: "Slow evenings start here.", to: FB_PAGE })!;
    expect(a.label).toBe("Publish to your Facebook Page: Candle by Qaaf");
    expect(a.confirm).toMatch(/posts publicly to your Facebook Page: Candle by Qaaf/);
    expect(a.confirm).toMatch(/Anyone can see it/);
    expect(a.done).toBe("✅ Posted to your Facebook Page: Candle by Qaaf");
    // The endpoint gets the EXACT text the card showed, to compare after.
    expect(a.payload).toMatchObject({
      caption: "Slow evenings start here.",
      expect_text: "Slow evenings start here.",
      post_to_instagram: false,
      destination_name: "Candle by Qaaf",
      content_piece_id: null,
    });
  });

  it("an Instagram destination never produces a Facebook button", () => {
    const a = socialPublishAction({ text: "Diwali warmth", to: IG })!;
    expect(a.label).toBe("Publish to your Instagram");
    expect(a.payload.post_to_instagram).toBe(true);
    expect(a.label).not.toMatch(/Facebook/);
    expect(a.confirm).not.toMatch(/Facebook/);
  });

  it("THE INCIDENT: a destination that is not connected gets NO button", () => {
    // 8 Oct 2026: this check lived inside /api/social/post and ran after
    // the press, so the owner learned Instagram wasn't connected from a
    // message that arrived after a public Facebook post.
    expect(socialPublishAction({ text: "Diwali warmth", to: IG_OFF })).toBeNull();
    expect(socialPublishAction({ text: "Diwali warmth", to: FB_OFF })).toBeNull();
  });

  it("an image in the confirm, and the Page's name survives the rebuild", () => {
    const a = socialPublishAction({ text: "Diwali warmth", to: FB_PAGE, imageUrl: "https://cdn.example/diwali.png" })!;
    expect(a.confirm).toMatch(/this image and this caption/);
    expect(a.confirm).toMatch(/not unseen/);
  });

  it("no caption means no publish button at all", () => {
    expect(socialPublishAction({ text: "   ", to: FB_PAGE })).toBeNull();
  });

  it("Reject discards the saved draft only when there is one to discard", () => {
    expect(socialPublishAction({ text: "hi", to: FB_PAGE, draftId: "cp1" })!.discard).toEqual({
      endpoint: "/api/content-marketing/generate",
      method: "DELETE",
      payload: { id: "cp1" },
      done: "❌ Rejected — draft discarded",
    });
    expect(socialPublishAction({ text: "hi", to: FB_PAGE })!.discard).toBeUndefined();
  });

  it("a caption generated beside an image is paired with it, and only social posts are touched", () => {
    const artifacts: any[] = [
      { kind: "document", label: "Instagram post", publish: socialPublishAction({ text: "Diwali warmth", to: FB_PAGE }) },
      { kind: "document", label: "Blog" },
      { kind: "visual", type: "image", url: "https://cdn.example/diwali.png", label: "Generated Image" },
    ];
    attachTurnImages(artifacts);
    // The image is attached. The DESTINATION is not changed: this used
    // to flip post_to_instagram to true, adding a second public platform
    // the confirmation never named.
    expect(artifacts[0].publish.payload).toMatchObject({ image_url: "https://cdn.example/diwali.png", post_to_instagram: false, destination: "facebook" });
    expect(artifacts[0].publish.confirm).toMatch(/this image and this caption/);
    expect(artifacts[1].publish).toBeUndefined();
  });

  it("with no image in the turn, the caption stays on the destination it had", () => {
    const artifacts: any[] = [{ kind: "document", publish: socialPublishAction({ text: "hi", to: FB_PAGE }) }];
    attachTurnImages(artifacts);
    expect(artifacts[0].publish.payload.post_to_instagram).toBe(false);
  });
});

// ---------------------------------------------------------------------
// The chat itself, and the endpoints the buttons call.
// ---------------------------------------------------------------------

const postPhotoToPage = vi.fn(async (..._a: any[]) => ({ id: "fb_photo_1" }));
const postTextToPage = vi.fn(async (..._a: any[]) => ({ id: "fb_text_1" }));
const postPhotoToInstagram = vi.fn(async (..._a: any[]) => ({ id: "ig_1" }));
vi.mock("@/lib/agents/socialMediaAgent", async (orig) => ({
  ...(await orig<typeof import("@/lib/agents/socialMediaAgent")>()),
  postPhotoToPage: (...a: any[]) => postPhotoToPage(...a),
  postTextToPage: (...a: any[]) => postTextToPage(...a),
  postPhotoToInstagram: (...a: any[]) => postPhotoToInstagram(...a),
  getConnectedInstagramAccountId: async () => "IG1",
}));
vi.mock("@/lib/crypto/oauthSecrets", () => ({ readMetaPageToken: () => "PAGE_TOKEN", hasMetaPageToken: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, from: (t: string) => db().from(t) }) }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (t: string) => db().from(t),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://cdn.example/uploaded.png" } }) }) },
  }),
}));
vi.mock("@/lib/agents/graphicDesignAgent", async (orig) => ({
  ...(await orig<typeof import("@/lib/agents/graphicDesignAgent")>()),
  generateGraphic: async () => Buffer.from("png"),
}));
vi.mock("@/lib/usage/generationLimits", async (orig) => ({
  ...(await orig<typeof import("@/lib/usage/generationLimits")>()),
  checkAndRecordGenerationUsage: async () => ({ allowed: true }),
}));
vi.mock("@/lib/usage/logUsage", () => ({ logClaudeUsage: async () => {}, logGeminiImageUsage: async () => {} }));
vi.mock("@/lib/plans", async (orig) => ({
  ...(await orig<typeof import("@/lib/plans")>()),
  getDealershipPlanLimits: async () => ({}),
  hasFeature: () => true,
  killSwitchFor: () => null,
}));

import { extractArtifact, runMasterBrainChat } from "@/lib/agents/masterBrainV2";
import { POST as socialPost } from "@/app/api/social/post/route";
import { DELETE as discardContent } from "@/app/api/content-marketing/generate/route";

const post = (path: string, body: unknown) =>
  new Request(`https://app.hawlai.com${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  tables = CANDLE();
  deletes = [];
  postPhotoToPage.mockClear();
  postTextToPage.mockClear();
  postPhotoToInstagram.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("which generated things get a publish button", () => {
  it("A WEBSITE DRAFT GETS AN APPROVAL RECORD, not a browser PATCH", () => {
    // G-3 step 2b (2026-10-09). The card used to carry a PATCH to
    // /api/website-builder/publish, which made the decision the
    // BROWSER's: the sentence warning that the ENTIRE site goes public
    // was a client string, and a request with the same body skipped it.
    //
    // The intent of this test is unchanged - a draft gets a way to go
    // live from the chat - and the guarantee is stronger: the words are
    // on the server, and the only path to publishing is the approvals
    // PATCH the server authorises.
    const artifact = extractArtifact("build_website", {}, {
      note: "Built 5 pages as a draft",
      approvalId: "appr-9",
      confirm: "This publishes your ENTIRE live site — every page, not just this one.",
    })!;
    expect(artifact.publish).toBeUndefined();
    expect(artifact.approval?.id).toBe("appr-9");
    expect(artifact.confirm).toMatch(/ENTIRE live site/);
  });

  it("and with no approval row there is NO button at all", () => {
    // Better than a button whose authority nobody recorded. The owner
    // publishes from Website Builder, which is where they always could.
    const artifact = extractArtifact("build_website", {}, { note: "Built 5 pages as a draft" })!;
    expect(artifact.publish).toBeUndefined();
    expect(artifact.approval).toBeUndefined();
  });

  it("an Instagram caption does, carrying the caption and the saved draft id", () => {
    const artifact = extractArtifact(
      "generate_content",
      { contentType: "instagram_post" },
      { text: "Slow evenings.", _savedId: "cp1", _destinations: { facebook: FB_PAGE, instagram: IG, anyConnected: true } }
    )!;
    expect(artifact.publish!.payload.caption).toBe("Slow evenings.");
    expect(artifact.publish!.payload.destination).toBe("instagram");
    expect(artifact.publish!.discard!.payload).toEqual({ id: "cp1" });
  });

  it("THE INCIDENT, end to end: an Instagram card with no Instagram gets no button and says why", () => {
    const artifact = extractArtifact(
      "generate_content",
      { contentType: "instagram_post" },
      { text: "Slow evenings.", _savedId: "cp1", _destinations: { facebook: FB_PAGE, instagram: IG_OFF, anyConnected: true } }
    )!;
    // Facebook IS connected here — and that is exactly the trap. The
    // owner asked for Instagram; a Facebook button on an Instagram card
    // is what put a post on the Page on 8 Oct 2026.
    expect(artifact.publish).toBeUndefined();
    expect(artifact.cannotPublish!.reason).toMatch(/Instagram/);
    expect(artifact.cannotPublish!.text).toBe("Slow evenings.");
  });

  it("with nothing connected at all, the caption is still offered — just not a button", () => {
    const artifact = extractArtifact(
      "generate_content",
      { contentType: "facebook_post" },
      { text: "Slow evenings.", _destinations: { facebook: FB_OFF, instagram: IG_OFF, anyConnected: false } }
    )!;
    expect(artifact.publish).toBeUndefined();
    expect(artifact.cannotPublish!.text).toBe("Slow evenings.");
  });

  it("a blog outline does not — it is something you keep, not something you post", () => {
    const artifact = extractArtifact("generate_content", { contentType: "blog_post" }, { title: "10 ideas", _savedId: "cp2" })!;
    expect(artifact.publish).toBeUndefined();
    expect(SOCIAL_POST_TYPES.has("blog_post")).toBe(false);
  });
});

describe("a caption and an image asked for in one chat turn", () => {
  it("the caption comes back; the image comes back as a PRICE, not a picture", async () => {
    // The orchestrator asks for both tools, then replies; the agent call
    // in between is told apart by having no tools of its own.
    let turn = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any = {}): Promise<any> => {
        const u = String(url);
        if (u.includes("generativelanguage")) {
          const payload = { candidates: [{ content: { parts: [{ inline_data: { data: Buffer.from("png").toString("base64") } }] } }] };
          return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
        }
        const body = JSON.parse(init.body);
        if (body.tools) {
          turn += 1;
          const payload =
            turn === 1
              ? {
                  content: [
                    { type: "tool_use", id: "t1", name: "generate_content", input: { contentType: "instagram_post", topic: "Christmas" } },
                    { type: "tool_use", id: "t2", name: "generate_graphic", input: { designType: "social_graphic", prompt: "Christmas candle" } },
                  ],
                }
              : { content: [{ type: "text", text: "Here's your Christmas post." }] };
          return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
        }
        const agent = { content: [{ type: "text", text: JSON.stringify({ text: "Warm light for a quiet Christmas." }) }] };
        return { ok: true, status: 200, json: async () => agent, text: async () => JSON.stringify(agent), headers: { get: () => null } };
      })
    );

    process.env.NEXT_PUBLIC_GRAPHIC_DESIGN_ENABLED = "true";
    const result = await runMasterBrainChat(db(), "d1", [], "Christmas Instagram post with an image");

    // NOTHING WAS SPENT. On 8 Oct 2026 this same sentence ran a paid
    // image call and the result went public on a Facebook Page, while
    // Graphic Design was on hold for cost. The image is now a quote with
    // the price in the button.
    const quote = result.artifacts.find((a: any) => a.type === "image_quote")!;
    // G-3 step 1b (2026-10-09): the card no longer carries a {endpoint,
    // payload} for the browser to POST. That made the decision the
    // BROWSER's - the price and the confirm were client strings, and a
    // request sent straight to the endpoint with the same payload
    // skipped both. The server writes an approval row instead, and the
    // only path to spending is the approvals PATCH.
    //
    // The intent of this test is unchanged and the guarantee is
    // stronger: nothing was spent, and the price the owner agreed to now
    // exists where the server can read it.
    expect(quote.publish).toBeUndefined();
    expect(quote.approval?.id).toBeTruthy();
    expect(quote.confirm).toMatch(/₹3\.39/);
    expect(quote.confirm).toMatch(/monthly image allowance/);
    expect(result.artifacts.some((a: any) => a.type === "image")).toBe(false);

    // The caption still comes back, and still names its destination. It
    // carries no image, because no image exists yet.
    const caption = result.artifacts.find((a: any) => a.publish?.target === "social_post")!;
    expect(caption.publish!.payload.destination).toBe("instagram");
    expect(caption.publish!.payload.image_url).toBeNull();
    expect(caption.publish!.label).toBe("Publish to your Instagram");
    delete process.env.NEXT_PUBLIC_GRAPHIC_DESIGN_ENABLED;
  });
});

describe("the endpoints the buttons call", () => {
  it("an image already in storage is posted as-is — no re-upload, and Instagram gets it", async () => {
    const res = await socialPost(post("/api/social/post", { caption: "Diwali warmth", image_url: "https://cdn.example/diwali.png", post_to_instagram: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(postPhotoToPage.mock.calls[0][2]).toBe("https://cdn.example/diwali.png");
    expect(postPhotoToInstagram).toHaveBeenCalled();
    expect(body.instagram.posted).toBe(true);
  });

  it("a caption with no image goes to Facebook as a text post", async () => {
    const res = await socialPost(post("/api/social/post", { caption: "Slow evenings start here." }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(postTextToPage.mock.calls[0][2]).toBe("Slow evenings start here.");
    expect(postPhotoToPage).not.toHaveBeenCalled();
    expect(body.hadImage).toBe(false);
  });

  it("asking for Instagram without an image says so plainly instead of silently skipping", async () => {
    const res = await socialPost(post("/api/social/post", { caption: "Slow evenings.", post_to_instagram: true }));
    const body = await res.json();
    expect(body.instagram).toEqual({ posted: false, error: "Instagram needs an image — this went to Facebook only." });
    expect(postPhotoToInstagram).not.toHaveBeenCalled();
  });

  it("a caption is still required — an empty post is refused", async () => {
    const res = await socialPost(post("/api/social/post", { caption: "  " }));
    expect(res.status).toBe(400);
    expect(postTextToPage).not.toHaveBeenCalled();
  });

  it("Reject deletes the draft, scoped to this business", async () => {
    const res = await discardContent(new Request("https://app.hawlai.com/api/content-marketing/generate", { method: "DELETE", body: JSON.stringify({ id: "cp1" }) }));
    expect(res.status).toBe(200);
    expect(deletes[0].table).toBe("content_pieces");
    expect(deletes[0].filters).toEqual([["id", "cp1"], ["dealership_id", "d1"]]);
  });
});
