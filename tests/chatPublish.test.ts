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
import {
  websitePublishAction,
  socialPublishAction,
  captionFrom,
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

describe("what the owner is asked before anything goes live", () => {
  it("publishing the site says it publishes the WHOLE site, and points at the existing endpoint", () => {
    const a = websitePublishAction();
    expect(a).toMatchObject({ target: "website", endpoint: "/api/website-builder/publish", method: "PATCH", payload: { published: true } });
    expect(a.confirm).toMatch(/ENTIRE live site/);
    expect(a.confirm).toMatch(/every page, not just this one/);
    expect(a.done).toBe("✅ Published to your live site");
  });

  it("a caption with no image is Facebook-only, and the confirm says Instagram is skipped", () => {
    const a = socialPublishAction({ caption: "Slow evenings start here." })!;
    expect(a.payload).toEqual({ caption: "Slow evenings start here.", image_url: null, post_to_instagram: false });
    expect(a.confirm).toMatch(/Facebook Page right now/);
    expect(a.confirm).toMatch(/Instagram is skipped/);
    expect(a.done).toBe("✅ Posted to Facebook");
  });

  it("a caption with an image offers both channels and says the post can't be unseen", () => {
    const a = socialPublishAction({ caption: "Diwali warmth", imageUrl: "https://cdn.example/diwali.png" })!;
    expect(a.payload.post_to_instagram).toBe(true);
    expect(a.confirm).toMatch(/Facebook Page and Instagram/);
    expect(a.confirm).toMatch(/not unseen/);
  });

  it("no caption means no publish button at all", () => {
    expect(socialPublishAction({ caption: "   " })).toBeNull();
  });

  it("Reject discards the saved draft only when there is one to discard", () => {
    expect(socialPublishAction({ caption: "hi", draftId: "cp1" })!.discard).toEqual({
      endpoint: "/api/content-marketing/generate",
      method: "DELETE",
      payload: { id: "cp1" },
      done: "❌ Rejected — draft discarded",
    });
    expect(socialPublishAction({ caption: "hi" })!.discard).toBeUndefined();
  });

  it("reads the caption out of whatever shape the model returned", () => {
    expect(captionFrom({ text: "a" })).toBe("a");
    expect(captionFrom({ caption: "b" })).toBe("b");
    expect(captionFrom({ somethingElse: "c" })).toBe("c");
    expect(captionFrom({ _claimsNote: "note", hashtags: ["#x"] })).toBe("");
  });

  it("a caption generated beside an image is paired with it, and only social posts are touched", () => {
    const artifacts: any[] = [
      { kind: "document", label: "Instagram post", publish: socialPublishAction({ caption: "Diwali warmth" }) },
      { kind: "document", label: "Blog" },
      { kind: "visual", type: "image", url: "https://cdn.example/diwali.png", label: "Generated Image" },
    ];
    attachTurnImages(artifacts);
    expect(artifacts[0].publish.payload).toMatchObject({ image_url: "https://cdn.example/diwali.png", post_to_instagram: true });
    expect(artifacts[0].publish.confirm).toMatch(/Facebook Page and Instagram/);
    expect(artifacts[1].publish).toBeUndefined();
  });

  it("with no image in the turn, the caption stays Facebook-only", () => {
    const artifacts: any[] = [{ kind: "document", publish: socialPublishAction({ caption: "hi" }) }];
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
  it("a website draft does — and it publishes through the Website Builder's own endpoint", () => {
    const artifact = extractArtifact("build_website", {}, { note: "Built 5 pages as a draft" })!;
    expect(artifact.publish).toMatchObject({ target: "website", endpoint: "/api/website-builder/publish" });
  });

  it("an Instagram caption does, carrying the caption and the saved draft id", () => {
    const artifact = extractArtifact("generate_content", { contentType: "instagram_post" }, { text: "Slow evenings.", _savedId: "cp1" })!;
    expect(artifact.publish!.payload.caption).toBe("Slow evenings.");
    expect(artifact.publish!.discard!.payload).toEqual({ id: "cp1" });
  });

  it("a blog outline does not — it is something you keep, not something you post", () => {
    const artifact = extractArtifact("generate_content", { contentType: "blog_post" }, { title: "10 ideas", _savedId: "cp2" })!;
    expect(artifact.publish).toBeUndefined();
    expect(SOCIAL_POST_TYPES.has("blog_post")).toBe(false);
  });
});

describe("a caption and an image generated in one chat turn", () => {
  it("come back paired, so the button offers Instagram too", async () => {
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

    const result = await runMasterBrainChat(db(), "d1", [], "Christmas Instagram post with an image");
    const caption = result.artifacts.find((a: any) => a.publish?.target === "social_post")!;
    expect(caption.publish!.payload.image_url).toBe("https://cdn.example/uploaded.png");
    expect(caption.publish!.payload.post_to_instagram).toBe(true);
    expect(caption.publish!.done).toBe("✅ Posted to Facebook and Instagram");
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
