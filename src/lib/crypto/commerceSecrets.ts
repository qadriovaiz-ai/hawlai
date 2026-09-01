// Reading payment and commerce secrets during the two-phase cutover.
//
// Every call site goes through here so the "prefer encrypted, fall
// back to plaintext" rule is written once. Seven routes touch these
// three values; seven copies of that rule would be seven chances for
// one of them to keep reading plaintext after the column is dropped.
//
// The SELECT fragments live here too, for the same reason: a route
// that forgets to select the _encrypted column would silently fall
// through to plaintext and look like it was working right up until
// migration 161 drops it.

import { resolveSecret, encryptSecret } from "./secretCrypto";

export const RAZORPAY_SECRET_SELECT = "razorpay_key_secret, razorpay_key_secret_encrypted";
export const SHOPIFY_TOKEN_SELECT = "shopify_access_token, shopify_access_token_encrypted";
export const WOOCOMMERCE_SECRET_SELECT = "woocommerce_consumer_secret, woocommerce_consumer_secret_encrypted";

type Row = Record<string, any> | null | undefined;

export function razorpaySecret(row: Row): string | null {
  return resolveSecret(row?.razorpay_key_secret_encrypted, row?.razorpay_key_secret, "commerce", "Razorpay key secret");
}

export function shopifyAccessToken(row: Row): string | null {
  return resolveSecret(row?.shopify_access_token_encrypted, row?.shopify_access_token, "commerce", "Shopify access token");
}

export function woocommerceConsumerSecret(row: Row): string | null {
  return resolveSecret(
    row?.woocommerce_consumer_secret_encrypted,
    row?.woocommerce_consumer_secret,
    "commerce",
    "WooCommerce consumer secret"
  );
}

/**
 * Builds the update payload for storing a commerce secret.
 *
 * Writes the encrypted column and NULLS the plaintext one in the same
 * statement. New and updated values are therefore never written in
 * plaintext again from the moment this ships — the plaintext column
 * only ever holds pre-cutover data waiting on the backfill, which
 * shrinks the exposure window rather than freezing it until 161.
 */
export function encryptedWrite(column: "razorpay_key_secret" | "shopify_access_token" | "woocommerce_consumer_secret", value: string) {
  return {
    [`${column}_encrypted`]: encryptSecret(value, "commerce"),
    [column]: null,
  };
}
