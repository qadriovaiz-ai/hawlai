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
import { describeScope, recordSupportsScope, resolveProduct, scopeOfKey } from "@/lib/facts/scope";
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
  // AVAILABILITY MEANS "WE SELL THIS", AND A CATALOGUE ROW IS THE
  // RECORD OF IT. Four runs paid for this line.
  //
  // It required "policy", which only the shipping config and the
  // owner's own statements grant - so an availability claim citing a
  // product or service row was always refused, however real the row.
  // The owner's note read "Left out: Name the service so the reader
  // knows what is being offered" in runs 7, 9, 10, 11 and 12, and in
  // run 12 it went further: salon-04 had NOTHING approved, so the
  // writer's two true sentences - "Keratin treatment is available" and
  // "Haircut is available" - were both removed for having no fact
  // behind them. A salon could not say what it does for a living.
  //
  // Rule 7b in the extractor draws the line this depends on: selling a
  // service is `availability`, while the business acting by itself,
  // unasked, is `capability`, which nothing can license.
  //
  // WHAT THIS ACCEPTS, stated rather than discovered later: "in stock
  // today" and "we sell this" are one claim type, so a catalogue
  // listing now licenses the stronger reading too. Inventory is not
  // tracked anywhere in this product, so the alternative was deleting
  // every true sentence about what a business offers - which is what
  // has been happening. Same shape as the `duration: "existence"` fix
  // of 2026-10-16, and the same reasoning: the licence has to match
  // what the record actually is.
  availability: "existence",
  credential: "existence",
  material: "existence",
  process: "process",
  // Only ever reachable if the recipient guard above it is removed,
  // which a test asserts it is not.
  customer_state: "value",
};

/**
 * What a record's KEY says the claim about it is.
 *
 * THE S1 EXIT RUN OF 2026-10-16 LOST A TRUE CLAIM TO A LABEL. The
 * candle's 40-hour burn time was selected with
 * `claimType: "benefit"` — intent "the candle burns for 40 hours, which
 * is the central claim" — and refused, because benefit is unlicensable.
 * The licence table is only ever as strong as the type the model picks,
 * and fixing `duration` in the table did nothing for a claim the model
 * did not call a duration.
 *
 * So a record's key is consulted. It is a fact ABOUT the record rather
 * than a judgement, which is why code may use it.
 */
const TYPE_FROM_KEY: { re: RegExp; claimType: ClaimType }[] = [
  { re: /\.price$/, claimType: "price" },
  { re: /\.duration_minutes$|_hours$|_minutes$|_days$/, claimType: "duration" },
  { re: /^offer\./, claimType: "offer" },
  { re: /^shipping\./, claimType: "shipping" },
  { re: /^business\.(?:paid_orders|leads)$/, claimType: "count" },
  { re: /^material\./, claimType: "material" },
  { re: /^process\./, claimType: "process" },
];

export function typeFromKey(key: string): ClaimType | null {
  return TYPE_FROM_KEY.find((t) => t.re.test(key))?.claimType ?? null;
}

/**
 * The labels a figure may be rescued FROM. `comparison` is absent, and
 * its own test is why.
 *
 * A mislabelled benefit, safety or capability claim is a claim about
 * THIS business's own thing, wrongly named — so the record it cites can
 * say what it is really about. A comparison is a claim about SOMEONE
 * ELSE'S product, and no record of this business can establish one, so
 * the cited record cannot be evidence of what the claim is about.
 *
 * The first version allowed all four, and the test "a comparison is
 * never rescued" went red: "it burns longer than other candles",
 * carrying 40 and citing the burn-hours record, was re-typed to
 * `duration` and approved. That is the comparative claim this whole
 * initiative started with, let through by a repair meant for a
 * different fault.
 */
const RETYPABLE: ClaimType[] = ["benefit", "safety", "capability"];

export type Rejection = {
  claim: SelectedClaim;
  /** Said plainly: this reaches the owner, not a log. */
  reason: string;
  /** Which rule refused it, so a report can group them. */
  rule:
    | "no_licence_exists"
    | "needs_recipient_record"
    | "unknown_fact"
    | "wrong_tenant"
    | "no_licence_on_record"
    | "figure_mismatch"
    | "no_citation"
    /** A claim about one product, cited to a record about something else. */
    | "wrong_scope";
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
/**
 * The figures a claim's `value` actually carries.
 *
 * A number or a boolean is one figure. A string is read for digit runs,
 * so "FSSAI licence 11223344556677" yields one and "Soy wax" yields
 * none — and none means "this is not a figure", not "this is a figure
 * of nothing". Grouping commas are dropped so "11,22,33,44,55,66,77"
 * and "11223344556677" are the same number.
 */
export function figuresInValue(value: unknown): (number | boolean)[] {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "boolean") return [value];
  if (typeof value === "number") return Number.isFinite(value) ? [value] : [];
  const text = String(value);
  const runs = text.replace(/,/g, "").match(/[0-9]+(?:\.[0-9]+)?/g) ?? [];
  return runs.map(Number).filter((n) => Number.isFinite(n));
}

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
export function figureInText(record: FactRecord, value: unknown): boolean {
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
export function validateSelection(
  selection: { claims: SelectedClaim[] },
  records: FactRecord[],
  dealershipId: string,
  /**
   * The business's catalogue, so a product NAME can be checked against
   * what it actually sells. Defaults to the product records already in
   * `records`, which is what every caller has.
   */
  catalogue: { name?: string | null }[] = productsFromRecords(records)
): Validated {
  const approved: SelectedClaim[] = [];
  const rejected: Rejection[] = [];
  const questions: OwnerQuestion[] = [];

  for (const original of selection.claims) {
    // 0. A MISLABELLED FIGURE IS RE-TYPED FROM THE RECORD IT CITES, and
    // the condition is deliberately narrow: the claim must carry a
    // FIGURE that MATCHES the cited record's own value.
    //
    // That is what separates the two cases. "The candle burns for 40
    // hours" labelled `benefit` carries 40 and cites a record whose
    // value is 40 — it is plainly a claim about that figure, whatever
    // the model called it. "It helps you sleep" labelled `benefit` and
    // citing material.soy carries no figure at all, so nothing here
    // touches it and it stays refused.
    //
    // Without the figure condition this would be a hole big enough to
    // drive a benefit claim through: cite any real record, call it
    // anything, get re-typed into something licensable.
    const claim = retypeFromRecord(original, records);
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

    // 4b. SCOPE, IN CODE. The founder's rule of 2026-10-16 lived in
    // three prompts and nowhere here, so it held wherever a model
    // applied it and failed wherever one did not — which is the pattern
    // he named on 18 October rather than the three sentences it
    // produced.
    //
    // A claim about ONE named item needs that item's own record. A
    // store-level policy (shipping, offers) counts, because a policy IS
    // about every product; without that carve-out "free shipping on the
    // lavender candle" could never be said, and it is true.
    const named = resolveProduct(claim.aboutProduct, catalogue);
    if (named.kind === "unknown") {
      // A product the catalogue does not sell. Resolving it to null
      // would quietly turn this into a business-level claim that any
      // record could support.
      rejected.push({
        claim,
        rule: "wrong_scope",
        reason: `it is about "${named.named}", which is not a product or service on record`,
      });
      continue;
    }
    if (named.kind === "known" && !cited.some((r) => recordSupportsScope(r.key, named.slug))) {
      rejected.push({
        claim,
        rule: "wrong_scope",
        reason: `it is about one product, and the record(s) cited are ${cited.map((r) => describeScope(r.key)).join("; ")}`,
      });
      questions.push({
        text: `To say this about one product, record it against that product: ${claim.intent || claim.claimType}`,
        wouldLicense: claim.claimType,
      });
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
    //
    // ONLY A FIGURE IS CHECKED AS A FIGURE, and the fifth S2a WhatsApp
    // run of 2026-10-19 is why that has to be said out loud. Two true
    // claims were refused here, one of them absurdly:
    //
    //   it states FSSAI licence 11223344556677, and the record(s) it
    //     cites say FSSAI licence 11223344556677.
    //   it states Soy wax, and the record(s) it cites say Soy wax,
    //     40 hour burn.
    //
    // The first is the claim and the record agreeing word for word and
    // being rejected. `value` is documented as "the figure, copied
    // exactly" — Select had put the whole recorded phrase in it, so
    // Number() gave NaN, the string compare failed on the surrounding
    // words, and figureInText could not read a figure out of prose.
    //
    // So the kind of value decides which rule applies. A number or a
    // boolean is arithmetic, as before. A string CONTAINING digits is
    // checked digit by digit — every number in it must be the record's,
    // because "Rs 999 for 2 candles" carries two of them. A string with
    // NO digits carries no figure at all, and this rule has nothing to
    // say about it: whether those words are true is a question of
    // meaning, which is step 4's judge with the records in front of it.
    // Refusing it here deletes a true claim, which is the one error
    // class this whole initiative exists to drive to zero.
    const figures = figuresInValue(claim.value);
    if (figures.length) {
      const matchesAll = (r: FactRecord) => figures.every((f) => sameFigure(r.value, f) || figureInText(r, f));
      const match = cited.find(matchesAll);
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
    } else if (claim.value !== null && claim.value !== undefined && claim.value !== "" && cited.every((r) => r.value === null)) {
      // KEPT FOR A VALUE THAT IS NOT A FIGURE TOO. Narrowing the rule
      // above to figures must not quietly drop this: a claim that
      // asserts anything at all, citing only records we have looked for
      // and not found, is citing an absence.
      rejected.push({ claim, rule: "figure_mismatch", reason: "the record it cites has no value — we looked and there is no answer" });
      continue;
    }

    approved.push(claim);
  }

  return { approved, rejected, questions: dedupe(questions) };
}

/**
 * The claim, with its type taken from the record when the model's label
 * cannot be right.
 *
 * ONLY EVER FROM AN UNLICENSABLE LABEL TO A LICENSABLE ONE, and only
 * when the figure matches. It never goes the other way: a claim the
 * model called a price is not re-typed into a benefit, because a model
 * that under-claims is not the failure being fixed.
 */
function retypeFromRecord(claim: SelectedClaim, records: FactRecord[]): SelectedClaim {
  if (!RETYPABLE.includes(claim.claimType)) return claim;
  if (claim.value === null || claim.value === undefined || claim.value === "") return claim;
  for (const id of claim.factIds) {
    const record = records.find((r) => r.id === id);
    if (!record || !sameFigure(record.value, claim.value)) continue;
    const fromKey = typeFromKey(record.key);
    if (!fromKey || UNLICENSABLE_TYPES.includes(fromKey)) continue;
    return { ...claim, claimType: fromKey };
  }
  return claim;
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

/**
 * The catalogue, read back out of the records.
 *
 * Callers already hold the records and should not have to pass the
 * products twice. A `product.<slug>.name` record carries the name;
 * everything else contributes its slug, so a product with no name
 * record is still recognised.
 */
function productsFromRecords(records: FactRecord[]): { name: string }[] {
  const names = new Map<string, string>();
  for (const r of records) {
    const scope = scopeOfKey(r.key);
    if (scope.kind !== "product") continue;
    const existing = names.get(scope.product);
    // The name record's value is the real name; a slug is the fallback.
    if (r.key.endsWith(".name") && typeof r.value === "string") names.set(scope.product, r.value);
    else if (!existing) names.set(scope.product, scope.product.replace(/_/g, " "));
  }
  return [...names.values()].map((name) => ({ name }));
}
