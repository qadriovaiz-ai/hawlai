// Turning a phrase into a specific thing to change.
//
// FOR REVIEW. Nothing calls this yet.
//
// THE RULE: never guess. A merchant says "change the price of the blue
// kurta"; if that does not land on exactly one unambiguous product,
// the assistant asks rather than picking a best match. The cost of
// asking is one extra turn. The cost of guessing is a live price
// change on the wrong product, approved by someone who trusted the
// label they were shown.
//
// This is deliberately platform-agnostic — the search itself is
// platform-specific, but "did we land on exactly one thing, and if
// not what do we show the person" is the same question everywhere.

export type ResolutionPath = "exact" | "user_clarified" | "direct";

/**
 * A candidate, with enough on it for a person to tell two similar
 * products apart. Requirement: name alone is not enough — "Kurta" and
 * "Kurta (Blue)" at different prices are indistinguishable without
 * the price beside them.
 */
export type ResolvedTarget = {
  /** Platform-native id the mutation takes. */
  ref: string;
  /** Exact stored title, never the phrase the merchant typed. */
  title: string;
  /** Variant name where a product has several ("Large / Blue"). */
  variantTitle: string | null;
  currentPrice: string | null;
  /** ISO code of the store's currency. Never assumed — see money.ts. */
  currency?: string | null;
  imageUrl: string | null;
  /** Whether the platform considers it visible to customers. */
  active: boolean;
};

export type ResolutionOutcome =
  | { status: "resolved"; path: ResolutionPath; target: ResolvedTarget; detail: ResolutionDetail }
  /** Ask. Never resolved silently, however tempting the top candidate. */
  | { status: "ambiguous"; query: string; candidates: ResolvedTarget[]; detail: ResolutionDetail }
  | { status: "not_found"; query: string; detail: ResolutionDetail };

export type ResolutionDetail = {
  query: string;
  candidateCount: number;
  /** How the candidates were found — exact title equality, or a looser search. */
  matchType: "exact" | "fuzzy" | "none" | "direct";
  chosenRef?: string;
};

/** Case- and whitespace-insensitive comparison. Not a fuzzy match. */
function sameTitle(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Decide what a set of candidates means.
 *
 * WHY THERE IS NO AUTOMATIC FUZZY RESOLUTION, which is a deliberate
 * departure from the three paths named in review (exact / fuzzy /
 * user-clarified):
 *
 * The instruction was also that anything without an exact match must
 * be asked about. Those two cannot both hold — an auto-resolving fuzzy
 * path IS resolving without an exact match. The "never guess" rule is
 * the stronger of the two and the one with a real failure behind it,
 * so it wins: a fuzzy match produces candidates and a question.
 *
 * `fuzzy` therefore survives as a matchType in the audit detail —
 * recording HOW candidates were found — but never as a resolution
 * path, because no fuzzy match is ever resolved without a person.
 * Making it an auto path is a confidence-threshold decision, and
 * thresholds are where "usually right" quietly becomes "wrong on the
 * one that mattered".
 */
export function interpretCandidates(query: string, candidates: ResolvedTarget[]): ResolutionOutcome {
  if (candidates.length === 0) {
    return { status: "not_found", query, detail: { query, candidateCount: 0, matchType: "none" } };
  }

  const exact = candidates.filter((c) => sameTitle(c.title, query));

  // Exactly one product whose title IS the phrase, with one variant.
  if (exact.length === 1) {
    return {
      status: "resolved",
      path: "exact",
      target: exact[0],
      detail: { query, candidateCount: candidates.length, matchType: "exact", chosenRef: exact[0].ref },
    };
  }

  // Several exact title matches means several variants, or genuinely
  // duplicated products. Both need a person: "which size?" is a real
  // question, and picking the first variant is how the wrong one gets
  // repriced.
  if (exact.length > 1) {
    return {
      status: "ambiguous",
      query,
      candidates: exact,
      detail: { query, candidateCount: exact.length, matchType: "exact" },
    };
  }

  return {
    status: "ambiguous",
    query,
    candidates,
    detail: { query, candidateCount: candidates.length, matchType: "fuzzy" },
  };
}

/**
 * A target supplied as a platform id rather than searched for.
 *
 * Recorded as its own path so the audit trail can distinguish "nothing
 * was searched" from "a search landed on one thing". They fail
 * differently: a wrong `direct` ref came from the caller, a wrong
 * `exact` came from the resolver.
 */
export function directTarget(target: ResolvedTarget): ResolutionOutcome {
  return {
    status: "resolved",
    path: "direct",
    target,
    detail: { query: target.ref, candidateCount: 1, matchType: "direct", chosenRef: target.ref },
  };
}

/**
 * A candidate the person picked from a list the assistant showed them.
 *
 * Takes the ORIGINAL candidate set so the audit records what the
 * choice was made from — "they picked one of five" is a materially
 * different fact from "they picked the only option".
 */
export function userClarified(query: string, chosen: ResolvedTarget, shown: ResolvedTarget[]): ResolutionOutcome {
  return {
    status: "resolved",
    path: "user_clarified",
    target: chosen,
    detail: { query, candidateCount: shown.length, matchType: "fuzzy", chosenRef: chosen.ref },
  };
}
