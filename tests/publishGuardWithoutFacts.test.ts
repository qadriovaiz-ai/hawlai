// F-01 at the four publish surfaces that still got it wrong.
//
// THE RULE, in generateCopy.ts's own words above its guardOrMark call:
//
//   // F-01: guardOrMark, never `facts ? guard() : skip`. A failed
//   // records read is a state, not a way through.
//
// On 22 November 2026 masterBrainV2 had four call sites doing exactly
// what that forbids, all four on publish or send paths:
//
//   propose_page_meta               `if (value === undefined || !metaFacts) return value`
//   edit_collection_text            `if (collFacts) { … }`
//   publish_blog_post               `if (postFacts) { … }`
//   send_email                      `if (facts) { … }`
//
// Each silently passed when gatherBusinessFactsSafely returned null:
// no strip, no warning, no `_factsState` mark. A transient read failure
// turned the whole claims layer off for the surfaces most strangers see.
//
// THREE MARK AND CARRY ON, ONE REFUSES, and the split is pinned below
// because it is a judgement rather than an oversight. A page, a
// collection and a blog post can be edited after the fact, and the
// fact-independent subset still strips what is wrong whatever the
// records say. An email cannot be taken back, and both of its checks
// need the business's own records to mean anything at all.

import { describe, it, expect } from "vitest";
import { guardOrMark, publishCheckWording, unverifiedNote } from "@/lib/claims/factsGate";
import { code } from "./helpers/source";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

/**
 * One tool's case body, bounded at BOTH ends.
 *
 * A start-only slice runs to the end of the file and would find the
 * next tool's guard — rule 8, and the miss that cost a session on
 * 21 November.
 */
function tool(name: string): string {
  // code() STRIPS COMMENTS, so a comment heading is not available as an
  // end anchor — the first version of this helper used "---- WHICH
  // SURFACE" and found -1 for three of the four tools. The next `case "`
  // is a code anchor and cannot be deleted by a tidy-up of the prose.
  const src = code(BRAIN);
  const start = src.indexOf(`case "${name}": {`);
  expect(start, `the ${name} case is gone`).toBeGreaterThan(-1);
  const end = src.indexOf('case "', start + `case "${name}": {`.length);
  expect(end, `no case follows ${name}, so this slice has no end`).toBeGreaterThan(start);
  const block = src.slice(start, end);
  expect(block.length, `the sliced ${name} block is empty`).toBeGreaterThan(200);
  return block;
}

const GUARDED = [
  { name: "propose_page_meta", facts: "metaFacts" },
  { name: "edit_collection_text", facts: "collFacts" },
  { name: "publish_blog_post", facts: "postFacts" },
];

describe("1. NO PUBLISH SURFACE SKIPS THE GUARD WHEN THE RECORDS CANNOT BE READ", () => {
  for (const { name, facts } of GUARDED) {
    it(`${name} runs guardOrMark, not a falsy check on the facts`, () => {
      const block = tool(name);
      // POSITIVE, and the adjacency is the point: `guardOrMark(` with
      // the facts coalesced to null is a call that happens either way.
      // `not.toMatch(/if \(facts\)/)` would forbid one spelling of the
      // thing being prevented and nothing else.
      expect(block, `${name} no longer calls guardOrMark`).toMatch(/guard\w*\(\s*\{[^}]*\},\s*\w+ \?\? null,\s*"publish"\)/);
      // ANCHORED ON THE CONDITION ITSELF, not on a mention of
      // `verdict.state` somewhere in the block. The first version of
      // this line was an alternation matching either spelling anywhere,
      // and a mutation replacing the branch with
      // `if (false && verdict.state === …)` SURVIVED it: every word was
      // still in the file. A source test cannot see a disabled branch
      // unless the condition is what it anchors on.
      expect(block, `${name} does not branch on which state it is in`).toMatch(/if \(verdict\.state === "FACTS_UNAVAILABLE"/);
      expect(block, `${name} does not surface the 'nothing was checked' note`).toMatch(/_claimsNote \?\? ""\)\.trim\(\)/);
      // The old shape, in the one place a slice can see it honestly.
      expect(block, `${name} still gates the whole check on ${facts}`).not.toMatch(
        new RegExp(`if \\(${facts}\\) \\{`)
      );
    });
  }

  it("send_email REFUSES instead, because a sent email cannot be edited", () => {
    const block = tool("send_email");
    expect(block, "send_email no longer refuses on an unreadable read").toMatch(/if \(!facts\) \{/);
    expect(block).toMatch(/Not sent: Hawlai couldn't read/);
    // AND THE CHECKS STILL RUN when the records are there — a refusal
    // that also removed the checks would pass the assertion above.
    expect(block).toMatch(/vagueFestiveWording\(/);
    expect(block).toMatch(/findUnsupportedLinks\(/);
  });

  it("and it does not tell the owner anything is wrong with the email", () => {
    // The failure mode this exists for: "Not sent, there's a problem
    // with your links" when nothing looked at the links at all.
    const block = tool("send_email");
    const refusal = block.slice(block.indexOf("if (!facts) {"), block.indexOf("vagueFestiveWording"));
    expect(refusal.length).toBeGreaterThan(50);
    expect(refusal).toMatch(/could not be checked|not checked/);
    expect(refusal).not.toMatch(/Rewrite it/);
  });
});

describe("2. THE WORDING TELLS THE TRUTH ABOUT WHICH STATE IT IS IN", () => {
  const removed = ['"no shortcuts" — nothing on record backs it'];

  it("THE LOAD-BEARING ONE: an unread record is never reported as a missing fact", () => {
    // "your Business Story doesn't support it" is a claim ABOUT THE
    // RECORDS. With the records unread it is false, and it tells the
    // owner their own business is missing something when a read failed.
    const unread = publishCheckWording("FACTS_UNAVAILABLE", "/path");
    expect(unread.removed(removed)).not.toMatch(/Business Story/);
    expect(unread.removed(removed)).toMatch(/couldn't read your store records/);
    expect(unread.keptByOwner(removed)).not.toMatch(/Business Story/);
    expect(unread.nothingLeft("post").error).not.toMatch(/can't back up/);
  });

  it("and with the records read, the wording is the one the owner already knows", () => {
    // Not vacuous: the old sentence is still what a real unsupported
    // claim gets, so this is a split and not a rewrite.
    const read = publishCheckWording("FACTS_AVAILABLE", "/path");
    expect(read.removed(removed)).toMatch(/your Business Story doesn't support it/);
    expect(read.keptByOwner(removed)).toMatch(/your Business Story doesn't back up/);
    expect(read.nothingLeft("post").error).toMatch(/can't back up/);
  });

  it("the unread 'nothing left' message does not tell them to rewrite it", () => {
    // It would be wrong advice: nothing is known to be wrong with the
    // wording, and a retry in a moment would check it properly.
    const unread = publishCheckWording("FACTS_UNAVAILABLE", "/path");
    expect(unread.nothingLeft("post").note).not.toMatch(/Do not simply resend/);
    expect(unread.nothingLeft("post").note).toMatch(/try again/i);
    expect(read_note()).toMatch(/Do not simply resend/);
    function read_note() {
      return publishCheckWording("FACTS_AVAILABLE", "/path").nothingLeft("post").note;
    }
  });

  it("the surface label is an argument, not a string patched in by the caller", () => {
    // propose_page_meta used to .replace("Taken out,", …) on this
    // sentence, which breaks silently the day it is reworded.
    const read = publishCheckWording("FACTS_AVAILABLE", "/path");
    expect(read.removed(removed, "search title")).toMatch(/Taken out of the search title,/);
    expect(read.removed(removed)).toMatch(/^Taken out, /);
  });
});

describe("3. THE NOTE FIRES EVEN WHEN NOTHING WAS REMOVED", () => {
  it("THE LOAD-BEARING ONE: clean copy from a check that never ran is not clean copy", () => {
    // An honest sentence, nothing to strip, no records. The owner must
    // still be told, or "came back clean" and "was never checked" look
    // identical on the card.
    const verdict = guardOrMark({ value: "Our new winter range is here." }, null, "publish");
    expect(verdict.removed).toEqual([]);
    expect(verdict.state).toBe("FACTS_UNAVAILABLE");
    expect(String((verdict.output as any)._claimsNote ?? "")).toMatch(/couldn't read your store records/);
  });

  it("and with records present there is no such note on clean copy", () => {
    expect(unverifiedNote([], [])).toMatch(/nothing in it has been checked/);
  });

  it("the fact-independent rules still strip what is wrong with no records at all", () => {
    // The subset is not nothing — this is what makes "mark and carry on"
    // defensible for the three editable surfaces.
    const verdict = guardOrMark({ value: "Rated the best in India by our 5,000 customers." }, null, "publish");
    expect(verdict.removed.length).toBeGreaterThan(0);
    expect(String((verdict.output as any).value ?? "")).not.toMatch(/5,000 customers/);
  });
});

describe("4. rule 3 — the new wording names no business, product or trade", () => {
  it("both states' sentences are category-neutral", () => {
    const forbidden = /candle|qaaf|kurta|dealership|salon|bakery|paraffin|soy/i;
    for (const state of ["FACTS_AVAILABLE", "FACTS_UNAVAILABLE"] as const) {
      const say = publishCheckWording(state, "/path");
      const all = [say.removed(["x"]), say.removed(["x"], "search title"), say.keptByOwner(["x"]), say.nothingLeft("post").error, say.nothingLeft("post").note].join(" ");
      expect(all).not.toMatch(forbidden);
    }
  });
});
