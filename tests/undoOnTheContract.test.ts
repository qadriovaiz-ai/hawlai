// S3/P1 — UNDO IS A CONTRACT METHOD, NOT ONE TOOL'S SPECIAL CASE.
//
// Before this, putting a site change back was about a hundred lines
// inside a single `case` in masterBrainV2.ts, hard-wired to
// action_key = "update_page_text". The consequence was not theoretical:
// `update_page_meta` — which changes what the whole internet sees of a
// page — had NO undo at all, because nobody was going to hand-write the
// second copy of that logic.
//
// WHY `undo?()` IS OPTIONAL ON THE INTERFACE. A platform that cannot
// put its own change back must not pretend it can, and
// autonomyLevels.canHoldL1 refuses L1 to any action without an undo. So
// Shopify and Meta leaving it off is a statement with a consequence,
// which is the opposite of a gap.
//
// The architecture plan sized S3 around building a store for the
// previous version. It already existed: `preview.changes[].before`.

import { describe, it, expect } from "vitest";
import { createHawlaiSitePlatform } from "@/lib/publish/platforms/hawlaiSite";
import { canHoldL1, effectiveLevel } from "@/lib/autonomyLevels";
import { code, sourceWithComments } from "./helpers/source";

const PAGE_ID = "page-1";
const SITE_ID = "site-1";

/** The two reads hawlaiSite.readPage makes, and nothing else. */
function fakeSupabase(over: { page?: any; site?: any } = {}) {
  const page =
    over.page === null
      ? null
      : {
          id: PAGE_ID,
          website_id: SITE_ID,
          slug: "home",
          title: "Home",
          seo_title: "New search title",
          meta_description: "New description",
          og_image_url: null,
          sections: [
            { id: "b1", type: "heading", props: { text: "The new heading" } },
            { id: "b2", type: "text", props: { text: "The new paragraph." } },
          ],
          page_type: "home",
          content_source: "builder",
          ...(over.page ?? {}),
        };
  const site = over.site === null ? null : { id: SITE_ID, slug: "a-business", published: true, dealership_id: "d1", ...(over.site ?? {}) };
  return {
    from(table: string) {
      const row = table === "website_pages" ? page : table === "websites" ? site : null;
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: row, error: null }),
      };
      return chain;
    },
  };
}

function action(over: Record<string, any> = {}): any {
  return {
    id: "act-1",
    dealershipId: "d1",
    platform: "hawlai_site",
    connectionRef: null,
    actionKey: "update_page_text",
    targetRef: PAGE_ID,
    targetLabel: "Homepage",
    requestedChanges: {},
    previewedAt: null,
    status: "executed",
    idempotencyKey: "k",
    preview: {
      summary: "s",
      changes: [{ field: "b1:text", before: "The old heading", after: "The new heading" }],
      warnings: [],
    },
    ...over,
  };
}

describe("1. the contract carries it", () => {
  it("THE SITE PLATFORM IMPLEMENTS undo()", () => {
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase() as any });
    expect(typeof platform.undo).toBe("function");
  });

  it("AND IT IS OPTIONAL, WHICH IS WHAT TIES P1 TO P0", () => {
    // A platform with no undo cannot hold L1. That is the whole reason
    // optionality is safe: absence refuses rather than permits.
    expect(canHoldL1("update_page_text", false).ok).toBe(false);
    expect(effectiveLevel("update_page_text", { stored: "L1", hasUndo: false })).toBe("L0");
    expect(effectiveLevel("update_page_text", { stored: "L1", hasUndo: true })).toBe("L1");
  });

  it("the interface says undo reads and does not write", () => {
    const src = code("src/lib/publish/types.ts");
    const block = src.slice(src.indexOf("undo?(action"), src.indexOf("undo?(action") + 200);
    expect(src).toMatch(/undo\?\(action: PublishActionRecord\): Promise<UndoProposal>/);
    expect(block.length).toBeGreaterThan(0);
  });
});

describe("2. page text — the behaviour that already existed, unchanged", () => {
  it("PROPOSES EXACTLY WHAT THE LINE SAID BEFORE, AND MARKS IT A RESTORE", async () => {
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase() as any });
    const r = await platform.undo!(action());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.actionKey).toBe("update_page_text");
    expect(r.targetRef).toBe(PAGE_ID);
    const edits = (r.requestedChanges as any).edits;
    expect(edits[0].before).toBe("The new heading");
    expect(edits[0].after).toBe("The old heading");
    expect(r.changed).toEqual([{ what: "heading", from: "The new heading", to: "The old heading" }]);
  });

  it("tells the owner it is not a rewrite", async () => {
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase() as any });
    const r = await platform.undo!(action());
    if (!r.ok) throw new Error("expected ok");
    expect((r.requestedChanges as any).claimWarnings[0]).toMatch(/word for word/);
  });

  it("REFUSES RATHER THAN GUESSES when nothing was recorded", async () => {
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase() as any });
    const r = await platform.undo!(action({ preview: { summary: "s", changes: [{ field: "b1:text", before: "", after: "x" }], warnings: [] } }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/won't guess at your page copy/);
  });

  it("refuses when the page already says the old thing", async () => {
    const supabase = fakeSupabase({ page: { sections: [{ id: "b1", type: "heading", props: { text: "The old heading" } }] } });
    const platform = createHawlaiSitePlatform({ supabase: supabase as any });
    const r = await platform.undo!(action());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/already says what it said before/);
  });

  it("refuses when the page is gone, and does not call it a failure", async () => {
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase({ page: null }) as any });
    const r = await platform.undo!(action());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/isn't on your website any more/);
  });

  it("refuses when the edit was never previewed", async () => {
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase() as any });
    const r = await platform.undo!(action({ preview: null }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/never previewed/);
  });
});

describe("3. page meta — NEW, and the reason the lift was worth doing", () => {
  const metaAction = () =>
    action({
      actionKey: "update_page_meta",
      preview: {
        summary: "s",
        changes: [
          { field: "seoTitle", before: "Old search title", after: "New search title" },
          { field: "metaDescription", before: "Old description", after: "New description" },
        ],
        warnings: [],
      },
    });

  it("PUTS THE SEARCH LISTING BACK — which had no undo at all before", async () => {
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase() as any });
    const r = await platform.undo!(metaAction());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.actionKey).toBe("update_page_meta");
    expect(r.requestedChanges).toEqual({ seoTitle: "Old search title", metaDescription: "Old description" });
  });

  it("SAYS THAT SEARCH TAKES ITS OWN TIME, because that is not obvious", async () => {
    // A line of page text is back the moment it saves. A search listing
    // is not, and an owner who is not told that will think undo failed.
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase() as any });
    const r = await platform.undo!(metaAction());
    if (!r.ok) throw new Error("expected ok");
    expect(r.warnings.join(" ")).toMatch(/few days/);
  });

  it("names the fields in the owner's terms, not the column's", async () => {
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase() as any });
    const r = await platform.undo!(metaAction());
    if (!r.ok) throw new Error("expected ok");
    expect(r.changed.map((c) => c.what)).toEqual(["search title", "search description"]);
  });

  it("refuses when the listing already says the old thing", async () => {
    const supabase = fakeSupabase({ page: { seo_title: "Old search title", meta_description: "Old description" } });
    const platform = createHawlaiSitePlatform({ supabase: supabase as any });
    const r = await platform.undo!(metaAction());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/already says what it said before/);
  });

  it("AND AN ACTION IT DOES NOT KNOW HOW TO REVERSE IS REFUSED, not attempted", async () => {
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase() as any });
    const r = await platform.undo!(action({ actionKey: "update_product_price" }));
    expect(r.ok).toBe(false);
  });
});

describe("4. the chat tool dispatches instead of knowing", () => {
  const src = code("src/lib/agents/masterBrainV2.ts");
  const caseBody = src.slice(src.indexOf('case "undo_page_edit"'), src.indexOf('case "read_page"'));

  it("CALLS THE PLATFORM'S undo, and refuses when a platform has none", () => {
    expect(caseBody).toMatch(/undoPlatform\.undo\(/);
    expect(caseBody).toMatch(/if \(!undoPlatform\.undo\)/);
  });

  it("NO LONGER BUILDS THE RESTORE EDITS ITSELF", () => {
    // The mapping of "<blockId>:<prop>" to a restore edit is site
    // knowledge and now lives in one place. If this reappears here, the
    // second copy is back and meta will drift again.
    expect(caseBody).not.toMatch(/restore: true/);
    expect(caseBody).not.toMatch(/applyEdits|applyUndo/);
  });

  it("and still selects the action it is reversing by label, which P2 fixes", () => {
    // Recorded, not hidden: this is R1 in the plan and it is live.
    expect(caseBody).toMatch(/target_label/);
    // THE COMMENT IS THE ASSERTION HERE, so this reads the source WITH
    // comments — CLAUDE.md rule 8. The limitation is not in the code,
    // it is the code, and what makes it honest is that it is written
    // down next to it. `code()` strips exactly that away.
    const withComments = sourceWithComments("src/lib/agents/masterBrainV2.ts");
    const commented = withComments.slice(withComments.indexOf('case "undo_page_edit"'), withComments.indexOf('case "read_page"'));
    expect(commented).toMatch(/P2/);
    expect(commented).toMatch(/reverses the\s+\/\/\s+wrong one|wrong one/);
  });

  it("reads the action key rather than assuming one", () => {
    expect(caseBody).toMatch(/action_key, target_ref/);
  });
});

describe("5. S3/P2 — has the page moved on since that edit?", () => {
  it("REFUSES WHEN THE LINE CHANGED AGAIN, because restoring would wipe that out", async () => {
    // The page says neither what the edit set it to ("The new heading")
    // nor what it said before ("The old heading"). Something else
    // changed it afterwards, and the approval card would have shown
    // "from The new heading to The old heading" — a from-value that is
    // not on the page.
    const supabase = fakeSupabase({ page: { sections: [{ id: "b1", type: "heading", props: { text: "A third heading entirely" } }] } });
    const platform = createHawlaiSitePlatform({ supabase: supabase as any });
    const r = await platform.undo!(action());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/changed again since the edit/);
  });

  it("AND SAYS WHAT IT ACTUALLY SAYS NOW, so the owner can decide", async () => {
    const supabase = fakeSupabase({ page: { sections: [{ id: "b1", type: "heading", props: { text: "A third heading entirely" } }] } });
    const platform = createHawlaiSitePlatform({ supabase: supabase as any });
    const r = await platform.undo!(action());
    if (r.ok) throw new Error("expected refusal");
    expect(r.reason).toMatch(/A third heading entirely/);
    expect(r.reason).toMatch(/set it directly/);
  });

  it("is not confused by the page already being back", async () => {
    // now === before must stay "nothing to put back", not "moved on".
    // The two refusals mean different things to an owner.
    const supabase = fakeSupabase({ page: { sections: [{ id: "b1", type: "heading", props: { text: "The old heading" } }] } });
    const platform = createHawlaiSitePlatform({ supabase: supabase as any });
    const r = await platform.undo!(action());
    if (r.ok) throw new Error("expected refusal");
    expect(r.reason).toMatch(/already says what it said before/);
    expect(r.reason).not.toMatch(/changed again/);
  });

  it("and lets an untouched line through", async () => {
    const platform = createHawlaiSitePlatform({ supabase: fakeSupabase() as any });
    const r = await platform.undo!(action());
    expect(r.ok).toBe(true);
  });

  it("ASKS THE SAME QUESTION OF A SEARCH LISTING", async () => {
    const supabase = fakeSupabase({ page: { seo_title: "Something else again", meta_description: "New description" } });
    const platform = createHawlaiSitePlatform({ supabase: supabase as any });
    const r = await platform.undo!(
      action({
        actionKey: "update_page_meta",
        preview: {
          summary: "s",
          changes: [
            { field: "seoTitle", before: "Old search title", after: "New search title" },
            { field: "metaDescription", before: "Old description", after: "New description" },
          ],
          warnings: [],
        },
      })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/changed again since the edit/);
  });
});

describe("6. S3/P2 — an id beats a guess", () => {
  const src = code("src/lib/agents/masterBrainV2.ts");
  const caseBody = src.slice(src.indexOf('case "undo_page_edit"'), src.indexOf('case "read_page"'));

  it("THE TOOL CAN BE TOLD EXACTLY WHICH EDIT", () => {
    const schema = src.slice(src.indexOf('name: "undo_page_edit"'), src.indexOf('name: "generate_social_management"'));
    expect(schema).toMatch(/edit_id/);
    expect(schema).toMatch(/action_id/);
  });

  it("AND THE LOOKUP IS SCOPED TO THIS BUSINESS AND TO AN APPLIED EDIT", () => {
    // An id is owner-supplied input. Without both filters it could name
    // another business's action, or one still awaiting approval - which
    // needs no undo at all, only a rejection.
    const byId = caseBody.slice(caseBody.indexOf("if (askedId)"), caseBody.indexOf("} else if (askedPage)"));
    expect(byId).toMatch(/\.eq\("dealership_id", ctx\.id\)/);
    expect(byId).toMatch(/\.eq\("id", askedId\)/);
    expect(byId).toMatch(/\.eq\("status", "executed"\)/);
  });

  it("the guess survives as a fallback, and is NAMED BACK to the owner", () => {
    // The fault was never the fallback. It was that a wrong guess was
    // invisible until after it was approved.
    expect(caseBody).toMatch(/chosenBy/);
    expect(caseBody).toMatch(/undoing:/);
  });

  it("and an id that names nothing applied is refused with the useful answer", () => {
    expect(caseBody).toMatch(/reject the card instead/);
  });
});
