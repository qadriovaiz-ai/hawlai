// The chat's OWN sentences, checked like any other copy.
//
// F-02 (audit, 8 Oct 2026). Every guard in masterBrainV2 sits on what a
// TOOL returns. The reply prose went through `checkedReply`, which fixed
// links and nothing else — so a claim the model typed straight into the
// conversation reached the owner unchecked, while a claim produced by a
// tool two lines earlier was stripped and explained.
//
// The system prompt tries to close this with a rule ("Copy a customer
// will read goes through the tool, always — even one line"). That is a
// prompt, not code, and it only covers copy the model KNOWS is copy. It
// does nothing about "your soy wax burns cleaner than paraffin, so I'd
// lead with that" — a comparison, asserted conversationally, inside
// advice.
//
// WHAT THIS DELIBERATELY DOES NOT DO: rewrite the conversation. Chat is
// a conversation, and silently deleting half of an explanation reads as
// a bug. So the sentence carrying the claim is withheld and NAMED, in a
// separate block, in the same words the owner already sees from
// `_claimsNote`.

import { stripUnsupported, findUnsupportedClaims, stripUnverifiable } from "@/lib/claims/claimCheck";
import { checkNarrative, narrativeNote } from "@/lib/claims/narrativeProvenance";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

/**
 * A claim the chat is QUOTING is not a claim the chat is making.
 *
 * The product deliberately explains its own refusals: "I can't put
 * 'India's best candles' on your site — nothing on record backs it."
 * Checking that sentence finds the superlative and removes the
 * explanation, which is the opposite of the intended behaviour. So
 * quoted spans are masked before the check and restored after: the
 * detector cannot see inside them, and the sentence survives whole.
 *
 * DOUBLE QUOTES ONLY, straight and curly.
 *
 * The first version also matched single quotes wrapping more than one
 * word, on the theory that an apostrophe cannot open a quote. It can:
 * "Here's what I'd lead with" pairs the apostrophe in "Here's" with the
 * one in "I'd" and masks everything between them, which swallowed real
 * sentences and let the claims in them through. Two of this module's own
 * tests caught it. Curly ‘single’ quotes are left matched because an
 * apostrophe is usually typed as ’ — the asymmetric pair cannot form
 * from two apostrophes.
 */
const QUOTED = /"[^"\n]{0,400}"|“[^”\n]{0,400}”|‘[^’\n]{0,400}’/g;

const MASK = "\u0001";

function maskQuotes(text: string): { masked: string; restore: (s: string) => string } {
  const held: string[] = [];
  const masked = text.replace(QUOTED, (q) => {
    held.push(q);
    return `${MASK}${held.length - 1}${MASK}`;
  });
  const restore = (s: string) => s.replace(new RegExp(`${MASK}(\\d+)${MASK}`, "g"), (_, i) => held[Number(i)] ?? "");
  return { masked, restore };
}

export type ReplyCheck = {
  /** The reply with claim-carrying sentences withheld. Quoted claims are untouched. */
  reply: string;
  /** Why each one went, in the owner's terms. */
  removed: string[];
  /** The block appended to the reply. Null when there was nothing to say. */
  note: string | null;
};

/**
 * Check the chat's prose.
 *
 * Reuses `stripUnsupported` with the facts when they are readable, and
 * the fact-independent subset when they are not (F-01) — no second
 * implementation of claim detection.
 */
export function checkReplyClaims(reply: string, facts: BusinessFacts | null | undefined): ReplyCheck {
  const text = reply ?? "";
  if (!text.trim()) return { reply: text, removed: [], note: null };

  const { masked, restore } = maskQuotes(text);

  // A BACKSTORY TYPED STRAIGHT INTO THE CONVERSATION (item 4.10).
  //
  // Still checked here, and still separately: a reply with no facts at
  // all takes the stripUnverifiable branch below, which has no
  // CLAIM_TERMS rule and so never reaches the sentence guard where
  // provenance now lives. An invented founding story carries no fact to
  // check, so without this it would pass untouched.
  //
  // WITH facts it is now applied inside stripUnsupported (moved there on
  // 2026-10-10), so this call would double it. The facts branch below
  // therefore reads the findings off the strip rather than calling again.
  //
  // "draft" mode either way, like the price rule: this is a conversation
  // the owner is reading, and silently deleting half an explanation
  // reads as a bug. The sentence stays and is named.
  const story = facts ? { findings: [] as ReturnType<typeof checkNarrative>["findings"] } : checkNarrative(masked, null, "draft");
  const storyNote = narrativeNote(story.findings, "draft");

  if (facts) {
    // "draft" mode: an unverified PRICE in conversation is flagged, not
    // deleted. The owner is reading this and may have just told it the
    // price themselves.
    const found = findUnsupportedClaims(masked, facts);
    if (found.length === 0) {
      // Nothing factual to strip, but a story may still need naming -
      // and findUnsupportedClaims does not run the narrative check, so
      // the strip is what finds it.
      const onlyStory = stripUnsupported(masked, facts, "draft");
      return { reply: text, removed: [], note: narrativeNote(onlyStory.narrative, "draft") };
    }
    const stripped = stripUnsupported(masked, facts, "draft");
    return {
      reply: restore(stripped.text) || text,
      removed: stripped.removed,
      // The strip's own narrative findings, so the story note is said
      // once and comes from the same pass that produced the text.
      note: joinNotes(replyClaimsNote(stripped.removed), narrativeNote(stripped.narrative, "draft")),
    };
  }

  const unchecked = stripUnverifiable(masked);
  if (unchecked.removed.length === 0 && unchecked.unverifiable.length === 0) {
    return { reply: text, removed: [], note: storyNote };
  }
  return {
    reply: restore(unchecked.text) || text,
    removed: unchecked.removed,
    note: joinNotes(replyClaimsNote(unchecked.removed, unchecked.unverifiable), storyNote),
  };
}

/** Two notes read as one block, not as two stacked warnings. */
function joinNotes(a: string | null, b: string | null): string | null {
  const parts = [a, b].filter(Boolean).map((x) => String(x).trim());
  return parts.length ? `

${parts.join(" ")}` : null;
}

/**
 * What the owner reads underneath.
 *
 * Says what was taken out and why, and says nothing about the rest being
 * verified — the guard detects known claim patterns, not every untruth,
 * and implying otherwise is how an owner stops reading critically.
 */
export function replyClaimsNote(removed: string[], unverifiable: string[] = []): string | null {
  if (removed.length === 0 && unverifiable.length === 0) return null;
  const parts: string[] = [];
  if (removed.length) {
    parts.push(
      `⚠️ ${removed.length === 1 ? "A line was" : `${removed.length} lines were`} left out of that reply because ${
        removed.length === 1 ? "it claims" : "they claim"
      } something your records don't back: ${removed.join("; ")}.`
    );
  }
  if (unverifiable.length) {
    parts.push(`Hawlai also couldn't read your store records just now, so ${unverifiable.join(" and ")} in that reply is unchecked.`);
  }
  parts.push("If something there is true, add it to Business Knowledge and it can be said.");
  return `\n\n${parts.join(" ")}`;
}
