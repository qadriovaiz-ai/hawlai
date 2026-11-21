// "Which one did you mean?" — asked so the answer is possible.
//
// THE INCIDENT, 21 November 2026, in the owner's own transcript. It
// took two turns to go wrong and the resolver was correct in both.
//
//   1. He asked for a collection's description without naming one.
//   2. The tool returned "Which collection did you mean?" with the
//      store's three real collections in a `candidates` field.
//      THE CHAT RELAYED THE QUESTION AND NOT THE LIST, asking him to
//      recall a name it had just been handed.
//   3. He answered "Home page" — a real collection, Shopify's own
//      default, handle `frontpage`.
//   4. The model did not call the tool again. It told him "Home page
//      is not a collection, it's a regular website page",
//      CONTRADICTING THE RESULT IT ALREADY HAD.
//
// One cause behind both: the answer was ADVISORY. A field beside the
// question is something the model may or may not use, and a name that
// "sounds like a page" was enough to override it.
//
// So the names go INSIDE the question — relaying the question relays
// them — and the note says the list came from the platform and is not
// open to argument. Same mechanism as `_claimsNote`, which the system
// prompt already tells the model to repeat rather than summarise.

import { describe, it, expect } from "vitest";
import { clarifyChoice } from "@/lib/chat/clarify";

/** The real store, from the live API on 21 November 2026. */
const LIVE_COLLECTIONS = [
  { key: "frontpage", title: "Home page" },
  { key: "automated-collection", title: "Automated Collection" },
  { key: "hydrogen", title: "Hydrogen" },
];

describe("1. THE INCIDENT, turn by turn", () => {
  const asked = clarifyChoice({
    noun: "collection",
    keyName: "collection",
    source: "this Shopify store",
    candidates: LIVE_COLLECTIONS,
  });

  it("THE LOAD-BEARING ONE: every name is IN the question", () => {
    // Turn 2 of the incident. The chat relayed the question and
    // dropped the list, because the list was somewhere else. A name
    // inside the question travels wherever the question travels.
    for (const c of LIVE_COLLECTIONS) {
      expect(asked.question, c.title).toContain(c.title);
    }
    expect(asked.question).toBe("Which collection — Home page, Automated Collection, Hydrogen?");
  });

  it("AND THE NOTE FORBIDS ARGUING WITH THE LIST", () => {
    // Turn 4, the worse half. The model had this list and still said
    // "Home page is not a collection". The note answers that directly:
    // the list is what the platform returned, and a name sounding like
    // a page is not evidence.
    expect(asked.note).toMatch(/Never tell him one of these is "not a collection"/);
    expect(asked.note).toMatch(/not evidence against it/);
    expect(asked.note).toMatch(/A collection can be called anything/);
  });

  it("and it says not to make him remember what he was just told", () => {
    expect(asked.note).toMatch(/do not ask him to remember a name you were just given/i);
  });

  it("the note repeats the names, so they survive a summarised reply", () => {
    // Belt and braces: if the model paraphrases the question, the note
    // still carries them.
    for (const c of LIVE_COLLECTIONS) expect(asked.note, c.title).toContain(c.title);
  });

  it("it still hands back machine-readable candidates for the follow-up call", () => {
    // The question is for the owner; this is for the next tool call.
    expect(asked.candidates).toEqual([
      { collection: "frontpage", title: "Home page" },
      { collection: "automated-collection", title: "Automated Collection" },
      { collection: "hydrogen", title: "Hydrogen" },
    ]);
    expect(asked.needs_clarification).toBe(true);
  });
});

describe("2. one candidate is a different question from several", () => {
  it("a near-match asks for a yes, not a choice", () => {
    // "Did you mean X?" is answerable with one word. Asking "which of
    // these?" about a single item is how a conversation stalls.
    const out = clarifyChoice({
      noun: "collection",
      keyName: "collection",
      source: "this Shopify store",
      candidates: [LIVE_COLLECTIONS[0]],
      confirmMessage: 'Did you mean "Home page"?',
    });
    expect(out.question).toBe('Did you mean "Home page"?');
    // The note still applies — this is the exact case where the model
    // decided a real collection was a page.
    expect(out.note).toContain("Home page");
    expect(out.note).toMatch(/Never tell him/);
  });

  it("without a confirm message it falls back to listing", () => {
    const out = clarifyChoice({
      noun: "blog",
      keyName: "blog",
      source: "this Shopify store",
      candidates: [{ key: "news", title: "News" }],
    });
    expect(out.question).toBe("Which blog — News?");
  });
});

describe("3. it works for every noun, not just collections", () => {
  it.each([
    ["page", "page"],
    ["blog", "blog"],
    ["collection", "collection"],
  ])("names the %s correctly throughout", (noun) => {
    const out = clarifyChoice({
      noun,
      keyName: noun,
      source: "this Shopify store",
      candidates: [{ key: "a", title: "Alpha" }, { key: "b", title: "Beta" }],
    });
    expect(out.question).toBe(`Which ${noun} — Alpha, Beta?`);
    expect(out.note).toContain(`not a ${noun}`);
    expect(out.candidates[0]).toEqual({ [noun]: "a", title: "Alpha" });
  });

  it("names the SOURCE, so the owner knows which site is being talked about", () => {
    // A business with both a Hawlai site and a Shopify store gets two
    // different lists, and "which page?" is ambiguous without this.
    const shop = clarifyChoice({ noun: "page", keyName: "page", source: "this Shopify store", candidates: [{ key: "x", title: "X" }] });
    const site = clarifyChoice({ noun: "page", keyName: "page", source: "your Hawlai website", candidates: [{ key: "x", title: "X" }] });
    expect(shop.note).toContain("this Shopify store");
    expect(site.note).toContain("your Hawlai website");
  });
});

describe("4. nothing matched is a different answer again", () => {
  const empty = clarifyChoice({
    noun: "collection",
    keyName: "collection",
    source: "this Shopify store",
    candidates: [],
  });

  it("does not invent a list it does not have", () => {
    expect(empty.question).toBe("Which collection did you mean?");
    expect(empty.candidates).toEqual([]);
  });

  it("AND STILL REFUSES TO LET THE MODEL DECLARE A THING ABSENT", () => {
    // The model may only report what the tool said. "There's no such
    // collection" is a claim about the store, and the tool is the only
    // thing that read it.
    expect(empty.note).toMatch(/do not\s+tell him a collection does not exist unless this tool said so/i);
    expect(empty.note).toMatch(/do not guess/i);
  });
});
