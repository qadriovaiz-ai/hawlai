// The buying questions this business is checked against (Brain, Phase 1b).
//
// WHY THESE ARE FIXED: the AEO check used to ask the model to invent
// three or four questions each time it ran. That is fine for a snapshot
// and useless for a trend — "not mentioned" last week and "mentioned"
// this week might be answers to entirely different questions, so the
// movement means nothing. A business can only be tracked against a set
// that stays the same.
//
// Derived in code from what the business actually is, so no AI call and
// no drift: same facts in, same questions out, in the same order.

export type AeoQuestionInput = {
  category?: string | null;
  city?: string | null;
  /** Catalogue items, most prominent first. */
  items?: { name: string; kind?: "product" | "service" | null }[];
  /** How the business makes money — decides "book" against "buy". */
  models?: string[];
};

/** Four is what the check already asked for, so the cost is unchanged. */
export const MAX_QUESTIONS = 4;

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * The questions to test, same every run for the same business.
 *
 * Returns [] when there isn't even a category to ask about — a check
 * against invented questions is worse than no check.
 */
export function aeoQuestions(input: AeoQuestionInput): string[] {
  const category = clean(String(input.category ?? "")).toLowerCase();
  if (!category || category === "business") return [];

  const city = clean(String(input.city ?? ""));
  const where = city ? ` in ${city}` : " near me";
  const items = (input.items ?? []).filter((i) => i?.name?.trim());
  const services = items.filter((i) => i.kind === "service");
  // What this business mostly sells decides the verb a buyer would use.
  const booked = services.length > 0 || (input.models ?? []).includes("services");
  const headline = clean(services[0]?.name ?? items[0]?.name ?? "");

  const out: string[] = [
    // The plain recommendation ask.
    `best ${category}${where}`,
    // The value-framed ask — the check has always wanted one of these,
    // because it is where a small business can actually win.
    `best affordable ${category}${where}`,
  ];

  // Priced intent, named after the thing they would actually buy or book.
  if (headline) {
    out.push(booked ? `how much does ${headline.toLowerCase()} cost${where}` : `where to buy ${headline.toLowerCase()}${where}`);
  } else {
    out.push(booked ? `where to book ${category}${where}` : `where to buy ${category}${where}`);
  }

  // The doubt question: what someone asks before deciding at all.
  out.push(`is ${headline ? headline.toLowerCase() : category} worth it`);

  // Deduped, because a one-item catalogue named after its category can
  // produce the same sentence twice.
  return Array.from(new Set(out.map(clean))).slice(0, MAX_QUESTIONS);
}

/**
 * The same set, built from the rows a caller already has to hand.
 *
 * Kept beside aeoQuestions so both callers of the AEO check — the SEO
 * page and chat — ask the identical questions. Two callers deriving
 * their own set would quietly break the comparison this exists for.
 */
export function aeoQuestionsFor(
  dealership: { business_category?: string | null; city?: string | null } | null | undefined,
  facts?: { products?: { name: string; kind?: string | null }[]; businessModels?: { models?: string[] } | null; category?: string | null; city?: string | null } | null
): string[] {
  return aeoQuestions({
    category: dealership?.business_category ?? facts?.category ?? null,
    city: dealership?.city ?? facts?.city ?? null,
    items: (facts?.products ?? []).map((p) => ({ name: p.name, kind: p.kind === "service" ? "service" : "product" })),
    models: facts?.businessModels?.models ?? [],
  });
}
