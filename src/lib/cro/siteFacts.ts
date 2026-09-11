// CRO's view of the shared claims guard (src/lib/claims).
//
// CRO was where the problem was first found — "Loved by 500+ homes"
// for a business with one order — and where the fact-checking approach
// was built. It now lives in src/lib/claims so every department that
// writes copy uses the same facts and the same checks; this file keeps
// CRO's names and its one CRO-specific behaviour (dropping whole
// suggestions rather than single sentences).

import { gatherBusinessFacts, type BusinessFacts } from "@/lib/claims/businessFacts";
import { findUnsupportedClaims } from "@/lib/claims/claimCheck";

export { PAID_ORDER_STATUSES, blocksText, formatFactsForPrompt, knownText, type SitePage } from "@/lib/claims/businessFacts";
export { findUnsupportedClaims } from "@/lib/claims/claimCheck";

export type CroFacts = BusinessFacts;
export const gatherCroFacts = gatherBusinessFacts;

export const CRO_TRUTH_RULES = `TRUTH RULES — the merchant may paste your copy straight onto their live site:
- Only state things as true if they appear in the VERIFIED FACTS above.
- NEVER invent numbers: no customer or order counts, "X+ happy customers", ratings, stars, reviews, years in business or sales figures. The only counts you may use are the ones listed.
- NEVER write an offer, discount, free shipping, packaging (gift box, keepsake box), guarantee, certification (organic, vegan, phthalate-free, all-natural) or product into proposed copy unless it is listed above. If one would genuinely help, recommend it as a decision for the owner ("Consider creating a first-order discount code") — never as ready-to-publish copy that claims it exists.
- If the facts are too thin to make a point, say so rather than filling the gap.`;

function itemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return Object.values(item as Record<string, unknown>).filter((v) => typeof v === "string").join(" \n ");
}

/**
 * Removes every suggestion that rests on an unsupported claim, and says
 * so. Suggestions are dropped whole: a fix whose copy claims "500+
 * homes" can't be half-kept.
 */
export function scrubCroOutput(output: any, f: CroFacts): { output: any; removed: string[] } {
  if (!output || typeof output !== "object") return { output, removed: [] };
  const removed: string[] = [];
  const cleaned: Record<string, unknown> = { ...output };
  for (const [key, value] of Object.entries(output)) {
    if (!Array.isArray(value)) continue;
    cleaned[key] = value.filter((item) => {
      const problems = findUnsupportedClaims(itemText(item), f);
      removed.push(...problems);
      return problems.length === 0;
    });
  }
  if (removed.length > 0) {
    const n = Array.from(new Set(removed)).length;
    cleaned.note = `Removed suggestions that relied on details Hawlai couldn't verify (${n} issue${n === 1 ? "" : "s"}: ${Array.from(new Set(removed)).slice(0, 3).join("; ")}).`;
  }
  return { output: cleaned, removed: Array.from(new Set(removed)) };
}
