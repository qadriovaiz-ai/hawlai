// One log tag for the whole publish path: [publish]
//
// WHY THIS EXISTS. The Shopify OAuth work took three wrong diagnoses
// before a log line settled it, and every one of those rounds was
// spent reasoning about evidence that had been thrown away — a
// discarded response body, an unread `scope` field, a bare `catch {}`.
// The publish path was then built with NO logging at all: the
// highest-stakes code in the product, writing live prices to a
// merchant's store, with nothing to read when it goes wrong.
//
// ONE TAG, not one per module. During an incident the question is
// "what happened to this price change", not "what happened in the
// executor" — a single filter has to return the whole story, from the
// phrase the merchant typed to what Shopify answered. Sub-stages are a
// field, not a separate prefix.
//
// NEVER LOGGED: access tokens, refresh tokens, the client secret.
// Prices, product titles and ids ARE logged — they are the subject of
// the change and useless to withhold when reconstructing one.

type Fields = Record<string, string | number | boolean | null | undefined>;

function render(stage: string, fields: Fields): string {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === "string" && v.includes(" ") ? JSON.stringify(v) : v}`);
  return `[publish] ${stage} ${parts.join(" ")}`.trim();
}

/** Ordinary progress. Enough to reconstruct a successful change afterwards. */
export function publishLog(stage: string, fields: Fields = {}): void {
  console.log(render(stage, fields));
}

/**
 * Something went wrong.
 *
 * `detail` carries the platform's OWN words wherever there are any —
 * Shopify's userErrors message, a GraphQL error, an HTTP status. That
 * is the field that has actually resolved every failure in this
 * integration so far, and the one most easily left out.
 */
export function publishError(stage: string, fields: Fields = {}): void {
  console.error(render(stage, fields));
}
