// C1 — ONE READ, AND EVERYTHING CITABLE HAS AN ID.
//
// docs/PLAN-CORE-ARCHITECTURE.md §2 (C1), founder's decision of
// 2026-10-15: the spine is `gatherBusinessFacts`, and this is a thin
// task-slicing wrapper over it. NOT a second reader. The claims guard
// already checks copy against gatherBusinessFacts, so a context built
// from anything else would leave the writer and the guard reading
// different truths — which is D1 again, one layer up.
//
// WHAT THIS ADDS to the flat BusinessFacts shape:
//
//   ids          a factual sentence can point at the record that makes
//                it sayable, instead of a guard asking afterwards
//                whether some phrase appears in a blob of text
//   provenance   source, confidence and licence per record, so "the
//                owner typed this" and "checkout computed this" stop
//                being the same kind of proof
//   a slice      only what this task needs
//
// WHAT IT DOES NOT DO. It does not change generation; nothing calls it
// yet. It does not replace `facts`, which is carried through unchanged
// because the whole claim layer takes that shape. And it holds no link
// records: a URL is not a claim, the generators get links from `facts`,
// and `repairBookingLinks` already owns them.

import { gatherBusinessFactsSafely, type BusinessFacts, type CatalogProduct } from "@/lib/claims/businessFacts";
import { extractFromKnowledge } from "@/lib/facts/extract";
import { assertUniqueIds, factId, licensesFor, type FactRecord } from "@/lib/facts/factRecord";

/** What the copy is for. Each maps to a real surface. */
export type TaskKind = "email" | "social_post" | "whatsapp" | "lead_message" | "page_text" | "other";

export type Task = {
  kind: TaskKind;
  /** What the owner typed. Used to narrow the slice — see productsForTopic. */
  topic: string;
};

export type Context = {
  dealershipId: string;
  task: Task;
  /** Everything a factual sentence may cite, each with an id. */
  records: FactRecord[];
  /**
   * The flat shape the claim layer reads. Null when the records could
   * not be read at all, which is NOT the same as a business with no
   * facts — see `unknowns`.
   */
  facts: BusinessFacts | null;
  /**
   * Looked for, and there is no answer. One owner question, never a
   * guess. Carries `facts.unreadable` plus anything this slice found
   * missing.
   */
  unknowns: string[];
  /** Which products the slice kept, and why — for the owner-facing note. */
  slice: { products: string[]; narrowedByTopic: boolean };
};

/** A key-safe form of a product name: "Lavender candle" -> "lavender_candle". */
export function productKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * The products this task is about.
 *
 * NARROWING IS THE POINT, and it comes from a graded failure rather
 * than from tidiness. candle-03 in the baseline run produced "Dono
 * Rs 850 se shuru hoti hain" — both candles start at Rs 850 — when the
 * Lavender is Rs 999 and the Rose is Rs 850. The model had both prices
 * in front of it for a post about how the candles are made, and merged
 * them. A task that names one product gets one product's numbers.
 *
 * Falls back to the whole catalogue when the topic names none, because
 * a welcome email legitimately covers the range, and an empty slice
 * would be worse than a wide one: it would make the model invent.
 */
export function productsForTopic(topic: string, products: CatalogProduct[]): { kept: CatalogProduct[]; narrowed: boolean } {
  const haystack = String(topic ?? "").toLowerCase();
  if (!haystack.trim()) return { kept: products, narrowed: false };

  const nameOf = (p: CatalogProduct) => String(p.name ?? "").toLowerCase().trim();
  const wordsOf = (name: string) => name.split(/\s+/).filter((w) => w.length > 3);

  // A WORD IS DISTINCTIVE ONLY WITHIN THIS CATALOGUE, and that is not a
  // detail. "Lavender candle" and "Rose candle" share "candle", which
  // is long enough to look distinctive and useless as a selector: a
  // topic saying "candle" matched both, so the first version of this
  // narrowed nothing. Worse, in a catalogue of five candles it would
  // have "narrowed" to all five while reporting that it had narrowed.
  const seen = new Map<string, number>();
  for (const p of products) for (const w of new Set(wordsOf(nameOf(p)))) seen.set(w, (seen.get(w) ?? 0) + 1);

  const named = products.filter((p) => {
    const name = nameOf(p);
    if (name.length < 3) return false;
    // The whole name in the topic is unambiguous whatever it shares.
    if (haystack.includes(name)) return true;
    return wordsOf(name)
      .filter((w) => seen.get(w) === 1)
      .some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(haystack));
  });
  return named.length && named.length < products.length
    ? { kept: named, narrowed: true }
    : { kept: products, narrowed: false };
}

/** Catalogue rows -> records. Prices and durations are what checkout and the booking page read. */
function catalogueRecords(dealershipId: string, products: CatalogProduct[], observedAt: string): FactRecord[] {
  const out: FactRecord[] = [];
  for (const p of products) {
    const key = productKey(p.name);
    if (!key) continue;
    const ref = `products:${p.id ?? key}`;
    // THE NAME IS A RECORD, because facts hide inside it. The S1 exit
    // run refused "a 500 ml jar" — true, and checked against the price
    // figures, because 500ml exists nowhere except in the product name
    // "Desi ghee 500ml". A size, a weight, a count in a pack: the owner
    // typed them into the name and nothing else holds them.
    const name = String(p.name ?? "").trim();
    if (name) {
      out.push({
        id: factId(dealershipId, `${ref}#name`, name),
        dealershipId,
        key: `product.${key}.name`,
        value: name,
        source: "catalogue",
        sourceRef: ref,
        confidence: "counted",
        licenses: licensesFor("catalogue"),
        recordedText: name,
        observedAt,
      });
    }
    // THE DESCRIPTION IS PRODUCT-SCOPED EVIDENCE, and the scope rule of
    // 2026-10-16 is why it has to be a record.
    //
    // The founder's rule: a claim about one named product needs a record
    // about THAT product, never a business-level statement, however true
    // the statement is. "We do not use ammonia-based products" does not
    // establish "this treatment contains no ammonia" — only a record
    // about the treatment does.
    //
    // Applied with nothing but business-level rows, that rule would also
    // refuse "the lavender candle is soy wax", which is true and
    // recorded. The catalogue's own description — "Soy wax, 40 hour
    // burn", written against the Lavender candle — is exactly the
    // product-level evidence the rule asks for, and it was sitting
    // unused in a column.
    const description = String(p.description ?? "").trim();
    if (description) {
      out.push({
        id: factId(dealershipId, `${ref}#description`, description),
        dealershipId,
        key: `product.${key}.description`,
        value: description,
        source: "catalogue",
        sourceRef: ref,
        confidence: "observed",
        licenses: licensesFor("catalogue"),
        recordedText: `${name || key}: ${description}`,
        observedAt,
      });
    }
    const price = Number(p.price);
    if (Number.isFinite(price) && price > 0) {
      out.push({
        id: factId(dealershipId, `${ref}#price`, String(price)),
        dealershipId,
        key: `product.${key}.price`,
        value: price,
        unit: "inr",
        source: "catalogue",
        sourceRef: ref,
        confidence: "counted",
        licenses: licensesFor("catalogue"),
        recordedText: `${p.name} — ₹${price}`,
        observedAt,
      });
    }
    if (p.durationMinutes != null && Number.isFinite(Number(p.durationMinutes))) {
      out.push({
        id: factId(dealershipId, `${ref}#duration`, String(p.durationMinutes)),
        dealershipId,
        key: `product.${key}.duration_minutes`,
        value: Number(p.durationMinutes),
        unit: "minutes",
        source: "catalogue",
        sourceRef: ref,
        confidence: "counted",
        licenses: licensesFor("catalogue"),
        recordedText: `${p.name} — ${p.durationMinutes} minutes`,
        observedAt,
      });
    }
  }
  return out;
}

/**
 * Shipping, from the store's own settings.
 *
 * A KNOWN-UNKNOWN IS A RECORD TOO. A business with no shipping
 * configured gets `shipping.mode = null`, which is what lets a verifier
 * say "nothing on record says anything ships" instead of saying nothing
 * at all. The salon case: a service business that ships nothing, where
 * the owner's own prompt asked for "free shipping on treatments".
 */
function shippingRecords(dealershipId: string, f: BusinessFacts, observedAt: string): FactRecord[] {
  const ref = "shipping_config";
  const base = {
    dealershipId,
    source: "shipping_config" as const,
    sourceRef: ref,
    confidence: "counted" as const,
    licenses: licensesFor("shipping_config"),
    observedAt,
  };
  if (!f.shipping) {
    return [
      {
        ...base,
        id: factId(dealershipId, `${ref}#mode`, "none"),
        key: "shipping.mode",
        value: null,
        recordedText: "nothing is shipped",
      },
    ];
  }
  const out: FactRecord[] = [
    {
      ...base,
      id: factId(dealershipId, `${ref}#mode`, String(f.shipping.mode)),
      key: "shipping.mode",
      value: String(f.shipping.mode),
      recordedText: `shipping is ${f.shipping.mode}`,
    },
  ];
  if (f.shipping.rate != null) {
    out.push({
      ...base,
      id: factId(dealershipId, `${ref}#rate`, String(f.shipping.rate)),
      key: "shipping.rate",
      value: Number(f.shipping.rate),
      unit: "inr",
      recordedText: `shipping is ₹${f.shipping.rate}`,
    });
  }
  if (f.shipping.freeThreshold != null) {
    out.push({
      ...base,
      id: factId(dealershipId, `${ref}#free_above`, String(f.shipping.freeThreshold)),
      key: "shipping.free_above",
      value: Number(f.shipping.freeThreshold),
      unit: "inr",
      recordedText: `free shipping above ₹${f.shipping.freeThreshold}`,
    });
  }
  return out;
}

/** Discount codes, from the rows checkout honours. */
function offerRecords(dealershipId: string, f: BusinessFacts, observedAt: string): FactRecord[] {
  const out: FactRecord[] = [];
  for (const o of f.offers ?? []) {
    const code = String(o.code ?? "").trim();
    if (!code) continue;
    const ref = `offers:${code}`;
    if (o.percent != null) {
      out.push({
        id: factId(dealershipId, `${ref}#percent`, String(o.percent)),
        dealershipId,
        key: `offer.${code.toLowerCase()}.percent`,
        value: Number(o.percent),
        unit: "percent",
        source: "offers",
        sourceRef: ref,
        confidence: "counted",
        licenses: licensesFor("offers"),
        recordedText: `${code} — ${o.percent}% off`,
        observedAt,
      });
    }
    if (o.flat != null) {
      out.push({
        id: factId(dealershipId, `${ref}#flat`, String(o.flat)),
        dealershipId,
        key: `offer.${code.toLowerCase()}.flat`,
        value: Number(o.flat),
        unit: "inr",
        source: "offers",
        sourceRef: ref,
        confidence: "counted",
        licenses: licensesFor("offers"),
        recordedText: `${code} — ₹${o.flat} off`,
        observedAt,
      });
    }
  }
  return out;
}

/**
 * Where the business is, when the owner has said.
 *
 * A RECORD BECAUSE THE ABSENCE HAS TO BE CHECKABLE. "Indore" survived
 * three times in the run of 19 October while no location existed
 * anywhere in the context — the model reached for a generic Indian city
 * from its own prior. With the city as a record, a true location claim
 * can cite it and a false one has nothing to cite, which is C1's
 * "unknown is explicit" rule applied to a field that was being read
 * off `facts` by nobody.
 */
function placeRecords(dealershipId: string, f: BusinessFacts, observedAt: string): FactRecord[] {
  const city = String(f.city ?? "").trim();
  if (!city) return [];
  return [
    {
      id: factId(dealershipId, "business#city", city),
      dealershipId,
      key: "business.city",
      value: city,
      source: "owner_stated",
      sourceRef: "dealerships.city",
      confidence: "observed",
      licenses: licensesFor("owner_stated"),
      recordedText: `the business is in ${city}`,
      observedAt,
    },
  ];
}

/** Counts from our own rows. The answer to "500 happy customers". */
function measuredRecords(dealershipId: string, f: BusinessFacts, observedAt: string): FactRecord[] {
  const mk = (key: string, value: number, text: string): FactRecord => ({
    id: factId(dealershipId, `measured#${key}`, String(value)),
    dealershipId,
    key,
    value,
    source: "measured",
    sourceRef: "orders,leads",
    confidence: "counted",
    licenses: licensesFor("measured"),
    recordedText: text,
    observedAt,
  });
  return [
    mk("business.paid_orders", Number(f.allTime?.paidOrders ?? 0), `${f.allTime?.paidOrders ?? 0} paid order(s) on record`),
    mk("business.leads", Number(f.allTime?.leads ?? 0), `${f.allTime?.leads ?? 0} lead(s) on record`),
  ];
}

/**
 * One read, one slice, everything with an id.
 *
 * Fails CLOSED and says so: when the records cannot be read, `facts` is
 * null, `records` is empty and `unknowns` says what is missing. It never
 * returns a half-built context that reads as "this business has no
 * products" — F-01, the mistake that turned the whole claim layer off on
 * a transient read error.
 */
export async function getContext(supabase: any, dealershipId: string, task: Task): Promise<Context> {
  return contextFromFacts(dealershipId, await gatherBusinessFactsSafely(supabase, dealershipId), task);
}

/**
 * The same context, from facts already in hand.
 *
 * THE DOOR ALREADY HAS THE FACTS. Every generator is handed a
 * BusinessFacts by its surface, so a door that called getContext would
 * read the whole fact set a second time on every piece of copy — twice
 * the queries for the same answer, and two answers that can disagree if
 * a row changes in between. So the read and the shaping are separate
 * functions, and the door uses this one.
 */
export function contextFromFacts(dealershipId: string, facts: BusinessFacts | null | undefined, task: Task): Context {
  const observedAt = new Date().toISOString();

  if (!facts) {
    return {
      dealershipId,
      task,
      records: [],
      facts: null,
      unknowns: ["everything — the business's records could not be read just now"],
      slice: { products: [], narrowedByTopic: false },
    };
  }

  const active = (facts.products ?? []).filter((p) => p.active !== false);
  const { kept, narrowed } = productsForTopic(task.topic, active);

  const records = [
    ...catalogueRecords(dealershipId, kept, observedAt),
    ...shippingRecords(dealershipId, facts, observedAt),
    ...offerRecords(dealershipId, facts, observedAt),
    ...measuredRecords(dealershipId, facts, observedAt),
    ...placeRecords(dealershipId, facts, observedAt),
    // The owner's own rows, already typed by the extractor built in
    // step 1. It takes rows it is handed and reads no database itself.
    ...extractFromKnowledge(dealershipId, (facts.ownerFacts ?? []).map((k, i) => ({
      id: `knowledge_${i}`,
      category: k.category,
      title: k.title,
      content: k.content,
    }))).records,
  ];

  // A DUPLICATE ID WOULD MAKE A CITATION AMBIGUOUS, which is the one
  // thing the whole scheme cannot tolerate: two records, one id, and a
  // sentence that cites it means either.
  assertUniqueIds(records);

  const unknowns = [...(facts.unreadable ?? [])];
  if (!active.length) unknowns.push("the product catalogue is empty — no price, duration or product name is on record");
  if (!facts.shipping) unknowns.push("no shipping is configured — nothing on record says anything ships");

  return {
    dealershipId,
    task,
    records,
    facts,
    unknowns,
    slice: { products: kept.map((p) => String(p.name)), narrowedByTopic: narrowed },
  };
}
