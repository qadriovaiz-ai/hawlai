// One log tag for the whole Meta ads path: [meta]
//
// WHY THIS EXISTS, and it is the same reason [publish] exists. The
// Shopify OAuth work took three wrong diagnoses before a single logged
// response body settled it, and every one of those rounds was spent
// reasoning about evidence that had been thrown away.
//
// The Meta launch path was in exactly that state before this file: the
// only tag anywhere on it was "[ad-engine]", covering one function
// (generateAdPlan). A launch makes FIVE sequential Graph API calls —
// image, creative, campaign, ad set, ad — inside one try block, and a
// failure at the ad set looked identical from outside to a failure at
// the image upload. The only surviving evidence was
// ad_creatives.error_message and a 500.
//
// ONE TAG, not one per module, for the same reason as [publish]:
// during an incident the question is "what happened to this launch",
// not "what happened in metaPost". Sub-stages are a field.
//
// NEVER LOGGED: the page access token, in any form. metaPost's params
// object CONTAINS access_token, so nothing here may ever take a params
// object and print it — callers pass named, chosen fields. Ad account
// ids, campaign/ad set/ad ids, budgets and targeting ARE logged: they
// are the subject of the change and useless to withhold when
// reconstructing one.

type Fields = Record<string, string | number | boolean | null | undefined>;

/**
 * Keys that must never reach a log line, checked by name at runtime.
 *
 * A grep proves today's call sites are clean; this keeps tomorrow's
 * honest. The failure mode being prevented is someone spreading a
 * params object into a log call — the one shape that would leak a
 * token — so the guard is on the key name, not the value.
 */
const FORBIDDEN = /token|secret|password|access_token|bytes|photo_base64/i;

function render(stage: string, fields: Fields): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    // Redaction is on the VALUE's type as well as the key's name.
    //
    // Name alone was wrong, and running the launch test showed it:
    // `has_token=false` came out as `has_token=[redacted]`, blanking
    // the presence flag that is the entire diagnostic value of
    // launch.not_connected. A boolean or a number cannot be a
    // credential; only a string can, so only a string is redacted.
    if (typeof v === "string" && FORBIDDEN.test(k)) {
      parts.push(`${k}=[redacted]`);
      continue;
    }
    parts.push(`${k}=${typeof v === "string" && v.includes(" ") ? JSON.stringify(v) : v}`);
  }
  return `[meta] ${stage} ${parts.join(" ")}`.trim();
}

/** Ordinary progress. Enough to reconstruct a successful launch afterwards. */
export function metaLog(stage: string, fields: Fields = {}): void {
  console.log(render(stage, fields));
}

/**
 * Something went wrong.
 *
 * `detail` carries Meta's OWN words — error.message, error_user_msg,
 * the subcode. That is the field that resolves these, and the one most
 * easily dropped in favour of a tidy generic string.
 */
export function metaError(stage: string, fields: Fields = {}): void {
  console.error(render(stage, fields));
}

/** Exported for the test that asserts tokens cannot be logged. */
export const __renderForTest = render;
