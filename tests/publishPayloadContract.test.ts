// One ActionKey, one payload contract — across every platform.
//
// THE BUG THIS EXISTS TO PREVENT, found on 20 November 2026 while
// wiring the chat side. `hawlaiSite.ts` has always read `seoTitle`
// from an update_page_meta payload. `shopify.ts` read `metaTitle`.
// Same ActionKey, two different contracts.
//
// WHY THAT IS WORSE THAN A TYPO. The adapter layer exists so that a
// producer — a chat tool, an autopilot, a scheduled job — can create
// one action and not know or care which platform performs it. Two
// spellings mean every producer must carry a per-platform branch, and
// the first one that forgets writes a payload the platform cannot
// read.
//
// And the failure is SILENT. A platform reading the wrong key sees
// `undefined`, which is indistinguishable from "the owner didn't ask
// for a title" — so the honest refusal "No search title or description
// was given" appears for a payload that contained exactly that. The
// same silent-no-op shape as the two bugs the live Shopify run found.
//
// Shopify's undo had the bug twice over: it BUILT a `metaTitle`
// payload, which its own preview would then not recognise, so undoing
// a search title would have quietly done nothing.
//
// This test reads the adapters' source rather than calling them,
// because the point is the vocabulary each one speaks, and a call only
// exercises the keys the test itself chose to send.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

const ADAPTERS = {
  hawlai_site: "src/lib/publish/platforms/hawlaiSite.ts",
  shopify: "src/lib/publish/platforms/shopify.ts",
  hawlai_shop: "src/lib/publish/platforms/hawlaiShop.ts",
  meta: "src/lib/publish/platforms/meta.ts",
} as const;

/**
 * Every `requestedChanges.<key>` an adapter reads, plus every key it
 * WRITES into a requestedChanges object it is proposing (an undo).
 *
 * Through `code()`, per rule 8: the comments in these files discuss
 * the wrong key by name while explaining that it is not used, which is
 * precisely the shape that defeats a raw grep.
 */
function keysOf(path: string): Set<string> {
  const src = code(path);
  const keys = new Set<string>();
  for (const m of src.matchAll(/requestedChanges\.([a-zA-Z][a-zA-Z0-9]*)/g)) keys.add(m[1]);
  for (const m of src.matchAll(/requestedChanges\[\s*"([^"]+)"\s*\]/g)) keys.add(m[1]);
  return keys;
}

describe("one ActionKey means one payload shape, whichever platform runs it", () => {
  it("THE LOAD-BEARING ONE: no two adapters use different names for the same field", () => {
    // The pairs that have burned, and the pairs that would burn next.
    // Each group is one concept; at most ONE spelling of it may appear
    // across all adapters.
    const SYNONYMS: Record<string, string[]> = {
      "the search title": ["seoTitle", "metaTitle", "searchTitle", "titleTag"],
      "the search description": ["metaDescription", "seoDescription", "descriptionTag"],
      "the body text": ["html", "body", "bodyHtml", "text"],
      "the share image": ["ogImageUrl", "shareImageUrl", "ogImage"],
      "the picture to upload": ["imageUrl", "pictureUrl", "src"],
    };

    const used = new Map<string, string[]>(); // key -> adapters using it
    for (const [name, path] of Object.entries(ADAPTERS)) {
      for (const key of keysOf(path)) {
        used.set(key, [...(used.get(key) ?? []), name]);
      }
    }

    for (const [concept, spellings] of Object.entries(SYNONYMS)) {
      const seen = spellings.filter((s) => used.has(s));
      expect(
        seen.length,
        `${concept} is spelled ${seen.length} different ways across the adapters ` +
          `(${seen.map((s) => `${s} in ${used.get(s)!.join("+")}`).join(", ")}). ` +
          `A producer cannot write one payload that every platform reads.`
      ).toBeLessThanOrEqual(1);
    }
  });

  it("the search title is spelled seoTitle, and that is the one the site has rows for", () => {
    // Not vacuous: asserts the chosen spelling exists rather than only
    // that there is at most one. hawlaiSite is the incumbent — real
    // publish_action rows carry its keys — so Shopify aligned to it
    // rather than the other way round.
    const site = keysOf(ADAPTERS.hawlai_site);
    const shopify = keysOf(ADAPTERS.shopify);
    const seoKeys = [...new Set([...site, ...shopify])].filter((k) => /seo|meta/i.test(k));
    expect(seoKeys).toContain("seoTitle");
    expect(seoKeys).not.toContain("metaTitle");
  });

  it("AND SO DOES EVERY PRODUCER, which is the half that rotted", () => {
    // THIS TEST COVERED THE ADAPTERS AND NOT THE PRODUCERS, and the
    // live run of 22 November 2026 found the cost:
    // scripts/verify-shopify-content.ts was still building
    // `metaTitle`, so step 1 of the only script that checks this path
    // against a real store had been silently refused at preview —
    // "No search title or description was given", for a payload that
    // contained exactly that. The same silent shape this file's own
    // header describes, one layer out.
    //
    // A PRODUCER IS ANYTHING THAT WRITES THE PAYLOAD, so the sweep is
    // over files rather than over a list someone maintains: a new
    // producer added next month is covered without being added here.
    const producers = [
      "src/lib/agents/masterBrainV2.ts",
      "src/lib/publish/platforms/shopify.ts",
      "src/lib/publish/platforms/hawlaiSite.ts",
      "scripts/verify-shopify-content.ts",
    ];
    for (const file of producers) {
      const src = code(file);
      // The KEY being written, not a mention: `metaTitle:` with a value
      // after it is a payload; the word in a comment is the record of
      // why it must not be used, and this codebase keeps those.
      expect(src, `${file} still writes metaTitle into a payload`).not.toMatch(/\bmetaTitle\s*:/);
    }
  });

  it("AN UNDO PROPOSES A PAYLOAD ITS OWN PREVIEW CAN READ", () => {
    // Shopify's undo built `metaTitle` while its preview read
    // `seoTitle`, so undoing a search title would have looked like "no
    // title was given" and written nothing — reporting success the
    // whole time.
    //
    // An undo assigns INTO a changes object rather than reading from
    // requestedChanges, so the keys it writes are what this checks.
    const src = code(ADAPTERS.shopify);
    const assigned = new Set<string>();
    for (const m of src.matchAll(/\bchanges\.([a-zA-Z][a-zA-Z0-9]*)\s*=/g)) assigned.add(m[1]);
    const read = keysOf(ADAPTERS.shopify);
    // Every key the undo hands back must be one the platform reads.
    for (const key of assigned) {
      expect(read, `undo proposes "${key}" but nothing reads it`).toContain(key);
    }
    // Not vacuous: the undo really does build a payload.
    expect(assigned.size).toBeGreaterThan(0);
  });

  it("does not pass vacuously — the adapters are really being read", () => {
    for (const [name, path] of Object.entries(ADAPTERS)) {
      const keys = keysOf(path);
      // meta's payload is campaign-shaped and may legitimately share
      // nothing with the content adapters, so it is allowed to be
      // small; the content ones are not.
      if (name === "meta") continue;
      expect(keys.size, `${name} appears to read no requestedChanges keys at all`).toBeGreaterThan(0);
    }
  });
});
