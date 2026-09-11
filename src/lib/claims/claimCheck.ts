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

import { describeShipping, knownText, normalise, type BusinessFacts } from "./businessFacts";

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
const FLAT_OFF = /₹\s?(\d[\d,]*)\s*off/gi;
const PRICE = /\b(?:at|for|only|just|starting\s+(?:at|from)|from|priced\s+at|now)\s+₹\s?(\d[\d,]*)|₹\s?(\d[\d,]*)\s*(?:\/-)?\s*only\b/gi;

// Product-attribute claims a business must be able to substantiate.
const CLAIM_TERMS = [
  "phthalate free", "paraben free", "sulphate free", "sulfate free", "all natural", "100% natural", "vegan", "cruelty free", "organic",
  "non toxic", "chemical free", "eco friendly", "award winning", "warranty", "certified", "handcrafted in",
];

const RANKING = /(?<![\w#])(?:no\.?\s?1|number\s?one|#\s?1)(?![\w])/gi;
const PLACE = "india|the\\s+world|the\\s+country|the\\s+city|town|the\\s+market|the\\s+region|the\\s+state";
const SUPERLATIVE_WORDS = "best|finest|top[- ]rated|most\\s+trusted|most\\s+loved|most\\s+popular|leading|largest|biggest|favou?rite|number\\s+one|no\\.?\\s?1";
const POSSESSIVE_SUPERLATIVE = new RegExp(`\\b(?:india|the\\s+world|the\\s+city|the\\s+country)['’]s\\s+(?:${SUPERLATIVE_WORDS}|top)\\b`, "gi");
const BEST_SELLING = /\b(?:best[- ]?sell(?:ing|ers?)|top[- ]?sell(?:ing|ers?)|fastest[- ]selling|most[- ]ordered)\b/gi;
const SCARCITY = /\b(?:selling\s+(?:out\s+)?fast|almost\s+(?:sold\s+out|gone)|only\s+\d+\s+(?:left|pieces?\s+left|in\s+stock)|limited\s+stock|(?:just\s+)?a\s+few\s+left|while\s+stocks?\s+lasts?)\b/gi;
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
  if (u.startsWith("lakh") || u.startsWith("lac")) return n * 1e5;
  return n;
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
  return out;
}

/**
 * Claims in `text` that the facts don't support. Each entry says what and why.
 *
 * Anything the business already says itself (site, catalogue, Business
 * Knowledge, brand pillars) is treated as supported: the owner stands
 * behind their own claims; Hawlai just mustn't invent new ones.
 */
export function findUnsupportedClaims(text: string, f: BusinessFacts): string[] {
  const reasons: string[] = [];
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
  if (/free\s+(shipping|delivery)/i.test(text) && !(f.shipping && (f.shipping.mode === "free" || f.shipping.mode === "free_above"))) {
    reasons.push(`free shipping — the store's shipping is ${describeShipping(f.shipping)}`);
  }
  each(PACKAGING, (m) => `"${m[0]}" — not mentioned anywhere on the site or in the products`);
  each(PERCENT_OFF, (m) => (f.offers.some((o) => o.percent === Number(m[1])) ? null : `"${m[0]}" — no active discount code gives ${m[1]}% off`));
  each(FLAT_OFF, (m) => {
    const v = amount(m[1]);
    return f.offers.some((o) => o.flat === v) ? null : `"${m[0]}" — no active discount code gives ₹${v} off`;
  });
  const amounts = realAmounts(f);
  each(PRICE, (m) => {
    const v = amount(m[1] ?? m[2]);
    return amounts.has(v) ? null : `"${m[0].trim()}" — no product, offer or shipping amount on record is ₹${v}`;
  });
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

  // Health / efficacy and promised results
  each(HEALTH, (m) => `"${m[0]}" — a health or efficacy claim that needs real evidence`);
  each(RESULTS, (m) => `"${m[0]}" — a promised result that can't be verified`);

  return Array.from(new Set(reasons));
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

/** Removes each sentence that makes an unsupported claim. The rest of the copy is left exactly as written. */
export function stripUnsupported(text: string, f: BusinessFacts): { text: string; removed: string[] } {
  if (findUnsupportedClaims(text, f).length === 0) return { text, removed: [] };
  const kept: string[] = [];
  const removed: string[] = [];
  for (const piece of pieces(text)) {
    const problems = findUnsupportedClaims(piece, f);
    if (problems.length) removed.push(...problems);
    else kept.push(piece);
  }
  const cleaned = kept.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, removed: Array.from(new Set(removed)) };
}

/**
 * Applies stripUnsupported to every piece of text in a generated result,
 * whatever its shape (a caption, slides, a 7-day calendar, an email
 * sequence). An array item whose main text is removed entirely is
 * dropped; keys starting with "_" are metadata and left alone.
 */
export function guardOutput<T>(output: T, f: BusinessFacts): { output: T; removed: string[] } {
  const removed: string[] = [];
  const emptied = (before: any, after: any) => typeof before === "string" && before.trim() !== "" && String(after ?? "").trim() === "";

  const walk = (v: any): any => {
    if (typeof v === "string") {
      const r = stripUnsupported(v, f);
      removed.push(...r.removed);
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
  return { output: out, removed: Array.from(new Set(removed)) };
}

/** What the owner is told — said plainly, never silently hidden. */
export function claimsNote(removed: string[]): string | null {
  if (removed.length === 0) return null;
  const n = removed.length;
  return `Hawlai removed ${n === 1 ? "a line" : "lines"} that made ${n === 1 ? "a claim" : `${n} claims`} it couldn't verify from your store data (${removed.slice(0, 2).join("; ")}${n > 2 ? "; …" : ""}). If a claim is true, add it to Business Knowledge and it will be allowed.`;
}

/** guardOutput plus the note, attached as `_claimsNote` for the result card. */
export function guardGenerated<T extends object>(output: T, f: BusinessFacts): { output: T & { _claimsNote?: string }; removed: string[] } {
  const r = guardOutput(output, f);
  const note = claimsNote(r.removed);
  return { output: (note ? { ...r.output, _claimsNote: note } : r.output) as T & { _claimsNote?: string }, removed: r.removed };
}
