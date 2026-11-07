// The promises a page can make that a business may not actually keep.
//
// MOVED HERE, NOT WRITTEN HERE (I2 of docs/PLAN-AUTO-INTERVIEW.md).
// This list has lived in siteClaimsReview.ts since the claims review was
// built, and its reasoning is that file's, unchanged:
//
//   A NAMED LIST, not general detection. Working out from prose whether
//   a business does bulk orders is not something a pattern can do; what
//   it can do is notice the specific promises that turn into an email
//   from a customer expecting something — and check whether anything in
//   the catalogue or the owner's own words mentions it.
//
// WHY IT MOVED. The onboarding interview asks the owner, one by one,
// whether he makes each of these promises, so that a "yes" is on record
// before a page says it and a "no" is on record so the guard can refuse
// it. Asking about a DIFFERENT nine than the nine the review watches for
// would be worse than not asking: the interview would collect answers
// nobody checks and the review would keep flagging promises nobody was
// asked about.
//
// So there is one list. The claims review imports it, the interview
// imports it, and a question appears for every pattern automatically —
// add a tenth promise here and the interview asks about it.
//
// PURE ON PURPOSE, and the same reason lib/pages/provenance.ts gives for
// its own list: the interview's question registry is read by a client
// component, and siteClaimsReview.ts pulls in the whole facts layer.
// Nothing is imported here, so one definition costs no bundle.
//
// INDUSTRY-NEUTRAL, and CLAUDE.md rule 3 applies: every one of these is
// a promise about how a business trades, not about what it sells. A
// candle shop, a sweet shop and a coaching centre can each make or
// refuse all nine.

export type OfferPromise = {
  /** What the review looks for in published copy. */
  pattern: RegExp;
  /** What it is called, in the owner's own terms. */
  name: string;
  /** A stable key for the interview's question and its "asked once" record. */
  key: string;
};

export const OFFER_PROMISES: OfferPromise[] = [
  { key: "gift_sets", pattern: /\bgift\s*(?:set|sets|hamper|hampers|box|boxes)\b/i, name: "gift sets" },
  { key: "bulk_orders", pattern: /\b(?:bulk|wholesale|corporate)\s*(?:order|orders|enquir|pricing|gifting)/i, name: "bulk or corporate orders" },
  { key: "restock_alerts", pattern: /\brestock\s*(?:alert|alerts|notification)/i, name: "restock alerts" },
  { key: "custom_orders", pattern: /\b(?:custom|personalis|personaliz|bespoke)\w*\s*(?:order|orders|set|sets|gift|gifts|label|labels)/i, name: "custom orders" },
  { key: "subscription", pattern: /\bsubscription\b|\bmonthly\s*box\b/i, name: "a subscription" },
  { key: "wedding_orders", pattern: /\bwedding\s*(?:favour|favor|favours|favors|gift|gifts)\b/i, name: "wedding favours" },
  { key: "gift_wrapping", pattern: /\bgift\s*wrap\w*\b/i, name: "gift wrapping" },
  { key: "samples", pattern: /\bsample\s*(?:pack|packs|set|sets)\b|\bfree\s*sample/i, name: "samples" },
  { key: "workshops", pattern: /\bworkshop\b|\bclass\b/i, name: "workshops" },
];
