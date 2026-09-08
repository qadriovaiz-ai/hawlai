// Formatting a price in the currency the STORE actually uses.
//
// FROM A LIVE TEST. The first real price-change preview showed
// "₹749.95" for a product priced at $749.95 — the test store is on
// USD. Nothing in the publish path had hardcoded a rupee symbol; the
// path emitted a BARE NUMBER, and the Master Chat system prompt
// ("ground everything in India-specific business reality") supplied
// the symbol from context.
//
// That is the more instructive version of the bug: handing a model a
// number and expecting it not to render it is a wish, not a design.
// The fix is to give it the currency, so there is nothing to infer.
//
// It matters beyond tidiness. A wrong currency on a live price change
// is the kind of detail that makes an approver stop trusting the whole
// preview — and this preview is the ONLY place a mis-resolved product
// or a mistyped amount can be caught before it reaches customers.

/**
 * A price as a person in that store's market would read it.
 *
 * Falls back to "CODE amount" rather than throwing: an unrecognised
 * currency should degrade to something honest and unambiguous, not
 * take down the preview that a merchant is waiting on.
 */
export function formatMoney(amount: string | number | null | undefined, currencyCode: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "unknown";
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return String(amount);

  const code = (currencyCode ?? "").trim().toUpperCase();
  // No currency known is NOT an excuse to pick one. A bare number is
  // honest; a guessed symbol is the bug this file exists for.
  if (!/^[A-Z]{3}$/.test(code)) return String(amount);

  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).format(value);
  } catch {
    return `${code} ${amount}`;
  }
}

/** A currency the merchant named, and the bare amount they meant. */
export type StatedPrice = {
  /** Digits only, ready to send to the platform. Null when unparseable. */
  amount: string | null;
  /** ISO code the merchant named, if they named one at all. */
  statedCurrency: string | null;
};

const SYMBOLS: Record<string, string> = { "₹": "INR", $: "USD", "£": "GBP", "€": "EUR", "¥": "JPY" };
const WORDS: Record<string, string> = {
  rupee: "INR", rupees: "INR", rs: "INR", inr: "INR",
  dollar: "USD", dollars: "USD", usd: "USD", buck: "USD", bucks: "USD",
  pound: "GBP", pounds: "GBP", gbp: "GBP",
  euro: "EUR", euros: "EUR", eur: "EUR",
  yen: "JPY", jpy: "JPY",
};

/**
 * Read "999", "₹999", "$999", "999 rupees", "rs 1,299" the same way.
 *
 * A STORE'S CURRENCY IS NOT A USER CHOICE. It is fixed in Shopify's
 * settings, so asking "which currency did you mean?" presents a
 * decision the merchant does not actually have. The number is the
 * instruction; any currency word is context, not a parameter.
 *
 * NO EXCHANGE-RATE CONVERSION, deliberately — see the caller. This
 * only reports what was said.
 */
export function parseStatedPrice(input: string): StatedPrice {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return { amount: null, statedCurrency: null };

  let statedCurrency: string | null = null;
  for (const [symbol, code] of Object.entries(SYMBOLS)) {
    if (raw.includes(symbol)) { statedCurrency = code; break; }
  }
  if (!statedCurrency) {
    for (const word of raw.split(/[^a-z]+/).filter(Boolean)) {
      if (WORDS[word]) { statedCurrency = WORDS[word]; break; }
    }
  }

  // Commas are thousands separators in every locale this product
  // serves; stripping them before parsing is why "1,299" is 1299 and
  // not 1.
  const match = raw.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return { amount: match ? match[0] : null, statedCurrency };
}
