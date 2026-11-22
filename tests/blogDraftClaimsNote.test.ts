// A draft that kept an unbacked claim must SAY SO on the card.
//
// THE SLIP, 21 November 2026. A blog post reached the owner reading
// "No paraffin, no shortcuts." for a business whose records say nothing
// about shortcuts, with no warning and nothing stripped. Four
// explanations were measured and ruled out — the term is on the list and
// fires on that exact sentence; the records really do not back it; the
// site-as-evidence loop makes no difference to it; and item 4 was a test
// that changed no code path. What was left is this:
//
//   "no shortcuts" is NOT in PERFORMANCE_CLAIMS, so it is a COMPOSITION
//   claim. Those are `reasons.substantiation(...)`: KEPT in a draft with
//   a note, stripped on publish. The text surviving is BY DESIGN.
//
// So the only defect was the missing warning — and it was missing in two
// ways at once:
//
//   1. generate_seo_keywords + writeFullBlogPost hand-builds its card's
//      `draft` and carried no note at all. `_claimsNote` reached the
//      MODEL in the tool result and the system prompt asks it to repeat
//      the note, which is a prompt instruction and not a guard.
//   2. `grep -rl writeFullBlogPost tests/` was ZERO FILES. The longest
//      piece of customer-facing prose this product writes had no test on
//      its chat path.
//
// Both are closed here. The note is attached where `_storyNote` already
// was — the cross-cutting point that runs whichever tool produced the
// piece — because that comment records this exact failure for its own
// field: "the Content Marketing page had this note from the start; chat
// silently dropped it."

import { describe, it, expect, vi, beforeEach } from "vitest";
import { code, sourceWithComments } from "./helpers/source";
import { guardGenerated } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";

const BRAIN = "src/lib/agents/masterBrainV2.ts";
const PAGE = "src/components/chat/MasterChatPage.tsx";

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "A home fragrance business",
    category: "Home fragrance",
    categoryKnown: true,
    businessModels: { models: ["products"], inferred: false },
    city: "Lucknow",
    site: null,
    home: null,
    products: [{ id: "p1", name: "A scented item", price: 450, description: "Poured by hand in small batches.", images: [], inventory: 5, category: null, active: true } as any],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 0, leads: 0 },
    // THE RECORD AS THE REAL BUSINESS HOLDS IT. It states the wax and
    // says nothing about shortcuts, which is why only HALF of the
    // slipped sentence was ever a problem — tests/shortcutClaims.test.ts
    // pins that half being correctly allowed.
    ownerFacts: [{ category: "general", title: "What goes in", content: "Everything here is paraffin-free." } as any],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: null, products: [], booking: null } as any,
    season: seasonFor([], "2026-11-22"),
    unreadable: [],
    ...over,
  } as unknown as BusinessFacts;
}

/** What the model is made to return, per test. */
let reply: any = {};

vi.mock("@/lib/ai/claude", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/claude")>();
  return {
    ...original,
    callClaude: async () => ({
      ok: true,
      text: JSON.stringify(reply),
      data: { content: [{ type: "text", text: JSON.stringify(reply) }], usage: { input_tokens: 10, output_tokens: 10 } },
    }),
  };
});
vi.mock("@/lib/usage/researchCredits", () => ({ recordResearchCredits: async () => {} }));

const SLIP = "Every piece is poured by hand. No paraffin, no shortcuts.";

beforeEach(() => {
  reply = {};
});

describe("1. THE CLAIM ITSELF — kept in a draft, and that is the design", () => {
  it("THE LOAD-BEARING ONE: a draft keeps it, a publish strips it, and BOTH get a note", () => {
    // Stated here rather than assumed, because every conclusion below
    // rests on it — and because the first instinct on reading the slip
    // was that the strip had failed. It had not.
    const draft = guardGenerated({ body: SLIP }, facts(), "draft");
    expect(draft.removed, "a composition claim must not be stripped from a draft").toEqual([]);
    expect(draft.substantiation.join(" ")).toMatch(/no shortcuts/);
    expect(String((draft.output as any).body)).toMatch(/no shortcuts/);
    expect(String((draft.output as any)._claimsNote ?? ""), "the draft produced no note to show").toMatch(/no shortcuts/);

    const published = guardGenerated({ body: SLIP }, facts(), "publish");
    expect(published.removed.join(" ")).toMatch(/no shortcuts/);
    expect(String((published.output as any).body)).not.toMatch(/no shortcuts/);
  });

  it("and the note says what to write down to keep it", () => {
    // A flag with no way forward reads as a bug.
    const draft = guardGenerated({ body: SLIP }, facts(), "draft");
    const note = String((draft.output as any)._claimsNote ?? "");
    expect(note).toMatch(/kept because you're reviewing this draft/);
    expect(note).toMatch(/published copy drops it/);
    expect(note).toMatch(/Business Knowledge|product description/);
  });

  it("NOT VACUOUS: once the owner records it, there is no note at all", () => {
    const said = facts({
      ownerFacts: [{ category: "general", title: "How we make them", content: "Everything here is paraffin-free. We take no shortcuts — every piece is cured properly." } as any],
    });
    const draft = guardGenerated({ body: SLIP }, said, "draft");
    expect(draft.substantiation.join(" ")).not.toMatch(/shortcut/);
    expect(String((draft.output as any)._claimsNote ?? "")).not.toMatch(/shortcut/);
  });
});

describe("2. writeFullBlogPost — the path that had no test at all", () => {
  it("THE LOAD-BEARING ONE: the note travels out of the blog generator", async () => {
    // END TO END through generateBlogPost -> generateCopy -> the guard,
    // with only the model faked. Before today `grep -rl
    // writeFullBlogPost tests/` returned nothing.
    reply = {
      title: "How we make them",
      content: SLIP,
      metaDescription: "A look at how each one is made.",
      targetIntent: "informational",
      headingOutline: [{ level: "H2", heading: "How we make them" }],
      internalLinkSuggestions: [],
    };
    const { generateBlogPost } = await import("@/lib/agents/seoAgent");
    const post: any = await generateBlogPost("how we make them", "Lucknow", "home fragrance", undefined, facts(), null);

    expect(post.content, "a draft must keep the owner's composition claim").toMatch(/no shortcuts/);
    expect(String(post._claimsNote ?? ""), "the blog generator dropped the note").toMatch(/no shortcuts/);
    // AND claimsRemoved IS CORRECTLY ABSENT HERE, which is worth
    // stating: nothing was removed, because a composition claim is
    // KEPT in a draft. My first version of this test asserted the
    // opposite and failed — the note and the list answer different
    // questions, and the next test is the one that pins the list.
    expect(post.claimsRemoved ?? null, "nothing was removed, so nothing should be listed as removed").toBeNull();
  });

  it("A PERFORMANCE CLAIM IS REMOVED EVEN FROM A DRAFT, and listed", async () => {
    // The other half of the split, and the one that pins claimsRemoved.
    // "no soot" is in PERFORMANCE_CLAIMS: a customer will test it, so a
    // draft-lenient version of it is exactly the hole the 8 October
    // caption came through. Both modes strict.
    reply = {
      title: "How it burns",
      content: "It burns with no soot at the rim.",
      metaDescription: "How it burns.",
      targetIntent: "informational",
      headingOutline: [],
      internalLinkSuggestions: [],
    };
    const { generateBlogPost } = await import("@/lib/agents/seoAgent");
    const post: any = await generateBlogPost("how it burns", null, "home fragrance", undefined, facts(), null);
    expect((post.claimsRemoved ?? []).join(" "), "a performance claim was not listed as removed").toMatch(/soot/);
    expect(post.content).not.toMatch(/no soot/);
    expect(String(post._claimsNote ?? "")).toMatch(/soot/);
  });

  it("and a post with nothing to flag carries no note", async () => {
    reply = {
      title: "Choosing a scent for a small room",
      content: "Start with one in the room you use most, then move it if you want to.",
      metaDescription: "How much scent a small room needs.",
      targetIntent: "informational",
      headingOutline: [{ level: "H2", heading: "Small rooms" }],
      internalLinkSuggestions: [],
    };
    const { generateBlogPost } = await import("@/lib/agents/seoAgent");
    const post: any = await generateBlogPost("scent for a small room", "Lucknow", "home fragrance", undefined, facts(), null);
    expect(post.content, "the guard emptied a sentence with nothing to flag").toMatch(/room you use most/);
    expect(post._claimsNote ?? null).toBeNull();
  });

  it("a model-invented slug never survives, which is the other thing this path guards", async () => {
    // Asserted so the test above cannot be the only thing holding this
    // function, and because it is the failure its own comment records.
    reply = {
      title: "A guide",
      content: "A short guide.",
      metaDescription: "A guide.",
      targetIntent: "informational",
      headingOutline: [],
      internalLinkSuggestions: [{ anchorText: "our range", linksToSlug: "invented-page", why: "fits" }],
    };
    const { generateBlogPost } = await import("@/lib/agents/seoAgent");
    const post: any = await generateBlogPost("a guide", null, "home fragrance", undefined, facts(), [{ slug: "real-page", title: "Real page" }]);
    expect(post.internalLinkSuggestions).toEqual([]);
  });
});

describe("3. THE NOTE REACHES THE CARD, cross-cutting rather than per tool", () => {
  it("THE LOAD-BEARING ONE: _claimsNote is attached wherever _storyNote is", () => {
    // Sliced to the attach point and bounded at BOTH ends: `artifact.`
    // appears hundreds of times in this file.
    const src = code(BRAIN);
    const start = src.indexOf("artifact.storyNote = result._storyNote;");
    expect(start, "the cross-cutting attach point has moved").toBeGreaterThan(-1);
    const end = src.indexOf("validateAdvertisingClaimCompliance", start);
    expect(end, "the end of the attach block has moved").toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block.length).toBeGreaterThan(40);
    // ANCHORED ON THE CONDITION, because `if (false && …)` leaves every
    // word of the body in the file — the miss that survived a mutation
    // on 22 November in another file the same day.
    expect(block).toMatch(/if \(artifact && typeof result\?\._claimsNote === "string"/);
    expect(block).toMatch(/artifact\.claimsNote = result\._claimsNote/);
  });

  it("BOTH Artifact declarations carry the field, which is the drift this file is warned about", () => {
    // masterBrainV2's own Artifact comment records a live test finding a
    // field missing from MasterChatPage's copy entirely. Two separate
    // declarations, so both are asserted.
    expect(code(BRAIN), "the server-side Artifact lacks claimsNote").toMatch(/^\s*claimsNote\?: string;/m);
    expect(code(PAGE), "the client-side Artifact lacks claimsNote").toMatch(/^\s*claimsNote\?: string;/m);
  });

  it("the card renders it on every branch that renders the story note", () => {
    // A branch that shows the piece but not what was taken out of it is
    // the failure this exists for — and this file has an early return
    // per card shape, which is how the picture was eaten on 8 November.
    const page = code(PAGE);
    expect(page).toMatch(/const claimsWarning = artifact\.claimsNote \?/);
    const story = (page.match(/^\s*\{storyWarning\}$/gm) ?? []).length;
    const claims = (page.match(/^\s*\{claimsWarning\}$/gm) ?? []).length;
    expect(story, "no branch renders the story note any more").toBeGreaterThanOrEqual(4);
    expect(claims, "the claims note is rendered on fewer branches than the story note").toBe(story);
  });

  it("AND EXACTLY ONCE PER BRANCH, because it used to be twice", () => {
    // Pre-existing and fixed in the same commit: the AEO branch rendered
    // {storyWarning} on two consecutive lines, so the owner read the
    // same note twice. This file's own comments record the same bug
    // being removed from two other branches.
    const page = code(PAGE);
    for (const name of ["storyWarning", "claimsWarning"]) {
      const doubled = new RegExp(`\\{${name}\\}\\s*\\n\\s*\\{${name}\\}`);
      expect(page, `${name} is rendered twice in a row`).not.toMatch(doubled);
    }
  });

  it("it is its own strip and not a fields row, for the reason CopyChange records", () => {
    // A field renders on one line with `truncate`; this note is three
    // sentences. Read WITH comments deliberately — the reasoning is the
    // thing being protected (rule 8).
    const withComments = sourceWithComments(PAGE);
    const start = withComments.indexOf("const claimsWarning = artifact.claimsNote");
    expect(start).toBeGreaterThan(-1);
    const reason = withComments.slice(Math.max(0, start - 1200), start);
    expect(reason, "the choice of a strip over a field is undocumented").toMatch(/truncate/);

    // AND THE MARKUP ITSELF, because the comment above is not the
    // behaviour. A mutation swapping `leading-snug` for `truncate`
    // SURVIVED while this test asserted only the reasoning: the note was
    // cut off mid-sentence and the documentation still read correctly.
    const markup = code(PAGE);
    const stripStart = markup.indexOf("const claimsWarning = artifact.claimsNote");
    const stripEnd = markup.indexOf(") : null;", stripStart);
    expect(stripEnd, "the strip has no end").toBeGreaterThan(stripStart);
    const strip = markup.slice(stripStart, stripEnd);
    expect(strip, "the note is rendered on one truncating line").toMatch(/leading-snug/);
    expect(strip).not.toMatch(/truncate|line-clamp/);
  });
});

describe("4. rule 3 — nothing here names a business, product or trade", () => {
  it("the fixture and the strip heading are category-neutral", () => {
    const forbidden = /candle|qaaf|kurta|dealership|salon|bakery/i;
    expect(SLIP, "the fixture sentence names a trade").not.toMatch(forbidden);
    const page = code(PAGE);
    const strip = page.slice(page.indexOf("const claimsWarning"), page.indexOf("const claimsWarning") + 700);
    expect(strip).not.toMatch(forbidden);
  });
});
