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
