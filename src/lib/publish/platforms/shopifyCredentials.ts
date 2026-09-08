// Resolving a usable Shopify credential for the executor.
//
// FOR REVIEW — this is the piece that lets the write path reach a real
// store, so it is deliberately its own file rather than a few lines
// folded into the executor.
//
// SERVICE ROLE, and the reason matters. The executor runs from a
// background context with no user session, so there is no RLS to
// scope the read. Every query here is therefore explicitly keyed on
// the dealership_id carried by the publish_action, and that id comes
// from a row the merchant's own RLS-protected session created. The
// service client is used to READ a credential, never to decide whose
// credential it is.

import { createServiceClient } from "@/lib/supabase/service";
import { SHOPIFY_TOKEN_SELECT } from "@/lib/crypto/commerceSecrets";
import { getValidShopifyAccessToken } from "@/lib/commerce/shopifyToken";
import { publishError } from "@/lib/publish/log";

export type CredentialResult =
  | { ok: true; shop: string; accessToken: string }
  /**
   * Transient. Another process holds the refresh lock, so the token
   * is mid-rotation and will exist shortly.
   *
   * Kept DISTINCT from not_connected on purpose: collapsing them would
   * make the executor mark a perfectly healthy action as failed
   * because two workers happened to overlap, and the merchant would
   * see "couldn't reach Shopify" for a two-second lock.
   */
  | { ok: false; retryable: true; reason: string }
  /** Terminal until the merchant acts — not connected, or reconnect required. */
  | { ok: false; retryable: false; reason: string };

/**
 * The credential for one dealership, refreshing the token if needed.
 *
 * Returns a reason rather than null. The platform module only needs
 * "did I get one", but the EXECUTOR needs to know whether to retry or
 * to stop, and that distinction cannot be recovered from a null.
 */
export async function resolveShopifyCredentials(dealershipId: string): Promise<CredentialResult> {
  const service = createServiceClient();

  // Columns named literally — a template-literal select defeats the
  // typed client's row inference, the trap five routes hit during
  // migration 165. SHOPIFY_TOKEN_SELECT is itself a literal constant.
  const { data, error } = await service
    .from("dealerships")
    .select(`id, shopify_store_url, ${SHOPIFY_TOKEN_SELECT}`)
    .eq("id", dealershipId)
    .maybeSingle();

  if (error) return { ok: false, retryable: true, reason: `Couldn't read the connection: ${error.message}` };
  if (!data?.shopify_store_url) return { ok: false, retryable: false, reason: "Shopify isn't connected for this business." };

  const token = await getValidShopifyAccessToken(service, data as any, data.shopify_store_url);

  if (token.ok) return { ok: true, shop: data.shopify_store_url, accessToken: token.accessToken };

  // The token itself is NEVER logged — only why it could not be used.
  publishError("credentials.unusable", { dealership: dealershipId, shop: data.shopify_store_url, reason: token.reason, detail: token.detail ?? null });

  switch (token.reason) {
    case "busy":
      // Another process is rotating the token right now. Shopify
      // rotates refresh tokens and retires the previous one, so
      // racing it would destroy both — waiting is the only correct
      // response.
      return { ok: false, retryable: true, reason: "A token refresh is already in progress." };
    case "refresh_failed":
      // Could be a network blip or a genuinely dead refresh token.
      // Retryable because the cheap assumption is the recoverable one;
      // a truly dead token surfaces as reconnect_required next time.
      return { ok: false, retryable: true, reason: token.detail ?? "Couldn't refresh the Shopify token." };
    case "reconnect_required":
      return { ok: false, retryable: false, reason: "Shopify needs reconnecting — the stored access has expired." };
    default:
      return { ok: false, retryable: false, reason: "Shopify isn't connected for this business." };
  }
}

/**
 * The narrow shape createShopifyPlatform expects.
 *
 * The platform module genuinely does not need the retryable
 * distinction — it either has a credential or it does not. Keeping
 * that reduction HERE rather than widening the platform's dependency
 * means the executor can still see the difference, and the platform
 * stays trivially testable with a two-line stub.
 */
export const shopifyCredentialsAdapter = async (dealershipId: string) => {
  const result = await resolveShopifyCredentials(dealershipId);
  return result.ok ? { shop: result.shop, accessToken: result.accessToken } : null;
};
