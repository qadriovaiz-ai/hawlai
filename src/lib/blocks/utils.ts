import type { Block } from "./types";

// Used to decide whether a page needs a live products fetch before
// rendering — recursive since blocks can nest arbitrarily (unlike the
// old flat sections array, where a "product_catalog" was always a
// top-level item).
export function blockTreeContainsType(blocks: Block[], type: string): boolean {
  return blocks.some((b) => b.type === type || (b.children != null && blockTreeContainsType(b.children, type)));
}

/** One question and the answer under it, as the page states them. */
export type FaqPair = { question: string; answer: string };

/**
 * Every question-and-answer pair on a page, in page order.
 *
 * READS THE PAIR, NOT THE LAYOUT. A `faq_item` counts wherever it sits
 * in the tree — inside a `faq` block, inside a plain stack, or on its
 * own — because `allowedChildren` is advisory (see types.ts) and a pair
 * the owner dragged somewhere else is still a question the page answers.
 *
 * BOTH HALVES OR NEITHER. A pair missing its question or its answer is
 * dropped. Google's FAQPage requires an `acceptedAnswer`, and more to
 * the point, publishing a `Question` with an empty answer would be
 * machine-readable nonsense that something will quote.
 */
export function faqPairsFromBlocks(blocks: Block[]): FaqPair[] {
  const out: FaqPair[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (b?.type === "faq_item") {
        const question = String(b.props?.heading ?? "").trim();
        const answer = String(b.props?.html ?? "").trim();
        if (question && answer) out.push({ question, answer });
      }
      if (b?.children != null) walk(b.children);
    }
  };
  walk(blocks ?? []);
  return out;
}
