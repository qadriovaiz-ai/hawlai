// C2 STEP 2 — THE SELECTION, CHECKED IN CODE.
//
// docs/PLAN-CORE-ARCHITECTURE.md §2.1. No model call. This is the step
// that makes the allowlist an allowlist: a claim survives only if a real
// record of this tenant's, carrying the right licence, supports it — and
// a figure survives only if it equals the figure in that record.
//
// WHY CODE AND NOT A PROMPT. Every rule here is checkable by looking,
// so asking a model to apply it would add a way for it to go wrong and
// no way for it to go right. The model's job was to point at records;
// whether those records can bear the weight is arithmetic and table
// lookup.

import { resolveFactId, type FactLicence, type FactRecord } from "@/lib/facts/factRecord";
import { NEEDS_RECIPIENT_RECORD, UNLICENSABLE_TYPES, type ClaimType } from "@/lib/facts/extractClaims";
import type { SelectedClaim } from "@/lib/facts/selectClaims";

/**
 * The licence a claim of each kind needs from the record it cites.
 *
 * The four unlicensable types are absent on purpose: no source grants
 * `benefit` or `safety`, and `capability` and `comparison` are claims
 * about things outside the records entirely. They are refused before
 * this map is consulted.
 */
export const LICENCE_FOR_CLAIM: Partial<Record<ClaimType, FactLicence>> = {
  // A PRICE AND AN OFFER MUST COME FROM THE ROW CHECKOUT READS, and a
  // count from our own arithmetic. Those three keep `value`, which only
  // the catalogue, the offers table, the shipping config and measured
  // rows grant.
  price: "value",
  offer: "value",
  count: "value",
  // A DURATION DOES NOT, and the S1 exit run of 2026-10-16 is why. The
  // candle's 40-hour burn time lives in an owner_stated row — the owner
  // is the ONLY possible source for it, there being no checkout column
  // for how long a candle burns — so requiring `value` refused a fact
  // the reviewer graded true four times in the baseline. The salon's
  // durations survived only because they happen to sit in the
  // catalogue's duration_minutes column.
  //
  // The figure is still checked against the record below, so loosening
  // the LICENCE does not loosen the number: `existence` says this
  // record can establish the thing at all, and arithmetic says whether
  // the figure is the right one.
  duration: "existence",
  // A shipping claim is about what the store DOES, which shipping_config
  // grants as policy — and the rate, which it grants as value. Policy is
  // the weaker requirement, and the figure is checked separately below.
  shipping: "policy",
  availability: "policy",
  credential: "existence",
  material: "existence",
  process: "process",
  // Only ever reachable if the recipient guard above it is removed,
  // which a test asserts it is not.
  customer_state: "value",
};

export type Rejection = {
  claim: SelectedClaim;
  /** Said plainly: this reaches the owner, not a log. */
  reason: string;
  /** Which rule refused it, so a report can group them. */
  rule: "no_licence_exists" | "needs_recipient_record" | "unknown_fact" | "wrong_tenant" | "no_licence_on_record" | "figure_mismatch" | "no_citation";
};

export type OwnerQuestion = {
  text: string;
  /** Recording this would make claims of this kind possible. */
  wouldLicense: ClaimType;
};

export type Validated = {
  approved: SelectedClaim[];
  rejected: Rejection[];
  questions: OwnerQuestion[];
};

/** Same number to the paisa. "₹549" and "₹549.00" are one figure. */
function sameFigure(a: unknown, b: unknown): boolean {
  // A BOOLEAN IS NOT A NUMBER. Number(false) is 0, so without this a
  // claim of 0 — "₹0", "free" — matches any record whose value is
  // false. Booleans compare as booleans, which is how a claim that
  // correctly copies `false` still matches.
  if (typeof a === "boolean" || typeof b === "boolean") {
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }
  const x = Number(a);
  const y = Number(b);
  if (Number.isFinite(x) && Number.isFinite(y)) return Math.abs(x - y) < 0.005;
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

/**
 * The figure appears, whole, inside a record's own words.
 *
 * TWO FALSE REFUSALS IN THE S1 EXIT RUN came from a figure that is real
 * and recorded but not the record's `value`:
 *
 *   statement.fssai_licence… = "FSSAI licence 11223344556677."
 *     the licence number is IN the sentence, and the value IS the
 *     sentence, so a number beside it could never match
 *
 *   product.desi_ghee_500ml.name = "Desi ghee 500ml"
 *     the size exists only inside the product's name
 *
 * Still arithmetic, not judgement: the digits must appear as a whole
 * number, so 50 does not match "500ml" and 500 does not match "1500".
 * Digit boundaries rather than word boundaries, because "500ml" has no
 * word break after the number.
 */
function figureInText(record: FactRecord, value: unknown): boolean {
  if (typeof value === "boolean") return false;
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  const haystacks = [typeof record.value === "string" ? record.value : "", record.recordedText ?? ""];
  // The digits as written, and with any grouping commas removed, so
  // "11,22,33,44,55,66,77" and "11223344556677" are one number.
  const digits = String(n);
  // The boundary excludes a digit on either side, and a decimal point
  // only when a digit follows it — so "11223344556677." at the end of a
  // sentence matches, while 1122 inside 11223344556677 does not. The
  // first version excluded any "." and therefore failed on every
  // number that ends a sentence, which is most of them.
  const pattern = new RegExp(`(?<![0-9])(?<!\\.[0-9]{0,20})${digits}(?![0-9])(?!\\.[0-9])`);
  return haystacks.some((h) => pattern.test(String(h).replace(/,/g, "")));
}

/**
 * Check every selected claim against the records it cites.
 *
 * ORDER MATTERS, and the strictest rules come first: a claim that no
 * record could ever license is refused before anything looks up its
 * citations, so a model that cites a real record for a benefit claim
 * gains nothing by it.
 */
export function validateSelection(selection: { claims: SelectedClaim[] }, records: FactRecord[], dealershipId: string): Validated {
  const approved: SelectedClaim[] = [];
  const rejected: Rejection[] = [];
  const questions: OwnerQuestion[] = [];

  for (const claim of selection.claims) {
    // 1. NO SOURCE CAN EVER LICENSE THIS. Not a missing record — an
    // impossible one. "Sleep better" and "safe for babies" are refused
    // by the absence of a licence rather than by a pattern, which is
    // what makes the Hinglish forms need no rule of their own.
    if (UNLICENSABLE_TYPES.includes(claim.claimType)) {
      rejected.push({
        claim,
        rule: "no_licence_exists",
        reason:
          claim.claimType === "comparison"
            ? "nothing a business records about itself can establish a claim about someone else's product"
            : `nothing on record can support a ${claim.claimType} claim, and nothing you could write down would change that — this needs real evidence of its own`,
      });
      continue;
    }

    // 2. A CLAIM ABOUT THE READER'S OWN ORDER. Founder's rule of
    // 2026-10-16: backed by a real order or lead row for THIS recipient,
    // or it is false. getContext carries no per-recipient records, so
    // today there is nothing it could be backed by and it is always
    // refused. business.paid_orders = 2 does not establish that the
    // person reading this has one of them.
    if (NEEDS_RECIPIENT_RECORD.includes(claim.claimType)) {
      rejected.push({
        claim,
        rule: "needs_recipient_record",
        reason:
          "this says something about the reader's own order or booking, and nothing here knows who is reading it — a count of the business's orders is not a record of theirs",
      });
      continue;
    }

    // 3. A claim with no citation at all.
    if (!claim.factIds.length) {
      rejected.push({ claim, rule: "no_citation", reason: "no record was cited for this, so there is nothing to check it against" });
      continue;
    }

    // 4. Every cited record must exist, and belong to THIS business.
    const cited: FactRecord[] = [];
    let bad: Rejection | null = null;
    for (const id of claim.factIds) {
      const found = records.find((r) => r.id === id);
      if (!found) {
        bad = { claim, rule: "unknown_fact", reason: `it cites a record (${id}) that does not exist` };
        break;
      }
      // resolveFactId returns null across tenants, which is the check
      // that matters: a citation is only evidence inside the business
      // it belongs to.
      if (!resolveFactId(records, dealershipId, id)) {
        bad = { claim, rule: "wrong_tenant", reason: `it cites a record (${id}) belonging to a different business` };
        break;
      }
      cited.push(found);
    }
    if (bad) {
      rejected.push(bad);
      continue;
    }

    // 5. At least one cited record must carry the licence this kind of
    // claim needs. A price must come from somewhere that grants `value`
    // — the catalogue row checkout reads — and not from a sentence the
    // owner typed in prose.
    const needed = LICENCE_FOR_CLAIM[claim.claimType];
    if (needed && !cited.some((r) => r.licenses.includes(needed))) {
      rejected.push({
        claim,
        rule: "no_licence_on_record",
        reason: `a ${claim.claimType} claim needs a record that can establish "${needed}", and the one(s) cited cannot`,
      });
      questions.push({
        text: `To say this, record it where it belongs: ${claim.intent || claim.claimType}`,
        wouldLicense: claim.claimType,
      });
      continue;
    }

    // 6. THE FIGURE COMES FROM THE RECORD. A claim carrying a number
    // that no cited record carries is the candle-03 failure in another
    // form: Rs 850 was a real price, of the other product.
    if (claim.value !== null && claim.value !== undefined && claim.value !== "") {
      const match = cited.find((r) => sameFigure(r.value, claim.value)) ?? cited.find((r) => figureInText(r, claim.value));
      if (!match) {
        rejected.push({
          claim,
          rule: "figure_mismatch",
          reason: `it states ${claim.value}${claim.unit ? ` ${claim.unit}` : ""}, and the record(s) it cites say ${cited
            .map((r) => `${r.value ?? "nothing"}${r.unit ? ` ${r.unit}` : ""}`)
            .join(", ")}`,
        });
        continue;
      }
      // A record whose value is null is a known-unknown: we looked and
      // there is no answer. Citing it for a figure is citing an absence.
      if (match.value === null) {
        rejected.push({ claim, rule: "figure_mismatch", reason: "the record it cites has no value — we looked and there is no answer" });
        continue;
      }
    }

    approved.push(claim);
  }

  return { approved, rejected, questions: dedupe(questions) };
}

function dedupe(questions: OwnerQuestion[]): OwnerQuestion[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    const key = `${q.wouldLicense}:${q.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What the owner is told about a conflict or a refusal. One line each, no jargon. */
export function validationNote(v: Validated, conflicts: { askedFor: string; recordSays: string }[], unknowns: string[]): string | null {
  const lines: string[] = [];
  for (const c of conflicts) lines.push(`You asked for ${c.askedFor}. Your records say ${c.recordSays} — change the record, or I write it without that.`);
  for (const r of v.rejected) lines.push(`Left out: ${r.claim.intent || r.claim.claimType} — ${r.reason}.`);
  for (const u of unknowns) lines.push(`Not on record: ${u}`);
  return lines.length ? lines.join("\n") : null;
}
