// The chat side of setting a page's search title and description.
//
// Chat could already write the words and could already claim they were
// live. What it could not do was apply them. This tool closes that gap
// through the same approval spine as a price change: resolve the page,
// preview it, put the buttons in the chat, and change nothing until the
// owner presses one.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

const created: any[] = [];
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/publish/create", () => ({
  createPublishAction: async (_supabase: any, _platform: any, input: any) => {
    created.push(input);
    return {
      ok: true,
      actionId: "action-1",
      approvalId: "approval-1",
      preview: { summary: "Home page — Search description: (empty) → \"…\"", changes: [], warnings: ["This website isn't published…"] },
    };
  },
}));

import { executeTool, extractArtifact, TOOLS } from "@/lib/agents/masterBrainV2";

const CTX: any = { id: "d1", name: "Candle by Qaaf", city: "Shahjahanpur", category: "candles", team: [], toneOfVoice: null };

const OWNER_DESCRIPTION =
  "Hand-poured soy candles made by hand in Shahjahanpur, in small batches, with fragrance that lasts the whole evening. Shop now.";

function db(pages: { id: string; slug: string; title: string | null }[], site: any = { id: "w1", slug: "qaaf", published: true }) {
  return {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: async () => ({ data: pages }),
        maybeSingle: async () => ({ data: table === "websites" ? site : null }),
      };
      return chain;
    },
  };
}

const HOME = { id: "p1", slug: "home", title: "Home" };
const ABOUT = { id: "p2", slug: "about", title: "About" };

describe("propose_page_meta", () => {
  it("is offered to the model, and says plainly that generate_seo does not do this", () => {
    const tool = TOOLS.find((t: any) => t.name === "propose_page_meta");
    expect(tool).toBeTruthy();
    expect(tool!.description).toMatch(/generate_seo only writes a suggestion/);
    expect(tool!.description).toMatch(/reads the rendered title and description back/);
    expect(tool!.description).toMatch(/never shorten it yourself/i);
  });

  it("sends the owner's wording through untouched, to the page they meant", async () => {
    created.length = 0;
    const result = await executeTool(db([HOME, ABOUT]), CTX, "propose_page_meta", { page: "home", metaDescription: OWNER_DESCRIPTION }, "");
    expect(result.success).toBe(true);
    expect(created[0].targetRef).toBe("p1");
    expect(created[0].actionKey).toBe("update_page_meta");
    expect(created[0].platform).toBe("hawlai_site");
    // Not trimmed to 160, not "improved".
    expect(created[0].requestedChanges.metaDescription).toBe(OWNER_DESCRIPTION);
  });

  it("defaults to the homepage when no page is named", async () => {
    created.length = 0;
    await executeTool(db([HOME, ABOUT]), CTX, "propose_page_meta", { title: "Candles from Shahjahanpur" }, "");
    expect(created[0].targetRef).toBe("p1");
    expect(created[0].requestedChanges.seoTitle).toBe("Candles from Shahjahanpur");
  });

  it("asks which page rather than writing to the wrong one", async () => {
    const result = await executeTool(db([HOME, ABOUT]), CTX, "propose_page_meta", { page: "blog", metaDescription: "x" }, "");
    expect(result.needs_clarification).toBe(true);
    expect(result.candidates.map((c: any) => c.page)).toEqual(["home", "about"]);
  });

  it("refuses when there is nothing to set", async () => {
    const result = await executeTool(db([HOME]), CTX, "propose_page_meta", {}, "");
    expect(result.error).toMatch(/Tell me what to set/);
  });

  it("says there is no website rather than failing obscurely", async () => {
    const result = await executeTool(db([], null), CTX, "propose_page_meta", { metaDescription: "x" }, "");
    expect(result.error).toMatch(/doesn't have a Hawlai website yet/);
  });

  it("puts the Approve / Edit / Reject buttons on the card, not a link to a page", async () => {
    const result = await executeTool(db([HOME]), CTX, "propose_page_meta", { metaDescription: OWNER_DESCRIPTION }, "");
    const artifact: any = extractArtifact("propose_page_meta", { page: "home" }, result);
    expect(artifact.approval).toEqual({ id: "approval-1", publishActionId: "action-1" });
    expect(artifact.summary).toMatch(/nothing on the live site changes until you approve/i);
    // The card carries the warnings the preview raised — an owner
    // approving should see "this site isn't published" before they do.
    expect(JSON.stringify(artifact.fields)).toMatch(/isn't published/);
  });
});

describe("what the chat is told about applying it", () => {
  const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");

  it("the system prompt says the tool exists and that only a read-back may be called live", () => {
    expect(brain).toMatch(/You CAN set the search title and meta description on their website from this chat/);
    expect(brain).toMatch(/NEVER send someone to Website Builder to paste meta tags in by hand/);
    expect(brain).toMatch(/never call it live because a tool saved a row/);
  });

  it("the approve route passes the read-back verdict through to the card", () => {
    const route = readFileSync("src/app/api/approvals/[id]/route.ts", "utf8");
    expect(route).toContain("verification");
    expect(route).toMatch(/verified: Boolean\(verification\.verified\)/);
    const chat = readFileSync("src/components/chat/MasterChatPage.tsx", "utf8");
    // The verdict is what the owner reads, not a generic "Applied."
    expect(chat).toContain("data?.publish?.message ?? \"Applied to your store.\"");
    expect(chat).toContain("data?.publish?.verified === false");
  });
});

describe("the share image from chat", () => {
  const PHOTO = "https://cdn.hawlai.test/candle.jpg";

  it("passes a real photo through to the approval card", async () => {
    created.length = 0;
    const result = await executeTool(db([HOME]), CTX, "propose_page_meta", { shareImageUrl: PHOTO }, "");
    expect(result.success).toBe(true);
    expect(created[0].requestedChanges.ogImageUrl).toBe(PHOTO);
    // The picture itself on the card, not its address: someone
    // approving a link preview should see the preview.
    const artifact: any = extractArtifact("propose_page_meta", {}, result);
    expect(artifact.imageUrl).toBe(PHOTO);
  });

  it("ignores something that is not a URL rather than storing it", async () => {
    const result = await executeTool(db([HOME]), CTX, "propose_page_meta", { shareImageUrl: "the lavender one" }, "");
    expect(result.error).toMatch(/can't back up|Tell me what to set/);
  });

  it("tells the model never to generate one", async () => {
    const tool: any = TOOLS.find((t: any) => t.name === "propose_page_meta");
    expect(tool.input_schema.properties.shareImageUrl.description).toMatch(/never a generated image/);
    expect(tool.input_schema.properties.shareImageUrl.description).toMatch(/ask them to upload one/);
  });

  it("the builder takes an upload, not a pasted URL", () => {
    const builder = readFileSync("src/components/website-builder/WebsiteBuilderView.tsx", "utf8");
    expect(builder).toMatch(/Share image — shown when this page is sent on WhatsApp/);
    expect(builder).toMatch(/onUploaded=\{\(url\) => updatePageMeta\(currentPage\.id, "og_image_url", url\)\}/);
    // The field that asked an owner to find a URL for a photo on their
    // phone is gone.
    expect(builder).not.toMatch(/Open Graph image URL/);
  });
});
