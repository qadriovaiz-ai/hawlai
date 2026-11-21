// Where this product keeps the pictures it makes.
//
// WHY THIS IS ITS OWN MODULE, and the reason is a bug rather than
// tidiness. Two guards read links in text and judge whether the
// business owns them:
//
//   replyLinks.ts   — fixes or removes links in the chat's own prose.
//                     It has exempted the storage origin since
//                     2026-09-21, with the comment "Where Hawlai puts
//                     the pictures it makes — a generated image in a
//                     reply is not a customer-facing link and must
//                     survive untouched."
//   claimCheck.ts   — findUnsupportedLinks, the claims guard. It had
//                     no such exemption.
//
// So on 21 November 2026, the moment the chat was given a list of the
// business's existing images so it could re-use one instead of
// generating a second, the claims guard stripped every URL with "this
// business has no published website to link to".
//
// THE GUARD WAS NOT WRONG ABOUT ITS OWN RULE. A link to a site the
// business does not have is exactly what it exists to remove — that
// rule is why a workshop caption once pointed at the wrong page. It
// was wrong about WHAT IT WAS LOOKING AT: a Supabase storage URL for
// an image this product generated is not a claim about the business's
// website. It is this product's own infrastructure, and the model
// needs it to say "which of these three?".
//
// ONE DEFINITION, because the whole bug is that there were two and
// only one of them knew. A third guard that reads links must use this
// rather than its own copy.

/**
 * The host this product's generated images are served from, or null.
 *
 * Read from configuration rather than written down: the origin differs
 * per deployment, and rule 3 leaves no room for a hardcoded host.
 *
 * NULL WHEN UNCONFIGURED, and callers must treat that as "exempt
 * nothing" rather than "exempt everything" — an un-set variable must
 * not switch a guard off.
 */
export function ownAssetHost(): string | null {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!origin) return null;
  try {
    return new URL(origin).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Is this one of our own asset URLs?
 *
 * Exact host or a subdomain of it, matched on a dot boundary — never a
 * bare suffix, so "evil-abcdefgh.supabase.co" is not ours. That
 * distinction cost a surviving mutation in the Shopify upload guard on
 * 20 November, in both directions: a suffix check and a prefix check
 * each let one shape through.
 */
export function isOwnAssetUrl(url: string): boolean {
  const host = ownAssetHost();
  if (!host) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return u.hostname === host || u.hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
}
