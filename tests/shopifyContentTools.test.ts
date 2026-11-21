// The three chat tools that reach Shopify's content actions — 21
// November 2026, approved under rule 5 with the reason in DECISIONS.md.
//
// Tested as a CONTRACT rather than by mocking Master Chat's whole
// loop, which is the pattern priceChangeTool.test.ts set and for the
// same reason: the loop is not what can quietly go wrong. What can is
// a tool registered in two of three places, a producer that writes
// without an approval, a resolver that picks instead of asking, or
// customer-facing copy that skips the claims layer.
//
// SLICED TO THE CASE BLOCK, THEN ANCHORED. A grep across a
// 4,000-line file finds the word in somebody else's handler and
// passes. Each assertion below reads only its own `case` body.

import { describe, it, expect } from "vitest";
import { BUSINESS_BRAIN_TOOLS, TOOL_FAMILIES } from "@/lib/businessBrain/toolRegistry";
import { TOOLS } from "@/lib/businessBrain/toolSchemas";
import { code, sourceWithComments } from "./helpers/source";

const BRAIN = "src/lib/agents/masterBrainV2.ts";
const NEW_TOOLS = ["edit_collection_text", "publish_blog_post", "upload_store_image"] as const;

/** One tool's `case` body, and nothing of its neighbours'. */
function caseBody(name: string): string {
  const src = code(BRAIN);
  const start = src.indexOf(`case "${name}": {`);
  expect(start, `${name} has no case in ${BRAIN}`).toBeGreaterThan(-1);
  const rest = src.slice(start);
  const end = rest.indexOf('\n    case "', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("1. registered in every place, or not at all", () => {
  it.each(NEW_TOOLS)("%s is a schema, a family and a catalogue entry", (name) => {
    // A tool the model can call but nobody classified, or classified
    // but uncallable, is the split toolSchemas.test.ts exists about.
    expect((TOOLS as any[]).map((t) => t.name)).toContain(name);
    expect(TOOL_FAMILIES[name]).toBe("ResourceEdit");
    expect(BUSINESS_BRAIN_TOOLS.find((t) => t.name === name)).toBeDefined();
  });

  it.each(NEW_TOOLS)("%s is CHAT ONLY, and reaches an action rather than a sender", (name) => {
    // The reason propose_price_change records: a voice call cannot
    // show a candidate list, and "which collection did you mean?"
    // against six similar names over the phone is how the wrong one
    // gets rewritten. A channel that cannot show the options cannot
    // honour "never guess".
    const entry = BUSINESS_BRAIN_TOOLS.find((t) => t.name === name)!;
    expect(entry.channels).toEqual(["chat"]);
    expect(entry.handlerRef).toBe("lib/publish/create.ts:createPublishAction");
    expect(entry.status).toBe("live");
  });

  it("the three went in together, appended, for the prompt cache", () => {
    // Each fingerprint change invalidates the cached prefix and every
    // chat turn pays full price until it warms. Three commits would
    // have paid that three times for one approved change.
    const names = (TOOLS as any[]).map((t) => t.name);
    expect(names.slice(-3)).toEqual([...NEW_TOOLS]);
  });
});

describe("2. NOTHING WRITES WITHOUT AN APPROVAL", () => {
  it.each(NEW_TOOLS)("%s goes through createPublishAction and nowhere else", (name) => {
    const body = caseBody(name);
    expect(body).toMatch(/createPublishAction/);
    // Never a platform's execute() straight from a tool: the whole
    // point is that a human sees the card first.
    expect(body).not.toMatch(/\.execute\(/);
    // And never a raw mutation — writing to Shopify outside the
    // adapter is what publishContract.test.ts refuses.
    expect(body).not.toMatch(/shopifyMutation|graphql\.json/);
  });

  it.each(NEW_TOOLS)("%s refuses plainly when Shopify is not connected", (name) => {
    // Every other failure below is a worse way to learn the store is
    // not attached.
    const body = caseBody(name);
    expect(body).toMatch(/shopifyCredentialsAdapter|imgCreds|blogCreds/);
    expect(body).toMatch(/no Shopify store connected|no blog to post to/i);
  });

  it.each(["edit_collection_text", "publish_blog_post"] as const)(
    "%s says NOTHING WAS SAVED when the insert fails",
    (name) => {
      // The 2026-09-29 lesson: chat told an owner his wording was
      // "safe with me" after the insert had failed. There was nowhere
      // it could have been kept.
      const body = caseBody(name);
      expect(body).toMatch(/Nothing was saved anywhere/);
      expect(body).toMatch(/saved: false/);
    }
  );
});

describe("3. CUSTOMER-FACING COPY GOES THROUGH THE CLAIMS LAYER", () => {
  it.each(["edit_collection_text", "publish_blog_post"] as const)("%s guards what Hawlai wrote", (name) => {
    // Nothing customer-facing bypasses src/lib/claims. A collection
    // description and a blog post are both prose a stranger reads.
    const body = caseBody(name);
    expect(body).toMatch(/guardGenerated/);
    expect(body).toMatch(/claims\/claimCheck/);
    expect(body).toMatch(/claimCheck: claimCheckField/);
  });

  it.each(["edit_collection_text", "publish_blog_post"] as const)(
    "%s keeps the OWNER'S OWN wording exactly, and warns instead",
    (name) => {
      // Decision C: the guard governs what HAWLAI writes. Wording the
      // owner typed is his to stand behind — and S7 must not demote
      // anything for it, which is why the two counts are separate.
      const body = caseBody(name);
      expect(body).toMatch(/writtenByOwner === true/);
      expect(body).toMatch(/you're the one standing behind that claim/);
      expect(body).toMatch(/ownerWords:/);
      expect(body).toMatch(/keptUnsupported:/);
    }
  );

  it.each(["edit_collection_text", "publish_blog_post"] as const)(
    "%s refuses rather than posting an empty husk",
    (name) => {
      // When the guard removes everything, there is nothing left to
      // publish — and resending the same wording is not the fix.
      const body = caseBody(name);
      expect(body).toMatch(/nothing left to/);
      expect(body).toMatch(/Do not simply resend the same wording/);
    }
  );

  it("upload_store_image does NOT claim-check, and says why", () => {
    // An absence that has to be deliberate and documented, not
    // discovered. The claims layer reads text; nothing in this product
    // reads what is drawn inside an image, so a graphic saying "50%
    // off" carries a claim the guard cannot see. That gap predates
    // this tool and is not closed by it.
    const body = caseBody("upload_store_image");
    expect(body).not.toMatch(/guardGenerated/);
    // The reason is in the file, so the next reader does not take the
    // absence for an oversight. Read WITH comments deliberately — rule
    // 8's named exception, for when the comment IS the assertion.
    const withComments = sourceWithComments(BRAIN);
    const start = withComments.indexOf('case "upload_store_image": {');
    const block = withComments.slice(start, start + 2500);
    expect(block).toMatch(/NO CLAIMS CHECK ON A PICTURE/);
  });
});

describe("4. IT ASKS, IT NEVER PICKS", () => {
  it.each(["edit_collection_text", "publish_blog_post"] as const)(
    "%s hands back the candidates rather than choosing",
    (name) => {
      // The failure recorded on the Hawlai side: "the predecessor fell
      // through to the hero and reported success". On a live
      // storefront the owner approves a card naming the thing they
      // asked for and the write lands elsewhere.
      const body = caseBody(name);
      // THROUGH clarifyChoice NOW, which is a strengthening rather
      // than a loosening. The inline version returned the question and
      // put the names in a `candidates` field beside it — and on
      // 21 November the chat relayed the question WITHOUT the list,
      // asked the owner to recall a name it had just been handed, and
      // then told him his real collection "is not a collection".
      // clarifyChoice puts the names inside the question and attaches
      // a note saying the list is not open to argument.
      expect(body).toMatch(/clarifyChoice|clarify[A-Z]\w*\(/);
      // THE CANDIDATES MUST STILL COME FROM THE RESOLVER. An earlier
      // version of this asserted `toMatch(/candidates:/)` and a
      // mutation setting `candidates: []` SURVIVED it — the word was
      // still there.
      expect(body).toMatch(/candidates: \w+\.candidates\.map/);
      expect(body).not.toMatch(/candidates: \[\]/);
      // Never an index into the list.
      expect(body).not.toMatch(/candidates\[0\]|\.candidates\.find/);
    }
  );

  it("one candidate asks a DIFFERENT question from several", () => {
    // "Did you mean X?" is answerable with a yes. "Which of these?"
    // needs a choice. Asking the wrong one of those stalls the
    // conversation.
    const body = caseBody("edit_collection_text");
    expect(body).toMatch(/needs_confirmation/);
  });

  it("upload_store_image resolves nothing, and that is correct", () => {
    // There is nothing to resolve: the picture is named by URL and the
    // file library is the store's only one.
    const body = caseBody("upload_store_image");
    expect(body).not.toMatch(/resolveShopifyResource/);
    expect(body).not.toMatch(/needs_clarification/);
  });
});

describe("5. the promises each card makes", () => {
  it("a blog post is a DRAFT, and the note says so", () => {
    // The adapter creates it unpublished. The tool must not let the
    // owner think approving puts it in front of a customer.
    const body = caseBody("publish_blog_post");
    expect(body).toMatch(/DRAFT in Shopify/);
    expect(body).toMatch(/nothing goes live/i);
    // And it must not set isPublished itself — that is the adapter's,
    // and two places deciding it is how one of them gets it wrong.
    expect(body).not.toMatch(/isPublished/);
  });

  it("an upload puts nothing on a page, and the note says so", () => {
    const body = caseBody("upload_store_image");
    expect(body).toMatch(/no customer sees it until something puts it on a page/);
  });

  it("a collection edit REPLACES the description, and the note says so", () => {
    // There is no partial edit on a Shopify collection. An owner who
    // thinks one sentence changed would be wrong.
    const body = caseBody("edit_collection_text");
    expect(body).toMatch(/replaces the whole description/i);
  });

  it("NO TOOL SENDS THE OWNER SOMEWHERE ELSE TO APPROVE", () => {
    // The rule toolFamilies.test.ts owns, asserted on these three
    // because a Shopify tool is the obvious place to say "go paste it
    // into Shopify admin".
    for (const name of NEW_TOOLS) {
      const body = caseBody(name);
      expect(body, name).not.toMatch(/go to Shopify admin|paste it in|open Shopify and/i);
    }
  });
});

describe("6. rule 3 — no trade's words shipped to every business", () => {
  it("the three descriptions name no category, product or business", () => {
    // multiTenantVocabulary.test.ts caught exactly this in the first
    // draft of edit_collection_text: "change the text on my candles
    // collection", shown to every business on the platform. The
    // examples are structural now — the SHAPE of what an owner says
    // rather than one trade's nouns.
    const forbidden = /candle|kurta|dealership|salon|bakery|restaurant|clinic|boutique/i;
    for (const name of NEW_TOOLS) {
      const schema = (TOOLS as any[]).find((t) => t.name === name)!;
      expect(JSON.stringify(schema), name).not.toMatch(forbidden);
      const entry = BUSINESS_BRAIN_TOOLS.find((t) => t.name === name)!;
      expect(JSON.stringify(entry), name).not.toMatch(forbidden);
    }
  });
});

describe("7. A COLLECTION'S NAME SAYS NOTHING ABOUT WHAT IT IS", () => {
  // THE LIVE FAILURE, 21 November 2026. The owner asked for a
  // collection description, the tool returned his three real
  // collections, he answered "Home page" — and the chat told him
  // "Home page is not a collection, it's a regular website page."
  //
  // It is a collection. It is Shopify's own default on every store,
  // handle `frontpage`, and it was sitting in his admin with a product
  // in it. The model decided from the NAME, against a tool result it
  // already had.
  //
  // The fingerprint test fails on any schema edit, so it caught the
  // removal of this guidance — but only incidentally. Update the
  // fingerprint deliberately and the warning could go with it. This
  // asserts the guidance itself.
  const schemaFor = (name: string) => (TOOLS as any[]).find((t) => t.name === name)!;

  it("THE LOAD-BEARING ONE: edit_collection_text says a collection may be named like a page", () => {
    const text = JSON.stringify(schemaFor("edit_collection_text"));
    expect(text).toMatch(/CAN BE CALLED ANYTHING/i);
    // The specific name that went wrong, so the model has the example.
    expect(text).toContain("Home page");
    expect(text).toContain("frontpage");
  });

  it("and it forbids declaring something is not a collection", () => {
    // The model cannot know that. The tool reads the store.
    const text = JSON.stringify(schemaFor("edit_collection_text"));
    expect(text).toMatch(/never tell the owner/i);
    expect(text).toMatch(/not a collection/i);
  });

  it("THE PAGE TOOLS POINT AT IT, so the wrong tool is not chosen in the first place", () => {
    // The other half: a request about a GROUP of products is a
    // collection, whatever it is called.
    for (const name of ["read_page", "edit_page_text"]) {
      const text = JSON.stringify(schemaFor(name));
      expect(text, name).toMatch(/edit_collection_text/);
      expect(text, name).toMatch(/group of products/i);
      expect(text, name).toContain("Home page");
    }
  });

  it("rule 3 still holds — the example is Shopify's own default, not a trade's word", () => {
    // "Home page" is a Shopify platform default on every store, which
    // is why naming it is not naming one business's vocabulary.
    // multiTenantVocabulary runs over these files too; this states the
    // reasoning so the next reader does not take it for a slip.
    const forbidden = /candle|kurta|dealership|salon|bakery|restaurant|clinic|boutique/i;
    for (const name of ["edit_collection_text", "read_page", "edit_page_text"]) {
      expect(JSON.stringify(schemaFor(name)), name).not.toMatch(forbidden);
    }
  });
});
