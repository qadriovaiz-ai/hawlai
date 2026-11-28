// The policies shown on Instagram Store → Policies (S4, 28 Nov 2026).
//
// NOT NEW FIELDS — the founder's decision C. These are the
// business_knowledge rows the onboarding interview already writes
// (src/lib/onboarding/interview.ts), with these exact titles and category
// "policy", and which the claims guard and the DM reply already read. A
// second copy of the policy text would be a second truth the replies never
// see. tests/instagramStorePolicies holds these titles to the interview's.

export const POLICY_CATEGORY = "policy";

export const STORE_POLICIES = [
  { title: "Returns and refunds", hint: "Do you take returns? Within how many days, in what condition, and how does the money come back?" },
  { title: "Delivery time", hint: "How many days does it usually take to reach a customer after they order — the normal case, not the best one?" },
  { title: "Damaged on arrival", hint: "If something arrives damaged, what do you actually do — replace it, refund it, or neither?" },
] as const;

export type PolicyRow = { id: string; title: string; content: string; category: string };

/** This business's rows for the three policies, by title — or null where none exists yet. */
export function policiesFrom(facts: { id: string; title: string; content: string; category: string }[]): Record<string, PolicyRow | null> {
  const out: Record<string, PolicyRow | null> = {};
  for (const p of STORE_POLICIES) {
    out[p.title] = facts.find((f) => f.category === POLICY_CATEGORY && f.title === p.title) ?? null;
  }
  return out;
}

/**
 * How a save goes to /api/business-knowledge: PATCH the row when it exists
 * (the same row the interview wrote), POST a new one with the interview's
 * own category and title when it doesn't. Empty text is refused — clearing
 * a policy is not the same as having none, and the reply would read "".
 */
export function policySaveRequest(
  title: string,
  content: string,
  existing: PolicyRow | null
): { ok: true; method: "PATCH" | "POST"; body: Record<string, unknown> } | { ok: false; reason: string } {
  const text = String(content ?? "").trim();
  if (!STORE_POLICIES.some((p) => p.title === title)) return { ok: false, reason: "That isn't one of the store's policies." };
  if (!text) return { ok: false, reason: "Write the policy first — an empty one isn't saved." };
  if (text.length > 2000) return { ok: false, reason: "Keep it under 2,000 characters." };
  return existing
    ? { ok: true, method: "PATCH", body: { id: existing.id, content: text } }
    : { ok: true, method: "POST", body: { category: POLICY_CATEGORY, title, content: text } };
}
