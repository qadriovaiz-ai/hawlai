// Checking generated marketing copy against what the business can back up.
//
// Deterministic and cheap: pattern-matched, no second AI call, so it can
// sit on every generation. It looks for the claim types an AI invents
// and a small business would be held to — customer counts, ratings,
// offers and prices that aren't in the store, rankings and superlatives,
// guarantees, fake urgency, health/efficacy claims and promised results
// — and allows any of them the business ITSELF already makes (on its
// site, in its catalogue, in Business Knowledge). The owner is
// accountable for their own claims; the point is that Hawlai never
// invents one on their behalf.
//
// Low-friction by design: offending SENTENCES are removed and the owner
// is told what and why. Nothing is blocked outright, and ordinary
// persuasive copy passes untouched.
//
// Two modes (approved 2026-09-17, industry-agnostic overhaul Phase 2):
//  - "publish" (the default) — for anything that goes out with nobody
//    reading it first: every unverifiable claim is removed.
//  - "draft" — for copy the owner reviews before using it: a PRICE that
//    can't be matched to the catalogue, site or Business Knowledge is
//    kept and flagged instead, because service and quote-based businesses
//    often have real prices Hawlai has no record of. Every other kind of
//    claim is still removed.

import { describeShipping, knownText, normalise, physicalProducts, serviceItems, type BusinessFacts } from "./businessFacts";
import { computeShippingAmount } from "@/lib/shipping";

const NOUNS = "homes|customers|families|buyers|people|clients|orders|reviews|ratings|shoppers|users|households|students|patients|members|subscribers";
const SOCIAL_PROOF = new RegExp(
  `(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k|lakhs?|lacs?)?\\s*\\+?\\s*(?:happy\\s+|satisfied\\s+|loyal\\s+|delighted\\s+|verified\\s+|5[- ]star\\s+)?(${NOUNS})\\b`,
  "gi"
);
const VAGUE_CROWD = new RegExp(`\\b(hundreds|thousands|lakhs|millions)\\s+of\\s+(?:happy\\s+|satisfied\\s+|loyal\\s+)?(?:${NOUNS})\\b`, "gi");
const UNITS_SOLD = /(\d[\d,]*)\s*(k|lakhs?)?\s*\+?\s*(?:[a-z-]+\s+){0,2}sold\b/gi;
const RATINGS = /\b\d(?:\.\d)?\s*[- ]?(?:\/\s*5\b|stars?\b|★)|\brated\s+\d/i;
const YEARS = /\b(\d+)\s*\+?\s*years?\s+(?:of|in|experience|serving|trusted)/i;
const PACKAGING = /(keepsake|gift)\s*(box|boxes|packaging|wrap|wrapping|bag|tin)/gi;
const PERCENT_OFF = /(\d{1,3})\s*%\s*off/gi;
const FLAT_OFF = /(?:₹|\brs\.?|\binr)\s?(\d[\d,]*)\s*off/gi;
// Any rupee amount, however it's written: ₹1,499 · Rs. 500 · INR 2,000 ·
// ₹1.5 lakh · 999/- · 500 rupees. Amounts followed by "off" are discounts,
// checked separately above.
const MONEY_UNIT = "(k|lakhs?|lacs?|l|crores?|cr)?\\b";
const PRICE = new RegExp(
  // (?![\d,]) keeps the number whole, so "₹2,000 off" can't backtrack
  // into a price of "₹2".
  `(?:₹|\\brs\\.?|\\binr)\\s?(\\d[\\d,]*(?:\\.\\d{1,2})?)(?![\\d,])\\s*${MONEY_UNIT}(?!\\s*off\\b)|\\b(\\d[\\d,]*(?:\\.\\d{1,2})?)(?![\\d,])\\s*(?:\\/-|rupees\\b)`,
  "gi"
);

// Product-attribute claims a business must be able to substantiate.
const CLAIM_TERMS = [
  "phthalate free", "paraben free", "sulphate free", "sulfate free", "all natural", "100% natural", "vegan", "cruelty free", "organic",
  "non toxic", "chemical free", "toxin free", "clean burning", "soot free", "eco friendly", "award winning", "warranty", "certified", "handcrafted in",
];

// Every way copy says shipping costs nothing — English and Hinglish.
const FREE_SHIPPING =
  /\bfree\s+(?:home\s+|doorstep\s+)?(?:shipping|delivery)\b|\b(?:shipping|delivery)\s+(?:is\s+|bilkul\s+|ekdum\s+)?(?:free|muft)\b|\bno\s+(?:shipping|delivery)\s+(?:charges?|fees?|cost)\b|\b(?:zero|₹\s?0)\s+(?:shipping|delivery)\b|\bships?\s+free\b/i;

const RANKING = /(?<![\w#])(?:no\.?\s?1|number\s?one|#\s?1)(?![\w])/gi;
const PLACE = "india|the\\s+world|the\\s+country|the\\s+city|town|the\\s+market|the\\s+region|the\\s+state";
const SUPERLATIVE_WORDS = "best|finest|top[- ]rated|most\\s+trusted|most\\s+loved|most\\s+popular|leading|largest|biggest|favou?rite|number\\s+one|no\\.?\\s?1";
const POSSESSIVE_SUPERLATIVE = new RegExp(`\\b(?:india|the\\s+world|the\\s+city|the\\s+country)['’]s\\s+(?:${SUPERLATIVE_WORDS}|top)\\b`, "gi");
const BEST_SELLING = /\b(?:best[- ]?sell(?:ing|ers?)|top[- ]?sell(?:ing|ers?)|fastest[- ]selling|most[- ]ordered)\b/gi;
const SCARCITY = /\b(?:selling\s+(?:out\s+)?fast|almost\s+(?:sold\s+out|gone)|only\s+\d+\s+(?:left|pieces?\s+left|in\s+stock)|limited\s+stock|(?:just\s+)?a\s+few\s+left|while\s+stocks?\s+lasts?)\b/gi;

// The same urgency, about a service: "Slots limited", "only 3 seats left",
// "slots bhar rahe hain".
//
// THE LIVE CASE (2026-09-21): a workshop caption ended "₹800 · Slots
// limited · Book karo". Nothing on record says how many slots a workshop
// has — a service carries no stock count, deliberately (migration 188:
// services are booked, never counted). The stock patterns above all talk
// about pieces and shelves, so every one of these went straight through.
// Told to a customer, it is an invented reason to hurry.
const SEATS = "slots?|seats?|spots?|places?|batch(?:es)?";
const SLOT_SCARCITY = new RegExp(
  "\\b(?:" +
    // only 3 slots left / sirf 2 seats bache hain
    `(?:only|just|sirf|bas)\\s+\\d+\\s+(?:${SEATS})(?:\\s+(?:left|remaining|available|bache(?:\\s+hain)?|baaki(?:\\s+hain)?|reh\\s+gaye))?` +
    // slots limited / seats filling fast / slots bhar rahe hain
    `|(?:${SEATS}|booking)s?\\s+(?:are\\s+|is\\s+)?(?:limited|limited\\s+hain|filling\\s+(?:up\\s+)?fast|almost\\s+full|nearly\\s+full|bhar\\s+rahe\\s+hain|bhar\\s+rahi\\s+hain|khatam\\s+ho\\s+rahe\\s+hain)` +
    // limited slots / limited seats
    `|limited\\s+(?:${SEATS})` +
    // a few slots left / last few seats
    `|(?:a\\s+)?few\\s+(?:${SEATS})\\s+(?:left|remaining)|last\\s+(?:few\\s+)?(?:${SEATS})` +
    ")\\b",
  "gi"
);
const COMPARATIVE =
  /\b(?:better|cheaper|stronger|safer|longer[- ]lasting|more\s+affordable)\s+than\s+(?!ever\b|before\b|yesterday\b|last\b|you\s+think\b)[\w'-]+|\bunlike\s+(?:other|most|any)\s+(?:brands?|stores?|shops?|sellers?|competitors?|companies)\b|\b(?:cheapest|lowest\s+prices?)\b/gi;
const GUARANTEE = /\b(?:guarantee[ds]?|money[- ]back|risk[- ]free|100\s*%\s*(?:satisfaction|safe|effective|pure|genuine|results?))\b/gi;
const HEALTH =
  /\b(?:cures?|heals?|treats?)\s+(?:your\s+)?(?:acne|diabetes|cancer|pain|anxiety|depression|insomnia|hair\s*fall|infections?|diseases?|arthritis|asthma|pcos|thyroid|blood\s+pressure|migraines?|headaches?|colds?|coughs?)\b|\ba\s+cure\s+for\b|\b(?:clinically|scientifically|medically|dermatologically)\s+(?:proven|tested|approved)\b|\b(?:doctor|dermatologist|dentist)[- ](?:recommended|approved|tested)\b|\brelieves?\s+(?:stress|anxiety|pain|insomnia|depression|headaches?|migraines?)\b|\b(?:boosts?|strengthens?)\s+(?:your\s+)?immunity\b|\b(?:lose|losing)\s+\d+\s*(?:kg|kgs|kilos?)\b|\bweight\s+loss\b|\bfda[- ]approved\b/gi;
const RESULTS =
  /\b\d+(?:\.\d+)?\s*(?:%|x|times)\s+(?:more|faster|better|higher|increase|growth|results|roi|returns|profits?|sales|leads|customers)\b|\b(?:double|triple)\s+your\b|\bguaranteed\s+(?:selection|placement|results?|returns?|admission)\b|\b100\s*%\s+(?:placement|selection)\b/gi;

const CROWD_MIN: Record<string, number> = { hundreds: 200, thousands: 2000, lakhs: 200000, millions: 2000000 };

function amount(raw: string, unit?: string): number {
  const n = Number(raw.replace(/,/g, ""));
  const u = (unit ?? "").toLowerCase();
  if (u === "k") return n * 1e3;
  if (u === "l" || u.startsWith("lakh") || u.startsWith("lac")) return n * 1e5;
  if (u === "cr" || u.startsWith("crore")) return n * 1e7;
  return n;
}

/** Every rupee amount written in a piece of text. */
export function moneyAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(PRICE)) out.push(amount(m[1] ?? m[3], m[2]));
  return out.filter((n) => Number.isFinite(n));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Prices the business really charges or offers — what a "₹X" in copy must be one of. */
function realAmounts(f: BusinessFacts): Set<number> {
  const out = new Set<number>();
  for (const p of f.products) {
    out.add(p.price);
    for (const o of f.offers) {
      if (o.percent !== null) out.add(Math.round(p.price * (1 - o.percent / 100)));
      if (o.flat !== null) out.add(p.price - o.flat);
    }
  }
  for (const o of f.offers) if (o.flat !== null) out.add(o.flat);
  if (f.shipping?.rate != null) out.add(f.shipping.rate);
  if (f.shipping?.freeThreshold != null) out.add(f.shipping.freeThreshold);
  // Prices the business states itself — on its site, in its descriptions,
  // in Business Knowledge ("Consultation fee ₹500").
  for (const n of moneyAmounts(knownText(f))) out.add(n);
  return out;
}

/** Same amount to the paisa — "₹549" and "₹549.00" are one price. */
function isRealAmount(amounts: Set<number>, v: number): boolean {
  for (const a of amounts) if (Math.abs(a - v) < 0.005) return true;
  return false;
}

export type ClaimsMode = "publish" | "draft";
type Problem = { reason: string; kind: "price" | "claim" };

// A link: with a scheme, starting www., or a bare domain on a common TLD.
// Never the domain half of an email address — "someone@gmail.com" is an
// address, not a link to gmail.com.
const LINK = /(?<![@\w.-])(?:https?:\/\/[^\s<>"'()\]]+|www\.[^\s<>"'()\]]+|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|in|co\.in|net|org|shop|store|online|io|co|app)(?![a-z0-9-])(?:\/[^\s<>"'()\]]*)?)/gi;

function hostOf(link: string): string {
  const withScheme = /^https?:\/\//i.test(link) ? link : `https://${link}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return link.toLowerCase().replace(/^www\./, "").split("/")[0];
  }
}

/**
 * Links in `text` that don't go to this business's own website.
 *
 * THE LIVE CASE: a promo email's button pointed to
 * "candlebyqaaf.com/products/lavender-candle". That domain does not exist;
 * the real store is hawlai.online/site/candle-by-qaaf. A broken link in
 * copy sent to a customer is wrong whoever receives it.
 *
 * Allowed: the storefront's own host, and any link the owner has written
 * into their own content (site, Business Knowledge) — their links are
 * theirs to use.
 *
 * THE SECOND LIVE CASE (2026-09-21): a workshop caption said "Book here"
 * and linked https://calendly.com — Calendly's own homepage, not
 * https://calendly.com/candlebyqaaf/workshop, which is where the booking
 * actually is. This check passed it, because it let a link through when
 * its HOST appeared anywhere in the owner's own text, and the host of the
 * real booking link is calendly.com. On a host the business does not own,
 * that is the difference between a booking and a dead end — so a
 * third-party link must now match the owner's link itself, or go deeper
 * into it. Only the storefront's own host keeps host-wide freedom, because
 * every path under it really is theirs.
 */
export function findUnsupportedLinks(text: string, f: BusinessFacts): string[] {
  const allowedHosts = new Set<string>();
  if (f.links?.store) allowedHosts.add(hostOf(f.links.store));
  for (const p of f.links?.products ?? []) allowedHosts.add(hostOf(p.url));
  const known = knownText(f);

  // Every address the owner has actually given, as whole links. Read as
  // links, not as text: "calendly.com" IS a substring of
  // "calendly.com/candlebyqaaf/workshop", and matching text was exactly
  // how the homepage passed as verified.
  const tidy = (s: string) => normalise(s).replace(/[.,;:!?]+$/, "").replace(/\/+$/, "");
  const ownLinks = new Set<string>();
  if (f.links?.booking) ownLinks.add(tidy(f.links.booking));
  for (const p of f.links?.products ?? []) ownLinks.add(tidy(p.url));
  for (const p of f.products) if (p.bookingUrl) ownLinks.add(tidy(p.bookingUrl));

  const reasons: string[] = [];
  for (const m of text.matchAll(LINK)) {
    const link = m[0].replace(/[.,;:!?]+$/, "");
    const host = hostOf(link);
    if (allowedHosts.has(host)) continue;
    const n = tidy(link);
    // One of the owner's own links, or a page inside one.
    const own = Array.from(ownLinks).filter((k) => k !== "");
    if (own.some((k) => n === k || n.startsWith(`${k}/`) || n.startsWith(`${k}?`))) continue;
    // A link the owner has written somewhere in their own content. Unless
    // it is an ANCESTOR of one of their real links — "calendly.com" when
    // the booking is at "calendly.com/candlebyqaaf/workshop". That is not
    // their page; it only looked like one because their page's address
    // contains it.
    const ancestorOfOwn = own.some((k) => k.startsWith(`${n}/`) || k.startsWith(`${n}?`));
    if (known.includes(n) && !ancestorOfOwn) continue;
    const booking = f.links?.booking ?? f.products.find((p) => p.bookingUrl)?.bookingUrl ?? null;
    const sameHostAsBooking = booking ? hostOf(booking) === host : false;
    reasons.push(
      sameHostAsBooking && booking
        ? `a link to "${link}" — that is not the booking page, it's the front door of ${host}; bookings go to ${booking}`
        : f.links?.store
        ? `a link to "${link}" — that isn't this business's website; the store is ${f.links.store}`
        : `a link to "${link}" — this business has no published website to link to`
    );
  }
  return Array.from(new Set(reasons));
}

/**
 * Claims in `text` that the facts don't support. Each entry says what and why.
 *
 * Anything the business already says itself (site, catalogue, Business
 * Knowledge, brand pillars) is treated as supported: the owner stands
 * behind their own claims; Hawlai just mustn't invent new ones.
 */
export function findUnsupportedClaims(text: string, f: BusinessFacts): string[] {
  return Array.from(new Set(findProblems(text, f).map((p) => p.reason)));
}

function findProblems(text: string, f: BusinessFacts): Problem[] {
  const problems: Problem[] = [];
  const reasons = {
    push: (...rs: string[]) => {
      for (const reason of rs) problems.push({ reason, kind: "claim" });
    },
  };
  const known = knownText(f);
  const t = normalise(text);
  const said = (phrase: string) => known.includes(normalise(phrase));
  const each = (re: RegExp, reason: (m: RegExpMatchArray) => string | null) => {
    for (const m of text.matchAll(re)) {
      if (said(m[0])) continue;
      const r = reason(m);
      if (r) reasons.push(r);
    }
  };

  // Numbers about customers, sales and reviews
  const realCount = Math.max(f.allTime.paidOrders, f.allTime.leads);
  each(SOCIAL_PROOF, (m) =>
    amount(m[1], m[2]) > realCount ? `"${m[0].trim()}" — the business has ${f.allTime.paidOrders} paid order(s) and ${f.allTime.leads} lead(s) on record` : null
  );
  each(VAGUE_CROWD, (m) => (realCount < CROWD_MIN[m[1].toLowerCase()] ? `"${m[0]}" — the business has ${f.allTime.paidOrders} paid order(s) on record` : null));
  each(UNITS_SOLD, (m) => (amount(m[1], m[2]) > f.allTime.paidOrders ? `"${m[0].trim()}" — ${f.allTime.paidOrders} paid order(s) on record` : null));
  if (RATINGS.test(text) && !said(text.match(RATINGS)![0])) reasons.push("a star rating — Hawlai has no rating data for this business");
  const years = text.match(YEARS);
  if (years && !known.includes(`${years[1]} year`)) reasons.push(`"${years[0].trim()}" — no years-in-business figure on record`);

  // Offers, prices, shipping and packaging that must match the store
  // "Free shipping" is true only if CHECKOUT charges ₹0 — decided by the
  // same function checkout uses (lib/shipping), on the cheapest product
  // alone. A free-above-₹X store may say it only alongside its real
  // threshold ("free shipping above ₹999").
  const freeShipping = text.match(FREE_SHIPPING);
  if (freeShipping && !said(freeShipping[0])) {
    const s = f.shipping;
    // Shipping is charged on physical products only; a business that
    // sells only services has nothing to ship at all.
    const goods = physicalProducts(f);
    if (!goods.length && serviceItems(f).length) {
      reasons.push(`free shipping ("${freeShipping[0]}") — this business sells services, nothing is shipped`);
    } else {
      const cheapest = goods.length ? Math.min(...goods.map((p) => p.price)) : 0;
      const charged = !s || computeShippingAmount({ shipping_mode: s.mode, shipping_rate: s.rate, shipping_free_threshold: s.freeThreshold }, cheapest) > 0;
      const t = s?.freeThreshold;
      const namesThreshold =
        s?.mode === "free_above" && t != null &&
        new RegExp(`(?:above|over|from|orders?\\s+of)\\s*₹\\s?${t}\\b|₹\\s?${t}\\s*(?:\\+|or\\s+more|and\\s+above|se\\s+upar|ke\\s+upar)`, "i").test(text);
      if (charged && !namesThreshold) reasons.push(`free shipping ("${freeShipping[0]}") — the store's shipping is ${describeShipping(s)}`);
    }
  }
  each(PACKAGING, (m) => `"${m[0]}" — not mentioned anywhere on the site or in the products`);
  each(PERCENT_OFF, (m) => (f.offers.some((o) => o.percent === Number(m[1])) ? null : `"${m[0]}" — no active discount code gives ${m[1]}% off`));
  each(FLAT_OFF, (m) => {
    const v = amount(m[1]);
    return f.offers.some((o) => o.flat === v) ? null : `"${m[0]}" — no active discount code gives ₹${v} off`;
  });
  const amounts = realAmounts(f);
  for (const m of text.matchAll(PRICE)) {
    if (said(m[0])) continue;
    const v = amount(m[1] ?? m[3], m[2]);
    // ₹0 is a "free" claim, which the shipping and offer checks own.
    if (!Number.isFinite(v) || v === 0 || isRealAmount(amounts, v)) continue;
    problems.push({
      kind: "price",
      reason: `"${m[0].trim()}" — no product, service, offer or shipping amount on record is ₹${v.toLocaleString("en-IN")}, and the site and Business Knowledge don't mention it`,
    });
  }
  if (/first[\s-]order/i.test(text) && /(off|discount|free)/i.test(text) && f.offers.length === 0) {
    reasons.push("a first-order offer — the store has no active discount codes");
  }
  for (const term of CLAIM_TERMS) {
    if (t.includes(term) && !known.includes(term)) reasons.push(`"${term}" — the business doesn't claim this anywhere`);
  }

  // Rankings, superlatives, comparisons, guarantees and urgency
  each(RANKING, (m) => `"${m[0]}" — a ranking claim with nothing on record to back it`);
  const places = f.city ? `${PLACE}|${escapeRe(f.city.toLowerCase())}` : PLACE;
  const superlative = new RegExp(`\\b(?:${SUPERLATIVE_WORDS})\\b[^.!?\\n]{0,40}?\\b(?:in|across)\\s+(?:all\\s+of\\s+)?(?:${places})\\b`, "gi");
  each(superlative, (m) => `"${m[0]}" — a superlative with nothing on record to back it`);
  each(POSSESSIVE_SUPERLATIVE, (m) => `"${m[0]}" — a superlative with nothing on record to back it`);
  each(BEST_SELLING, (m) => `"${m[0]}" — Hawlai has no sales ranking for this business's products`);
  each(COMPARATIVE, (m) => `"${m[0]}" — a comparison with competitors that nothing on record supports`);
  each(GUARANTEE, (m) => `"${m[0]}" — a guarantee the business hasn't offered`);
  each(SCARCITY, (m) => `"${m[0]}" — urgency about stock that nothing on record supports`);
  each(SLOT_SCARCITY, (m) => `"${m[0]}" — how many slots are left isn't on record; a service has no stock count, so nothing here backs the hurry`);

  // Links to a website that isn't the business's own
  reasons.push(...findUnsupportedLinks(text, f));

  // Health / efficacy and promised results
  each(HEALTH, (m) => `"${m[0]}" — a health or efficacy claim that needs real evidence`);
  each(RESULTS, (m) => `"${m[0]}" — a promised result that can't be verified`);

  return problems;
}

// A sentence ends at . ! ? । or an emoji — social copy uses emoji as full
// stops ("New candle is here 🕯️ Free shipping…"), and treating the two
// halves as one sentence would remove the honest half with the claim.
const PIECE =
  /[^.!?।\n\p{Extended_Pictographic}]*(?:[.!?।]+["'”’)\]]*|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)[ \t]*|[^.!?।\n\p{Extended_Pictographic}]+[ \t]*|\n/gu;

/** Splits copy into sentences and lines, keeping every character so the rest reads unchanged. */
function pieces(text: string): string[] {
  return text.match(PIECE) ?? [text];
}

/**
 * A booking link pointed at the wrong page on the right host, put right.
 *
 * "Book here: calendly.com" is not a claim to delete — the sentence is
 * true and the call to action is wanted. Only the address is wrong, and
 * the right one is known. Deleting the line would cost the booking just
 * as surely as the broken link did, so this rewrites it instead.
 */
export function repairBookingLinks(text: string, f: BusinessFacts): { text: string; fixed: string[] } {
  const booking = f.links?.booking ?? f.products.find((p) => p.bookingUrl)?.bookingUrl ?? null;
  if (!booking) return { text, fixed: [] };
  const bookingHost = hostOf(booking);
  const target = normalise(booking).replace(/\/+$/, "");
  const fixed: string[] = [];
  const out = text.replace(LINK, (link: string) => {
    const trail = link.match(/[.,;:!?]+$/)?.[0] ?? "";
    const bare = trail ? link.slice(0, -trail.length) : link;
    if (hostOf(bare) !== bookingHost) return link;
    const n = normalise(bare).replace(/\/+$/, "");
    // The booking page itself, or a page inside it — leave it alone.
    if (n === target || n.startsWith(`${target}/`) || n.startsWith(`${target}?`)) return link;
    fixed.push(bare);
    return `${booking}${trail}`;
  });
  return { text: out, fixed: Array.from(new Set(fixed)) };
}

/**
 * Removes each sentence that makes an unsupported claim. The rest of the
 * copy is left exactly as written. In "draft" mode a sentence whose only
 * problem is an unverified price is kept, and the price is listed in
 * `priceWarnings` for the owner to check.
 *
 * A wrong booking link is repaired first, not removed: see
 * repairBookingLinks.
 */
export function stripUnsupported(
  text: string,
  f: BusinessFacts,
  mode: ClaimsMode = "publish"
): { text: string; removed: string[]; priceWarnings: string[]; linksFixed: string[] } {
  const repair = repairBookingLinks(text, f);
  text = repair.text;
  if (findProblems(text, f).length === 0) return { text, removed: [], priceWarnings: [], linksFixed: repair.fixed };
  const kept: string[] = [];
  const removed: string[] = [];
  const priceWarnings: string[] = [];
  for (const piece of pieces(text)) {
    const problems = findProblems(piece, f);
    if (!problems.length) kept.push(piece);
    else if (mode === "draft" && problems.every((p) => p.kind === "price")) {
      kept.push(piece);
      priceWarnings.push(...problems.map((p) => p.reason));
    } else removed.push(...problems.map((p) => p.reason));
  }
  const cleaned = kept.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, removed: Array.from(new Set(removed)), priceWarnings: Array.from(new Set(priceWarnings)), linksFixed: repair.fixed };
}

/**
 * Applies stripUnsupported to every piece of text in a generated result,
 * whatever its shape (a caption, slides, a 7-day calendar, an email
 * sequence). An array item whose main text is removed entirely is
 * dropped; keys starting with "_" are metadata and left alone.
 */
export function guardOutput<T>(output: T, f: BusinessFacts, mode: ClaimsMode = "publish"): { output: T; removed: string[]; priceWarnings: string[]; linksFixed: string[] } {
  const removed: string[] = [];
  const priceWarnings: string[] = [];
  const linksFixed: string[] = [];
  const emptied = (before: any, after: any) => typeof before === "string" && before.trim() !== "" && String(after ?? "").trim() === "";

  const walk = (v: any): any => {
    if (typeof v === "string") {
      const r = stripUnsupported(v, f, mode);
      removed.push(...r.removed);
      priceWarnings.push(...r.priceWarnings);
      linksFixed.push(...r.linksFixed);
      return r.text;
    }
    if (Array.isArray(v)) {
      const out: any[] = [];
      for (const item of v) {
        const next = walk(item);
        // An item whose text was removed entirely goes with it — a hook
        // that was only a claim, a slide with no headline left, a
        // calendar day with no caption left.
        if (emptied(item, next)) continue;
        if (item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).some((k) => !k.startsWith("_") && emptied(item[k], next[k]))) continue;
        out.push(next);
      }
      return out;
    }
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = k.startsWith("_") ? x : walk(x);
      return o;
    }
    return v;
  };

  const out = walk(output);
  return { output: out, removed: Array.from(new Set(removed)), priceWarnings: Array.from(new Set(priceWarnings)), linksFixed: Array.from(new Set(linksFixed)) };
}

/** What the owner is told — said plainly, never silently hidden. */
export function claimsNote(removed: string[]): string | null {
  if (removed.length === 0) return null;
  const n = removed.length;
  return `Hawlai removed ${n === 1 ? "a line" : "lines"} that made ${n === 1 ? "a claim" : `${n} claims`} it couldn't verify from your store data (${removed.slice(0, 2).join("; ")}${n > 2 ? "; …" : ""}). If a claim is true, add it to Business Knowledge and it will be allowed.`;
}

/** What the owner is told when a link was put right — never changed silently. */
export function linkFixedNote(fixed: string[], booking: string | null): string | null {
  if (fixed.length === 0 || !booking) return null;
  return `One link pointed at ${fixed[0]}, which isn't where your bookings are — Hawlai sent it to ${booking} instead.`;
}

/** What the owner is told about prices left in a draft. */
export function priceWarningNote(warnings: string[]): string | null {
  if (warnings.length === 0) return null;
  const n = warnings.length;
  return `Check ${n === 1 ? "this price" : "these prices"} before you use this: ${warnings.slice(0, 2).join("; ")}${n > 2 ? "; …" : ""}. ${n === 1 ? "It was" : "They were"} left in because you're reviewing this draft — add the price to a product, service or Business Knowledge and Hawlai will recognise it next time.`;
}

/** guardOutput plus the notes, attached as `_claimsNote` for the result card. */
export function guardGenerated<T extends object>(
  output: T,
  f: BusinessFacts,
  mode: ClaimsMode = "publish"
): { output: T & { _claimsNote?: string }; removed: string[]; priceWarnings: string[]; linksFixed: string[] } {
  const r = guardOutput(output, f, mode);
  const booking = f.links?.booking ?? f.products.find((p) => p.bookingUrl)?.bookingUrl ?? null;
  const note = [claimsNote(r.removed), priceWarningNote(r.priceWarnings), linkFixedNote(r.linksFixed, booking)].filter(Boolean).join(" ");
  return { output: (note ? { ...r.output, _claimsNote: note } : r.output) as T & { _claimsNote?: string }, removed: r.removed, priceWarnings: r.priceWarnings, linksFixed: r.linksFixed };
}
