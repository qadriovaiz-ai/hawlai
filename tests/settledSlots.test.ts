// A question the owner has answered is not asked again, and is not
// argued with.
//
// THE INCIDENT, 21 November 2026. Asked to edit a collection without
// naming one, the tool returned "which collection?" with all three of
// the store's real collections attached. The owner answered "Home
// page" — a real collection, Shopify's own default, handle
// `frontpage`. The model then told him "Home page is not a collection,
// it's a regular website page", contradicting a tool result it already
// held.
//
// Nothing had recorded THE OWNER CHOSE frontpage. There was no
// conversational state of any kind, so a decision made two turns ago
// existed only as a sentence to be re-read, and a prior about what a
// name sounds like competed with it on equal terms.
//
// These tests cover the three things that can go wrong with a store
// like this, in the order they would hurt:
//   1. it does not record a choice the owner never made
//   2. it does not keep a choice past the point it still means anything
//   3. it does not act on a choice by itself

import { describe, it, expect } from "vitest";
import {
  freshSlots,
  settledSection,
  settleSlot,
  readSettledSlots,
  isSlotName,
  SLOT_TTL_HOURS,
  type Settled,
} from "@/lib/chat/settledSlots";
import { code } from "./helpers/source";

const NOW = new Date("2026-11-22T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

/** A conversation row whose `settled` is whatever the test puts there. */
function db(stored: unknown, opts: { readError?: string; writeError?: string } = {}) {
  const writes: any[] = [];
  const api = {
    from(table: string) {
      expect(table, "slots live on the conversation row").toBe("chat_conversations");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              opts.readError ? { data: null, error: { message: opts.readError } } : { data: { settled: stored }, error: null },
          }),
        }),
        update: (patch: any) => ({
          eq: async (_col: string, id: string) => {
            writes.push({ patch, id });
            return opts.writeError ? { error: { message: opts.writeError } } : { error: null };
          },
        }),
      };
    },
  };
  return { api, writes };
}

describe("1. IT ONLY HOLDS WHAT THE OWNER ACTUALLY SAID", () => {
  it("THE LOAD-BEARING ONE: an exact match is settled, and comes back", async () => {
    const { api, writes } = db({});
    await settleSlot(api, "conv-1", "collection", "frontpage", "Home page", NOW);
    expect(writes).toHaveLength(1);
    expect(writes[0].patch.settled.collection).toEqual({
      value: "frontpage",
      label: "Home page",
      at: NOW.toISOString(),
    });
  });

  it("an unknown slot name is refused rather than stored", async () => {
    // The column is jsonb: a typo would otherwise sit in a prompt
    // forever looking like a fact.
    const { api, writes } = db({});
    await settleSlot(api, "conv-1", "collectionn", "frontpage", "Home page", NOW);
    await settleSlot(api, "conv-1", "surface", "shopify", "your Shopify store", NOW);
    expect(writes).toHaveLength(0);
  });

  it("a turn with no conversation writes nothing", async () => {
    // WhatsApp has no chat conversation row. It must not throw.
    const { api, writes } = db({});
    await settleSlot(api, null, "collection", "frontpage", "Home page", NOW);
    await settleSlot(api, undefined, "collection", "frontpage", "Home page", NOW);
    expect(writes).toHaveLength(0);
  });

  it("an empty value writes nothing", async () => {
    const { api, writes } = db({});
    await settleSlot(api, "conv-1", "collection", "   ", "Home page", NOW);
    expect(writes).toHaveLength(0);
  });

  it("settling one slot keeps the others", async () => {
    const { api, writes } = db({ page: { value: "about", label: "About us", at: hoursAgo(1) } });
    await settleSlot(api, "conv-1", "collection", "frontpage", "Home page", NOW);
    expect(Object.keys(writes[0].patch.settled).sort()).toEqual(["collection", "page"]);
  });

  it("settling the same slot again replaces it — he changed his mind", async () => {
    const { api, writes } = db({ collection: { value: "frontpage", label: "Home page", at: hoursAgo(1) } });
    await settleSlot(api, "conv-1", "collection", "diwali-gifting", "Diwali gifting", NOW);
    expect(writes[0].patch.settled.collection.value).toBe("diwali-gifting");
    expect(Object.keys(writes[0].patch.settled)).toHaveLength(1);
  });

  it("the label falls back to the value, never to empty", async () => {
    const { api, writes } = db({});
    await settleSlot(api, "conv-1", "blog", "news", "   ", NOW);
    expect(writes[0].patch.settled.blog.label).toBe("news");
  });
});

describe("2. IT DOES NOT KEEP AN ANSWER PAST ITS USEFULNESS", () => {
  it("THE LOAD-BEARING ONE: a slot older than the window is dropped", () => {
    const stored = { collection: { value: "frontpage", label: "Home page", at: hoursAgo(SLOT_TTL_HOURS + 1) } };
    expect(freshSlots(stored, NOW)).toEqual({});
  });

  it("a slot inside the window is kept", () => {
    const stored = { collection: { value: "frontpage", label: "Home page", at: hoursAgo(SLOT_TTL_HOURS - 1) } };
    expect(Object.keys(freshSlots(stored, NOW))).toEqual(["collection"]);
  });

  it("a timestamp from the future is dropped, not treated as fresh", () => {
    // A clock problem would otherwise make a slot immortal: every
    // later `now` is still before it.
    const stored = { collection: { value: "frontpage", label: "Home page", at: new Date(NOW.getTime() + 60_000).toISOString() } };
    expect(freshSlots(stored, NOW)).toEqual({});
  });

  it("ageing out happens on the WRITE path too, not only on read", async () => {
    // Otherwise a stale slot is carried forward in the merge for ever,
    // outliving its own expiry every time another slot is settled.
    const { api, writes } = db({
      page: { value: "about", label: "About us", at: hoursAgo(SLOT_TTL_HOURS + 2) },
    });
    await settleSlot(api, "conv-1", "collection", "frontpage", "Home page", NOW);
    expect(Object.keys(writes[0].patch.settled)).toEqual(["collection"]);
  });
});

describe("3. a malformed row cannot become a sentence in a prompt", () => {
  it("rubbish shapes are dropped one by one, not wholesale", () => {
    const stored = {
      collection: { value: "frontpage", label: "Home page", at: hoursAgo(1) },
      page: { value: "", label: "Nothing", at: hoursAgo(1) },
      blog: { value: "news", label: "News", at: "not a date" },
      product: "just a string",
      nonsense: { value: "x", label: "x", at: hoursAgo(1) },
    };
    expect(Object.keys(freshSlots(stored, NOW))).toEqual(["collection"]);
  });

  it("null, an array and a string all read as no slots", () => {
    for (const raw of [null, undefined, [], "settled", 7]) {
      expect(freshSlots(raw, NOW)).toEqual({});
    }
  });

  it("a read failure reads as no slots and says so out loud", async () => {
    // Silent degradation is how ninety days of cost logging went
    // missing. A section that vanishes looks exactly like a model
    // declining to use it.
    const { api } = db({}, { readError: "permission denied" });
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args.join(" "));
    try {
      expect(await readSettledSlots(api, "conv-1", NOW)).toEqual({});
    } finally {
      console.error = original;
    }
    expect(logged.join(" ")).toMatch(/settledSlots/);
    expect(logged.join(" ")).toMatch(/permission denied/);
  });

  it("A FAILED WRITE NEVER BREAKS THE EDIT THE OWNER ASKED FOR", async () => {
    const { api } = db({}, { writeError: "permission denied" });
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args.join(" "));
    try {
      await expect(settleSlot(api, "conv-1", "collection", "frontpage", "Home page", NOW)).resolves.toBeUndefined();
    } finally {
      console.error = original;
    }
    expect(logged.join(" ")).toMatch(/permission denied/);
  });
});

describe("4. what the section tells the model", () => {
  const settled: Settled = {
    // Seconds old, so the "just now" wording below is the one on test.
    collection: { value: "frontpage", label: "Home page", at: hoursAgo(0.005) },
  };

  it("THE LOAD-BEARING ONE: it forbids contradicting a settled answer", () => {
    // The exact sentence of the failure: "Home page is not a
    // collection, it's a regular website page."
    const section = settledSection(settled, NOW);
    expect(section).toMatch(/do NOT contradict it/i);
    expect(section).toMatch(/not a collection/);
    expect(section).toMatch(/is not evidence/);
  });

  it("it forbids asking again", () => {
    expect(settledSection(settled, NOW)).toMatch(/Do NOT ask again/i);
  });

  it("IT INFORMS, IT DOES NOT ACT — the slot never fills a tool argument", () => {
    // The whole safety position of this feature. A memory that can act
    // on a remembered target is a much larger decision than one that
    // can inform, and this product's resolver has no fuzzy path for
    // exactly that reason.
    const section = settledSection(settled, NOW);
    expect(section).toMatch(/INFORMS YOU, IT DOES NOT ACT FOR YOU/);
    expect(section).toMatch(/pass the target to the tool explicitly/);
    expect(section).toMatch(/say which one you are using/);
  });

  it("it says a new answer replaces the old one", () => {
    expect(settledSection(settled, NOW)).toMatch(/act on his new words/);
  });

  it("it carries both the owner's words and the value a tool needs", () => {
    // "Home page" is what he said; `frontpage` is what Shopify wants.
    // Dropping either one makes the entry useless to one of its two
    // readers.
    const section = settledSection(settled, NOW);
    expect(section).toContain('"Home page"');
    expect(section).toContain("(frontpage)");
  });

  it("it says how long ago, so the model can weigh it", () => {
    expect(settledSection(settled, NOW)).toMatch(/settled just now/);
    expect(
      settledSection({ page: { value: "about", label: "About us", at: hoursAgo(2) } }, NOW)
    ).toMatch(/settled 2 hours ago/);
  });

  it("nothing settled produces no section at all", () => {
    // A heading with nothing under it spends tokens to say nothing.
    expect(settledSection({}, NOW)).toBe("");
  });
});

describe("5. it is wired into the turn, or none of it matters", () => {
  const BRAIN = "src/lib/agents/masterBrainV2.ts";

  it("THE LOAD-BEARING ONE: the section is interpolated into the prompt", () => {
    // A section computed and never interpolated is the shape this
    // codebase keeps finding.
    expect(code(BRAIN)).toMatch(/\$\{recallSection\}\$\{settledSlotsSection\}/);
  });

  it("the conversation id reaches executeTool, or nothing can be written", () => {
    // SLICED TO THE CALL, both ends. Asserting the argument name
    // anywhere in this file would pass on any of its other mentions.
    const src = code(BRAIN);
    const at = src.indexOf("result = await executeTool(");
    expect(at, "the brain no longer calls executeTool here").toBeGreaterThan(-1);
    const call = src.slice(at, src.indexOf(";", at));
    expect(call.length, "the sliced call is empty").toBeGreaterThan(20);
    expect(call, "the conversation id is not passed to executeTool").toContain("conversationId");
  });

  /**
   * The `if` that guards one settle call, sliced at both ends.
   *
   * COUNTING DID NOT WORK, and the mutation run on 2026-11-22 proved
   * it: an assertion that there are "at least four" exactness checks in
   * this file SURVIVED replacing one of them with `if (true)`, because
   * the resolution code above each site compares slug and title to the
   * same variables and made up the difference. Counting a token across
   * a 6,000-line file is not a check. Slice to the block, then anchor.
   */
  function guardAround(callName: string): string {
    const src = code(BRAIN);
    const call = src.indexOf(`await ${callName}(`);
    expect(call, `${callName} is gone — a resolution site stopped recording what the owner chose`).toBeGreaterThan(-1);
    const openIf = src.lastIndexOf("if (", call);
    expect(openIf, `nothing guards ${callName}`).toBeGreaterThan(-1);
    const guard = src.slice(openIf, call);
    expect(guard.length, `the sliced guard for ${callName} is empty`).toBeGreaterThan(10);
    return guard;
  }

  const SHOPIFY_SITES = ["settlePageSlot", "settleMetaPageSlot", "settleCollectionSlot", "settleBlogSlot"];
  const BUILT_IN_SITES = ["settleSitePageSlot", "settleSiteMetaSlot"];

  it("EVERY RESOLVER THAT MATCHED WHAT HE NAMED WRITES A SLOT", () => {
    // Six sites: Shopify page text, page meta, collection and blog,
    // and the built-in site's page text and page meta. A resolver that
    // resolves and records nothing is the bug this item fixes, one
    // tool at a time.
    for (const name of [...SHOPIFY_SITES, ...BUILT_IN_SITES]) {
      expect(guardAround(name).length, name).toBeGreaterThan(10);
    }
  });

  it("AND NONE OF THEM SETTLES A TARGET WE PICKED OURSELVES", () => {
    // "the only collection there is" and "fall back to the first page"
    // are both targets this product chose. Recording one would let a
    // later turn skip a question on a decision the owner never made —
    // the same class of invention as the original failure, pointing the
    // other way.
    for (const name of SHOPIFY_SITES) {
      expect(guardAround(name), `${name} settles a match the owner did not make`).toContain('matchType !== "only_one"');
    }
    // The built-in site has no matchType, so exactness is re-derived
    // there: the chosen page's slug or title must equal what he asked.
    for (const name of BUILT_IN_SITES) {
      expect(guardAround(name), `${name} no longer checks that the page is the one he named`).toMatch(
        /\.toLowerCase\(\) === (?:askedFor|asked)/
      );
    }
  });
});

describe("6. the slot vocabulary", () => {
  it("surface is deliberately NOT a slot", () => {
    // It would have to be inferred from which tool ran, and a slot
    // inferred from our own behaviour is a decision the owner never
    // made. Recorded as a choice so that adding it later is a decision
    // rather than a drift.
    expect(isSlotName("surface")).toBe(false);
    for (const name of ["page", "collection", "blog", "product"]) {
      expect(isSlotName(name), name).toBe(true);
    }
  });
});
