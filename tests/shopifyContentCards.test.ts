// The approval card for the three Shopify content tools.
//
// THE BUG THE OWNER FOUND, 21 November 2026, and it is the registry
// failure wearing a different coat. `edit_collection_text` ran, created
// the approval row, and returned "Ready for your approval below" — but
// `extractArtifact` had no case for it and the tool has no
// DEPARTMENT_HREF, so `default` returned null and NO CARD RENDERED.
//
// The approval existed in the database with no way to take it from the
// chat, and the model dutifully told him the card was right below.
// `publish_blog_post` and `upload_store_image` were the same.
//
// The sentence was already in this codebase, on the propose_page_meta
// card: "Without the approval id the owner gets a description of a
// change with no way to take it." It was true of three more tools for
// a day.
//
// CALLED, NOT GREPPED, and extractArtifact's own comment says why:
// "Every test of this function so far has read its SOURCE TEXT and
// asserted that certain lines appear. Four separate card bugs survived
// that." Grepping cannot tell you what a function RETURNS.

import { describe, it, expect } from "vitest";
import { extractArtifact } from "@/lib/agents/masterBrainV2";

/** What a handler returns on success, as the real ones do. */
const approved = (over: Record<string, unknown> = {}) => ({
  success: true,
  approval_id: "ap-1",
  action_id: "act-1",
  summary: "a summary",
  note: "Ready for your approval below.",
  warnings: [],
  ...over,
});

describe("1. THE LOAD-BEARING ONE: a card with the buttons on it", () => {
  const TOOLS_WITH_APPROVALS = [
    ["edit_collection_text", approved({ collection: "frontpage", collection_title: "Home page", changed: [] })],
    ["publish_blog_post", approved({ blog: "news" })],
    ["upload_store_image", approved({ image_url: "https://example.supabase.co/x.png" })],
  ] as const;

  it.each(TOOLS_WITH_APPROVALS)("%s returns a card at all", (tool, result) => {
    // Before the fix this was null for all three, which is the whole
    // bug: no card, no buttons, no way to approve.
    const card = extractArtifact(tool, {}, result);
    expect(card, `${tool} produced no card`).not.toBeNull();
  });

  it.each(TOOLS_WITH_APPROVALS)("%s puts the approval ON the card", (tool, result) => {
    const card: any = extractArtifact(tool, {}, result);
    expect(card.approval, `${tool} has no approval on its card`).toBeTruthy();
    expect(card.approval.id).toBe("ap-1");
    // The publish action travels too, or the decision cannot reach the
    // executor.
    expect(card.approval.publishActionId).toBe("act-1");
  });

  it.each(TOOLS_WITH_APPROVALS)("%s does not claim an approval it was not given", (tool, result) => {
    // A card carrying buttons for an approval that does not exist is
    // worse than no card: the owner clicks and nothing can happen.
    const card: any = extractArtifact(tool, {}, { ...result, approval_id: undefined, action_id: undefined });
    expect(card?.approval).toBeUndefined();
  });
});

describe("2. what each card has to say before someone approves it", () => {
  it("a collection edit shows BOTH TEXTS WHOLE", () => {
    // A Shopify collection description is replaced outright, not
    // patched, so a truncated field would hide what is being lost.
    const card: any = extractArtifact(
      "edit_collection_text",
      {},
      approved({
        collection_title: "Home page",
        changed: [{ what: "Collection text", from: "<p>The old words.</p>", to: "<p>The new words.</p>" }],
      })
    );
    expect(card.changes).toHaveLength(1);
    expect(card.changes[0].before).toBe("<p>The old words.</p>");
    expect(card.changes[0].after).toBe("<p>The new words.</p>");
    // And it names which collection, so the owner is not approving
    // "a collection".
    expect(card.label).toContain("Home page");
  });

  it("A BLOG POST SAYS ON THE CARD THAT IT DOES NOT GO LIVE", () => {
    // The single thing an owner needs before approving: this does not
    // put a post in front of a customer. Said on the card, not only in
    // the chat line above it, because the card is what he is reading
    // when he decides.
    const card: any = extractArtifact("publish_blog_post", {}, approved({ blog: "news" }));
    const fields = JSON.stringify(card.fields);
    expect(fields).toMatch(/draft/i);
    expect(fields).toMatch(/No —/);
  });

  it("AN UPLOAD SHOWS THE PICTURE, not its address", () => {
    // Someone approving an upload should see what they are uploading.
    const url = "https://example.supabase.co/storage/x.png";
    const card: any = extractArtifact("upload_store_image", {}, approved({ image_url: url }));
    expect(card.imageUrl).toBe(url);
    // And says it appears nowhere yet.
    expect(JSON.stringify(card.fields)).toMatch(/only goes in the file library/i);
  });

  it("warnings from the preview reach the card", () => {
    // "This collection has no products in it yet" is exactly the kind
    // of thing that should stop an approval, and it is produced by the
    // adapter's preview.
    const card: any = extractArtifact(
      "edit_collection_text",
      {},
      approved({ warnings: ["This collection has no products in it yet."], changed: [] })
    );
    expect(card.summary).toContain("no products in it yet");
  });
});

describe("3. the clarification card, so a choice can be made by clicking", () => {
  it("edit_collection_text lists the collections it was given", () => {
    const card: any = extractArtifact(
      "edit_collection_text",
      {},
      {
        needs_clarification: true,
        question: "Which collection — Home page, Automated Collection, Hydrogen?",
        candidates: [
          { collection: "frontpage", title: "Home page" },
          { collection: "hydrogen", title: "Hydrogen" },
        ],
      }
    );
    const items = JSON.stringify(card.groups);
    expect(items).toContain("Home page");
    expect(items).toContain("Hydrogen");
    // No approval here — there is nothing to approve yet.
    expect(card.approval).toBeUndefined();
  });

  it("and so does publish_blog_post", () => {
    const card: any = extractArtifact(
      "publish_blog_post",
      {},
      { needs_clarification: true, candidates: [{ blog: "news", title: "News" }] }
    );
    expect(JSON.stringify(card.groups)).toContain("News");
  });
});

describe("4. THE WHOLE CLASS, so the next tool cannot ship cardless", () => {
  it("EVERY tool that can return an approval renders it on a card", () => {
    // The guard that would have caught this before the owner did. Any
    // tool whose handler can hand back an approval_id must have a case
    // here that passes it through — otherwise the approval exists in
    // the database and nowhere on screen.
    //
    // The list is the tools known to create publish actions from chat.
    const CREATORS = [
      "propose_price_change",
      "propose_page_meta",
      "edit_page_text",
      "undo_page_edit",
      "edit_collection_text",
      "publish_blog_post",
      "upload_store_image",
    ];
    const missing: string[] = [];
    for (const tool of CREATORS) {
      const card: any = extractArtifact(tool, {}, approved({ changed: [], page: "home", collection: "frontpage" }));
      if (!card) {
        missing.push(`${tool}: no card at all`);
        continue;
      }
      if (!card.approval?.id) missing.push(`${tool}: card has no approval`);
    }
    expect(
      missing,
      `These tools create an approval the owner cannot see or take:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("does not pass vacuously — a tool with no case really does return nothing", () => {
    // If extractArtifact started returning a card for anything, the
    // sweep above would stop meaning anything.
    expect(extractArtifact("a_tool_that_does_not_exist", {}, approved())).toBeNull();
  });
});
