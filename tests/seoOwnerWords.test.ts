// Two failures from one chat turn on 2026-09-28, both pinned here.
//
// The owner of a candle business pasted their own line — handmade
// candles "made by hand in Shahjahanpur", ending "Shop now." — and asked
// for it as their meta description. Chat came back with "Uttar Pradesh"
// instead of the town, a brand slogan instead of "Shop now", an
// explanation that a character limit required it (the line was about 150
// characters; the limit is 160), and "Done — that's set."
//
// Nothing was set. generate_seo writes a row in seo_toolkit_items, a
// list of suggestions. The title and description Google reads live in
// website_pages, which only Website Builder writes.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const OWNER_LINE =
  "Hand-poured soy candles made by hand in Shahjahanpur, in small batches, with fragrance that lasts the whole evening. Shop now.";

const claudeCall = vi.fn();
vi.mock("@/lib/ai/claude", () => ({
  callClaude: (...args: any[]) => claudeCall(...args),
  withAiFailure: (fallback: any) => fallback,
  aiFailureMessage: () => "AI unavailable",
}));
vi.mock("@/lib/seo/searchQueries", () => ({ formatQueriesForPrompt: () => "" }));

import { generateSeoTask } from "../src/lib/agents/seoToolkitAgent";

function claudeReturns(json: object) {
  claudeCall.mockResolvedValue({ ok: true, text: JSON.stringify(json), data: { content: [] } });
}

describe("the owner's own words in an SEO task", () => {
  beforeEach(() => claudeCall.mockReset());

  it("survives a model that rewrote them anyway", async () => {
    // Exactly what came back that day.
    claudeReturns({
      metaTitle: "Candle by Qaaf — Handmade Soy Candles",
      metaDescription: "Hand-poured soy candles made by hand in Uttar Pradesh, in small batches. Shop Candle by Qaaf.",
    });

    const { output } = await generateSeoTask(
      "meta_tags", "Candle by Qaaf", "Shahjahanpur", "candles", null, undefined, undefined, [], OWNER_LINE
    );

    expect(output.metaDescription).toBe(OWNER_LINE);
    expect(output.metaDescription).toContain("Shahjahanpur");
    expect(output.metaDescription).toContain("Shop now.");
    expect(output.metaDescription).not.toContain("Uttar Pradesh");
    // So the reply can say the words are the owner's, unedited.
    expect(output._ownerWordsRestored).toBe(true);
    // What the model got right is kept.
    expect(output.metaTitle).toContain("Candle by Qaaf");
  });

  it("leaves the result alone when the model did use them", async () => {
    claudeReturns({ metaTitle: "Candle by Qaaf", metaDescription: OWNER_LINE });
    const { output } = await generateSeoTask(
      "meta_tags", "Candle by Qaaf", "Shahjahanpur", "candles", null, undefined, undefined, [], OWNER_LINE
    );
    expect(output.metaDescription).toBe(OWNER_LINE);
    expect(output._ownerWordsRestored).toBeUndefined();
  });

  it("keeps them alongside the result for a task with no obvious field", async () => {
    claudeReturns({ actions: [{ action: "Fix the NAP", why: "It differs across listings" }] });
    const { output } = await generateSeoTask(
      "local_seo", "Candle by Qaaf", "Shahjahanpur", "candles", null, undefined, undefined, [], OWNER_LINE
    );
    expect(output.ownerText).toBe(OWNER_LINE);
    expect(output.actions).toHaveLength(1);
  });

  it("changes nothing when the owner gave no wording of their own", async () => {
    claudeReturns({ metaTitle: "A title", metaDescription: "A description" });
    const { output } = await generateSeoTask("meta_tags", "Candle by Qaaf", "Shahjahanpur", "candles");
    expect(output).toEqual({ metaTitle: "A title", metaDescription: "A description" });
  });

  it("asks the model for the exact line too, and forbids inventing a limit", async () => {
    claudeReturns({ metaDescription: OWNER_LINE });
    await generateSeoTask(
      "meta_tags", "Candle by Qaaf", "Shahjahanpur", "candles", null, undefined, undefined, [], OWNER_LINE
    );
    const prompt = claudeCall.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain(OWNER_LINE);
    expect(prompt).toMatch(/character for character/i);
    expect(prompt).toMatch(/Never claim a limit forced a change/i);
  });
});

describe("what chat is allowed to claim about an SEO draft", () => {
  const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");

  it("carries a note saying the live site did not change", () => {
    // The note is what the model reports from, so it has to be in the
    // result rather than only in the system prompt.
    expect(brain).toContain("note: seoDraftNote(input.taskType, output)");
    const note = brain.slice(brain.indexOf("function seoDraftNote"), brain.indexOf("export async function executeTool"));
    expect(note).toMatch(/live website is unchanged/i);
    expect(note).toMatch(/Website Builder/);
    expect(note).toMatch(/Never say it is set, live, updated or done/i);
    // The homepage title tag is the business name (lib/siteMetadata.ts),
    // so no meta title suggestion can ever become it. Pointing an owner
    // at a field that does not exist is the same false promise again.
    expect(note).toMatch(/homepage title tag is the business name/i);
  });

  it("the homepage title really is the business name, which is why the note says so", () => {
    const metadata = readFileSync("src/lib/siteMetadata.ts", "utf8");
    expect(metadata).toContain('pageSlug === "home" ? dealershipName');
  });

  it("tells the model both rules in the system prompt", () => {
    expect(brain).toMatch(/Saved is not live/);
    expect(brain).toMatch(/those words are the answer/);
    expect(brain).toMatch(/Shahjahanpur" does not become "Uttar Pradesh/);
  });

  it("gives the tool somewhere to put the owner's line", () => {
    const tool = brain.slice(brain.indexOf('name: "generate_seo"'), brain.indexOf('name: "generate_social_management"'));
    expect(tool).toContain("exactText");
    expect(tool).toMatch(/DRAFTS/);
    expect(tool).toMatch(/does not set what Google reads/i);
  });
});
