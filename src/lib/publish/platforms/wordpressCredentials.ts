// Resolving a usable WordPress credential for the executor.
//
// Its own file, like shopifyCredentials.ts, because this is the piece
// that lets the write path reach a real site.
//
// SERVICE ROLE, and the reason is the same one recorded there: the
// executor runs from a background context with no user session, so
// there is no RLS to scope the read. The query is explicitly keyed on
// the dealership_id carried by the publish_action, and that id comes
// from a row the merchant's own RLS-protected session created. The
// service client READS a credential; it never decides whose it is.
//
// NO RETRYABLE STATE, and the absence is deliberate. Shopify's
// equivalent distinguishes "another worker holds the refresh lock" from
// "not connected", because collapsing them would fail a healthy action
// over a two-second overlap. An application password never rotates and
// has no lock, so there is nothing here that is transient: a
// credential either resolves or the owner has to act.

import { createServiceClient } from "@/lib/supabase/service";
import { WORDPRESS_SECRET_SELECT, wordpressAppPassword } from "@/lib/crypto/commerceSecrets";
import { publishError } from "@/lib/publish/log";
import type { WordPressCreds } from "@/lib/commerce/wordpressRest";

/**
 * The credential for one dealership, or null when there is none.
 *
 * Null rather than a reason, because unlike Shopify there is only one
 * way to fail here and the adapter's own message says it better than a
 * passed-through string would.
 */
export async function wordpressCredentialsAdapter(dealershipId: string): Promise<WordPressCreds | null> {
  const service = createServiceClient();

  // Columns named literally — a template-literal select defeats the
  // typed client's row inference, the trap five routes hit during
  // migration 165. WORDPRESS_SECRET_SELECT is itself a literal.
  const { data, error } = await service
    .from("dealerships")
    .select(`wordpress_site_url, wordpress_username, ${WORDPRESS_SECRET_SELECT}`)
    .eq("id", dealershipId)
    .maybeSingle();

  if (error) {
    // Before migration 238 this is "column does not exist". After it,
    // a real read failure. Either way the honest answer is that there
    // is no usable connection — never that there is one.
    publishError("wordpress.credential_unreadable", { dealership: dealershipId, detail: error.message });
    return null;
  }
  if (!data?.wordpress_site_url || !data?.wordpress_username) return null;

  // THE SECRET IS DECRYPTED HERE, and a ciphertext that will not
  // decrypt reads as "not connected" rather than throwing. A rotated
  // key must not take the publish path down; it must say the site needs
  // reconnecting, which is true and which the owner can act on.
  const appPassword = wordpressAppPassword(data);
  if (!appPassword) return null;

  return {
    siteUrl: String(data.wordpress_site_url),
    username: String(data.wordpress_username),
    appPassword,
  };
}
