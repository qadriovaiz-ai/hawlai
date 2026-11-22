// A phrase a guard's own comment quotes must be a phrase the guard catches.
//
// THE INCIDENT, 2 October to 21 November 2026. The comment above
// CLAIM_TERMS describes the failure that created the list: a generated
// homepage said "No paraffin. No synthetic shortcuts." for a business
// whose records said nothing of the kind. "no paraffin" was added to
// the list. "no synthetic shortcuts" never was.
//
// So for seven weeks the phrase that caused the rule sat in a comment
// DESCRIBING the rule, fully publishable, until it published itself
// into a blog post bound for a live storefront. The guard looked
// complete to anyone who read its own explanation of itself.
//
// This is the fourth class the Perceive/Observe/Memory audit found, and
// the worst of them: load-bearing knowledge written in prose instead of
// in code. The three memory classes lose information the agent could
// have had. This one makes a missing guard LOOK present.
//
// WHY THIS TEST RUNS THE GUARD INSTEAD OF GREPPING IT. A source-grep
// here would be defeated by the very thing it is checking — the phrase
// it looks for is in the comment, so the comment passes the test for
// the code. CLAUDE.md rule 8 records that exact trap. This test calls
// findUnsupportedClaims and findUnverifiableClaims for real, with a
// business whose records support nothing, and asks whether the phrase
// comes back flagged. Nothing about the source text can satisfy it.
//
// WHY THE QUOTES ARE READ ACROSS LINE ENDINGS. The original quote is
// wrapped: `"No` ends one comment line and `paraffin. No synthetic
// shortcuts."` begins the next. A reader that looks for a quote WITHIN
// a line sees no complete quote at all and passes.
//
// The region's comment lines are collected into one string and the
// quotes are matched over the whole of it. What does the work is that
// the match may cross a line ending.
//
// TWO MECHANISMS, AND THEY ARE ENTANGLED — found by mutating them on
// 2026-11-22. Joining the lines with a space and allowing the match to
// cross newlines are the same property reached twice: `[^"]` already
// matches a newline, and `.join(" ")` already leaves no newline to
// match. So neither edit alone changes the result, and mutating either
// one on its own SURVIVES. Only doing both — join on "\n" and forbid
// newlines in the span — reproduces the October reader, and that
// mutation kills four of these tests.
//
// An earlier version of this comment said the join was "the only
// reason the case is visible". That was wrong, and it is corrected
// here rather than quietly: a note claiming a mechanism nobody has
// mutated is the same class of defect as the one this file tests for.
//
// WHY EACH QUOTE IS SPLIT INTO SENTENCES. `"No paraffin. No synthetic
// shortcuts."` is ONE quoted span holding TWO claims. Checked whole it
// is flagged — because of the half that was on the list — and the
// missing half stays invisible. The span is split and each sentence
// must stand on its own. This is the assertion that would have failed
// in October.

import { describe, it, expect } from "vitest";
import { sourceWithComments } from "./helpers/source";
import { findUnsupportedClaims, findUnverifiableClaims } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const FILE = "src/lib/claims/claimCheck.ts";

/**
 * A business whose records support nothing at all.
 *
 * Deliberately generic — no category, no products, no owner facts. Every
 * one of these terms is allowed the moment a business says it somewhere
 * of its own, so a fixture with any real material in it would license
 * the phrases this test is trying to catch.
 */
function nothingOnRecord(): BusinessFacts {
  return {
    businessName: "Test Business",
    category: "business",
    categoryKnown: false,
    city: null,
    products: [],
    offers: [],
    pillars: [],
    site: null,
    home: null,
    links: { store: null, booking: null, products: [] },
    brand: { description: null, pillars: [] } as unknown as BusinessFacts["brand"],
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 0, leads: 0 },
    ownerFacts: [],
    businessModels: { models: ["products"], inferred: false },
    shipping: null,
  } as unknown as BusinessFacts;
}

/**
 * The comment text of ONE region, bounded at both ends, joined to a
 * single line.
 *
 * Bounded at both ends on purpose: a start-only slice is not a slice,
 * and reads the whole rest of the file. That mistake has cost this
 * codebase six missed mutations.
 */
function commentProse(startAnchor: string, endAnchor: string): string {
  const src = sourceWithComments(FILE);
  const start = src.indexOf(startAnchor);
  expect(start, `the start anchor is gone: ${startAnchor}`).toBeGreaterThan(-1);
  const end = src.indexOf(endAnchor, start + startAnchor.length);
  expect(end, `the end anchor is gone: ${endAnchor}`).toBeGreaterThan(start);
  return src
    .slice(start, end)
    .split("\n")
    .filter((l) => l.trim().startsWith("//"))
    .map((l) => l.trim().replace(/^\/\/\s?/, ""))
    .join(" ");
}

/** Every sentence inside every quotation mark pair in that prose. */
function quotedSentences(prose: string): string[] {
  const out = new Set<string>();
  for (const m of prose.matchAll(/"([^"]{2,160})"/g)) {
    const span = m[1];
    // A span that begins or ends in whitespace is a mis-paired quote —
    // prose caught between the closing quote of one phrase and the
    // opening quote of the next, not a phrase anybody wrote.
    if (span !== span.trim()) continue;
    if (!/[a-z]/i.test(span)) continue;
    for (const piece of span.split(/[.!?;]+/)) {
      const s = piece.trim().replace(/\s+/g, " ");
      // One word is a word, not a claim: "none", "100%", "fixes".
      if (s.split(" ").filter(Boolean).length >= 2) out.add(s);
    }
  }
  return [...out];
}

/** Every reason either claim guard gives for this phrase. */
function whyFlagged(phrase: string): string[] {
  const text = `Our products. ${phrase}.`;
  const unsupported = findUnsupportedClaims(text, nothingOnRecord());
  const unverifiable = findUnverifiableClaims(text);
  return [...unsupported, ...unverifiable.removed, ...unverifiable.unverifiable];
}

// WHY EACH REGION NAMES ITS OWN RULE, and this is the part that took a
// second attempt. The first version of this test asked only whether
// SOME guard flagged the phrase. Deleting "no synthetic shortcuts" from
// CLAIM_TERMS did not fail it: that phrase is ALSO caught by
// RIVAL_DISPARAGEMENT, because saying other products have a fault is a
// claim about them. The phrase stayed unpublishable, so the mutation
// survived for a real reason — but the test was no longer pinning the
// list its comment is attached to, which was the whole point.
//
// So a region declares the signature of its own guard's reason, and the
// phrase must be caught BY THAT RULE. Double coverage elsewhere is
// welcome and is not evidence.

/**
 * Not every quoted phrase in a guard's comment is draft copy.
 *
 * Two kinds are not, and both need saying out loud rather than being
 * filtered away quietly:
 *
 *   not_copy      — the comment is quoting its own reasoning, or a
 *                   phrase from this product's vocabulary. Nobody would
 *                   ever publish it to a customer.
 *   must_not_flag — the comment names it as a phrase that must NOT be
 *                   flagged, usually as the reason a rule is written
 *                   narrowly. These are asserted in the OPPOSITE
 *                   direction below, because over-filtering is a real
 *                   cost and this is the only place it is pinned.
 *
 * Every entry carries a reason and a date. Nothing is a free pass: an
 * entry that stops matching a real quoted phrase fails the suite, so
 * this list cannot quietly outlive the comment it describes.
 */
type Declared =
  | { verdict: "not_copy"; why: string; at: string }
  | { verdict: "must_not_flag"; why: string; at: string };

const DECLARED: Record<string, Declared> = {
  "don't claim this": {
    verdict: "not_copy",
    why: "the comment's own words for what the check is NOT — the sentence reads: the check is not \"don't claim this\", it is \"say it yourself first\"",
    at: "2026-11-22",
  },
  "say it yourself first": {
    verdict: "not_copy",
    why: "the other half of that same sentence — a description of the rule, not copy a business would publish",
    at: "2026-11-22",
  },
  "One phrasing of a claim on a term list is a list that catches the drafts that happen to agree with it": {
    verdict: "not_copy",
    why: "a sentence of the comment's reasoning about term lists, quoted for emphasis",
    at: "2026-11-22",
  },
  "more than paraffin": {
    verdict: "must_not_flag",
    why: "the comment cites it to explain that a comparative is not an absolute — it says this phrase is not the same as claiming \"none\", and flagging it would be the over-filtering the comment is arguing against",
    at: "2026-11-22",
  },
  "our honest approach in India": {
    verdict: "must_not_flag",
    why: "the reason the -est forms are enumerated rather than matched as \\w+est — that pattern also matches \"honest\", and this is the sentence it would have wrongly flagged",
    at: "2026-11-22",
  },
};

/**
 * The comment blocks whose quoted phrases are checked.
 *
 * Both are term lists over customer-facing copy, which is why running
 * the real guard against them means something. `floor` is the number of
 * quoted sentences the region must still yield: without it, an anchor
 * that silently matched a shorter block would make this suite pass by
 * checking nothing.
 *
 * NOT INCLUDED, and deliberately: the comparative and benefit blocks
 * further down this file. Their comments quote pattern SHAPES rather
 * than phrases — "than X", "compared to", "separates X from Y" — which
 * no guard can flag and which would turn this list into an allowlist
 * with a test attached. A sweep of the whole file's comments on
 * 2026-11-22 found 112 quoted sentences, 46 of them unflagged and
 * almost all of that kind.
 */
const REGIONS = [
  {
    name: "CLAIM_TERMS — product attributes",
    from: "// Product-attribute claims",
    to: "\n];",
    floor: 12,
    /** The term-list rule's own wording, and the offer to put it on record. */
    rule: /nothing on record backs it/,
  },
  {
    name: "SUPERLATIVE_WORDS — the -est forms",
    from: '// The "-est" forms',
    to: "const POSSESSIVE_SUPERLATIVE",
    floor: 2,
    rule: /a superlative with nothing on record/,
  },
];

describe("1. A PHRASE A GUARD'S COMMENT QUOTES IS A PHRASE THE GUARD CATCHES", () => {
  for (const region of REGIONS) {
    it(`THE LOAD-BEARING ONE: ${region.name}`, () => {
      const sentences = quotedSentences(commentProse(region.from, region.to));
      expect(sentences.length, `${region.name}: the region yields fewer quoted sentences than it did — the anchors are matching the wrong block`).toBeGreaterThanOrEqual(region.floor);

      for (const sentence of sentences) {
        const declared = DECLARED[sentence];
        if (declared) continue; // asserted in their own direction below.
        const byThisRule = whyFlagged(sentence).filter((reason) => region.rule.test(reason));
        expect(
          byThisRule,
          `this comment quotes "${sentence}" as copy, and the guard it is written above does not catch it. Either add it to that list, or declare it in DECLARED with a reason and a date.`
        ).not.toHaveLength(0);
      }
    });
  }
});

describe("2. the motivating case, named", () => {
  it("THE PHRASE THAT WAS ONLY EVER IN THE COMMENT IS ON THE LIST", () => {
    // Seven weeks publishable. This is the whole reason the file exists.
    // Checked against the TERM rule, not against any rule: see the note
    // above REGIONS. RIVAL_DISPARAGEMENT also catches this phrase, and
    // if that were allowed to answer here the term could be deleted
    // again without anything noticing.
    const byTermList = whyFlagged("No synthetic shortcuts").filter((r) => /nothing on record backs it/.test(r));
    expect(byTermList).not.toHaveLength(0);
  });

  it("BOTH HALVES of the wrapped quote are read as separate sentences", () => {
    // The anti-vacuity assertion, and it pins both mechanisms at once.
    // Joining the comment lines is what makes the quote visible at all;
    // splitting the span is what makes the missing half visible. Drop
    // either and this test fails while the suite still looks green.
    const sentences = quotedSentences(commentProse("// Product-attribute claims", "\n];"));
    expect(sentences, "the comment lines are no longer joined, so the wrapped quote is invisible").toContain("No paraffin");
    expect(sentences, "the quoted span is no longer split, so a claim hidden beside a listed one is invisible").toContain("No synthetic shortcuts");
  });
});

describe("3. the declarations are honest", () => {
  it("a phrase declared must_not_flag really is not flagged", () => {
    // The over-filtering direction. A rule written narrowly to spare a
    // phrase has nothing pinning that narrowness anywhere else.
    for (const [phrase, d] of Object.entries(DECLARED)) {
      if (d.verdict !== "must_not_flag") continue;
      expect(
        whyFlagged(phrase),
        `${phrase} is declared as a phrase the guard must leave alone (${d.why}), but a guard now flags it`
      ).toHaveLength(0);
    }
  });

  it("NO STALE DECLARATIONS: every entry still matches a real quoted phrase", () => {
    // Without this the list outlives the comments and becomes a set of
    // permanent exemptions nobody can account for.
    const all = new Set(REGIONS.flatMap((r) => quotedSentences(commentProse(r.from, r.to))));
    for (const phrase of Object.keys(DECLARED)) {
      expect(all.has(phrase), `DECLARED holds "${phrase}", which no comment in a checked region quotes any more — delete the entry`).toBe(true);
    }
  });

  it("every entry carries a reason and a date", () => {
    for (const [phrase, d] of Object.entries(DECLARED)) {
      expect(d.why.length, `${phrase} has no reason`).toBeGreaterThan(20);
      expect(d.at, `${phrase} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
