// Which provider actually answered, said out loud.
//
// THE DISHONESTY THIS REPLACES: classifyResearch already knew. When
// PERPLEXITY_API_KEY is unset it returns active:false with the reason
// "…isn't connected yet — falling back to Claude's own web search", and
// when a Perplexity call fails at runtime researchAgentV2 catches it and
// runs Claude instead. Both were logged with console.warn and nothing
// else. The owner was handed a researched answer with no way to know
// which engine produced it, how deep it went, or that the deeper one was
// never available — so "I ran deep research on that" was something the
// product let them believe.
//
// Section 21's rule is that a provider failing over should not surface as
// an error, and that stands: the answer really was researched, by a real
// substitute, and an error would be wrong. Not telling them WHICH is a
// different thing, and it is the thing that was wrong.
//
// Said as one plain sentence, carried on the result as `_provider`.

import { SEARCH_CAPS, type SearchCapKey } from "@/lib/ai/searchCaps";
import { costOfWebSearchesInr } from "@/lib/usage/pricing";
import type { ResearchProvider } from "./researchRouter";

export type AnsweredBy = {
  /** What ran, after any fallback. */
  provider: "claude_web_search" | "perplexity" | "perplexity_deep";
  /** The provider the router would have chosen, when it differs. */
  intended?: ResearchProvider;
  /** Why it differed: not connected at all, or it failed mid-call. */
  fellBackBecause?: "not_connected" | "failed";
  /** The web_search ceiling for this call, when Claude answered. */
  searchCap?: SearchCapKey;
};

const NAME: Record<AnsweredBy["provider"], string> = {
  claude_web_search: "Claude web search",
  perplexity: "Perplexity",
  perplexity_deep: "Perplexity Deep Research",
};

/**
 * The most this call's searches can cost, before it runs.
 *
 * An upfront number is cheap here and only here: `max_uses` is a hard
 * ceiling, so "at most 3 searches" is a fact rather than a forecast. The
 * TOKENS are not predictable the same way — they depend on how much the
 * search results return — so this is named as the search cost it is and
 * never presented as the cost of the whole call.
 */
export function searchCostCeiling(cap: SearchCapKey): { searches: number; inr: number } {
  const searches = SEARCH_CAPS[cap];
  return { searches, inr: costOfWebSearchesInr(searches) };
}

/**
 * One sentence naming what answered — and, when it isn't what was meant,
 * saying so plainly instead of leaving the gap for the owner to assume
 * into.
 */
export function answeredByNote(by: AnsweredBy): string {
  const parts: string[] = [];

  if (by.provider === "claude_web_search" && by.searchCap) {
    const { searches, inr } = searchCostCeiling(by.searchCap);
    parts.push(`Answered with ${NAME.claude_web_search} (up to ${searches} searches, about ₹${inr.toFixed(2)} of search).`);
  } else {
    parts.push(`Answered with ${NAME[by.provider]}.`);
  }

  if (by.fellBackBecause === "not_connected") {
    // Named so nobody reads depth into it that isn't there.
    parts.push("Perplexity isn't connected, so this is a standard web-search answer, not deep research.");
  } else if (by.fellBackBecause === "failed") {
    parts.push(`${by.intended === "perplexity_deep" ? NAME.perplexity_deep : NAME.perplexity} was unavailable just now, so this came from the substitute rather than the deeper source.`);
  }

  return parts.join(" ");
}
