// A fact, and where it came from.
//
// PLAN-FACT-BOUND-GENERATION §2. The whole pivot rests on this type:
// instead of enumerating what may not be said, a factual sentence must
// point at the record that makes it sayable.
//
// WHAT THIS REPLACES. Today `knownText()` concatenates the site's
// headings, product descriptions, offer labels, owner-entered rows and
// brand pillars into ONE undifferentiated blob, and `said(phrase)` asks
// whether a phrase appears anywhere in it. So a sentence the owner
// typed, a catalogue row and a line Hawlai wrote on their own website
// are all equally "proof" — and on 2026-10-11 that cost a whole
// afternoon of wrong diagnosis.
//
// NOTHING IS WIRED TO THIS YET. Step 1 is the type and the extractor,
// deliberately with no generation change: it can be read and checked in
// isolation before anything depends on it.

/** Where a fact came from. Hawlai-generated page text is not on this list, on purpose. */
export type FactSource =
  | "catalogue"            // the products table
  | "offers"               // the discount codes checkout honours
  | "shipping_config"      // the store's shipping settings, via computeShippingAmount
  | "measured"             // page_events, orders, leads
  | "owner_stated"         // a business_knowledge row
  | "site_owner_written"   // page props ownerWritten() keeps
  | "site_schema_org"      // JSON-LD the business publishes
  | "derived";             // computed in code from other records

/**
 * How sure we are, reusing the vocabulary already in
 * src/lib/signals/signals.ts rather than inventing a second scale.
 *
 * counted  = our own rows, arithmetic
 * observed = someone stated it; we are quoting, not measuring
 * inferred = a reading of a sentence, which may be wrong
 */
export type Confidence = "counted" | "observed" | "inferred";

/**
 * What a sentence citing this record is allowed to assert.
 *
 * `benefit` and `safety` are in the union and NO SOURCE GRANTS THEM.
 * That is deliberate and it is the mechanism that replaces a regex for
 * "sleep better" and "safe for babies": those need a test or a study,
 * there is no source for one, so they are refused by the ABSENCE OF A
 * LICENCE rather than by a pattern someone has to think of first.
 */
export type FactLicence = "value" | "existence" | "policy" | "process" | "benefit" | "safety";

export type FactRecord = {
  /** Opaque, stable across runs, scoped to one business. */
  id: string;
  /** The business this belongs to. Checked on every citation. */
  dealershipId: string;
  /** "material.paraffin", "process.cure_hours", or "statement.<n>" for an unparsed assertion. */
  key: string;
  /** null means KNOWN-UNKNOWN: we looked and there is no answer. Not the same as absent. */
  value: string | number | boolean | null;
  unit?: "hours" | "minutes" | "days" | "weeks" | "inr" | "percent" | "celsius" | null;
  source: FactSource;
  /** table+id, page slug + block, or URL. Enough to find it again. */
  sourceRef: string;
  confidence: Confidence;
  licenses: FactLicence[];
  /** The exact words this came from, so a note can quote them back. */
  recordedText: string;
  observedAt: string;
  expiresAt?: string | null;
};

/**
 * What each source may license.
 *
 * owner_stated gets existence, policy and process — the owner may say
 * what their product is, what they will and will not do, and how they
 * make it. It does NOT get `value`: a number the owner typed in prose
 * is not the catalogue, and a price must come from the row checkout
 * reads. And it never gets benefit or safety.
 */
const LICENCES: Record<FactSource, FactLicence[]> = {
  catalogue: ["value", "existence"],
  // ADDED 2026-10-15 with getContext. A discount code is a row
  // checkout honours, so its percentage is as countable as a price —
  // and the baseline's dairy-04 case is exactly why it needs to be a
  // record rather than prose: the owner asked for "our 20% diwali
  // discount" when the real code gives 10%. A conflict can only be
  // reported against a value that exists.
  offers: ["value", "existence"],
  shipping_config: ["policy", "value"],
  measured: ["value"],
  owner_stated: ["existence", "policy", "process"],
  site_owner_written: ["existence", "policy", "process"],
  site_schema_org: ["value", "existence"],
  derived: ["value"],
};

export function licensesFor(source: FactSource): FactLicence[] {
  return [...LICENCES[source]];
}

/** True when no source in the system can license this kind of claim. */
export function isUnlicensable(licence: FactLicence): boolean {
  return !Object.values(LICENCES).some((list) => list.includes(licence));
}

/**
 * A stable id.
 *
 * MUST be deterministic: a citation written in one run has to resolve
 * in the next, or every regenerated draft loses its evidence. So it is
 * a hash of what the fact IS, not a random uuid and not a row counter —
 * re-extracting the same sentence from the same row yields the same id,
 * and editing that sentence yields a different one, which is correct:
 * an edited sentence is a different fact and should not inherit a
 * citation.
 *
 * Short on purpose. These go in a prompt, and every character is paid
 * for; 8 hex characters over one tenant's facts is not a collision risk
 * worth tokens. Collisions are checked for at extraction time anyway
 * (see `assertUniqueIds`).
 */
export function factId(dealershipId: string, sourceRef: string, sentence: string): string {
  const basis = `${dealershipId}|${sourceRef}|${sentence.trim().toLowerCase().replace(/\s+/g, " ")}`;
  // FNV-1a, 32-bit. Not a security hash and nothing here needs one —
  // it needs to be stable, fast and dependency-free.
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i += 1) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `f_${h.toString(16).padStart(8, "0")}`;
}

/**
 * Every id in a set is unique.
 *
 * Called by the extractor. A collision would mean two different facts
 * share a citation, so one of them could license the other — exactly
 * the kind of quiet wrongness this whole design exists to remove. It is
 * a throw and not a filter: a collision is a bug in the id scheme, not
 * data to work around.
 */
export function assertUniqueIds(records: FactRecord[]): void {
  const seen = new Map<string, string>();
  for (const r of records) {
    const prior = seen.get(r.id);
    if (prior && prior !== r.recordedText) {
      throw new Error(`fact id collision on ${r.id}: "${prior}" and "${r.recordedText}"`);
    }
    seen.set(r.id, r.recordedText);
  }
}

/** The record a citation resolves to, or null — tenant checked, never skipped. */
export function resolveFactId(
  records: FactRecord[],
  dealershipId: string,
  id: string
): FactRecord | null {
  const hit = records.find((r) => r.id === id);
  if (!hit) return null;
  // A citation resolving across tenants is not a bad citation, it is a
  // leak. The caller fails the whole draft on null; this returns null
  // rather than the record so there is no path that uses it.
  if (hit.dealershipId !== dealershipId) return null;
  return hit;
}
