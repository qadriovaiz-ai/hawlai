// Reading payment and commerce secrets.
//
// The two-phase cutover is COMPLETE. These helpers now reference only
// the encrypted columns; the plaintext originals are dropped by
// migration 164.
//
// That ordering is deliberate and the safe direction round. This code
// works whether or not the plaintext columns still exist, because it
// no longer names them — so it can deploy before OR after the
// migration runs without a window where one expects something the
// other has not got. The reverse (migration first) is exactly what
// broke when 160 was reported as run and had not been.
//
// Every call site still goes through here so the read rule lives in
// one place, and the SELECT fragments live here too: a route that
// selected the wrong column name would fail at runtime rather than at
// compile time.

import { decryptSecret, encryptSecret } from "./secretCrypto";

export const RAZORPAY_SECRET_SELECT = "razorpay_key_secret_encrypted";
export const SHOPIFY_TOKEN_SELECT = "shopify_access_token_encrypted";
export const WOOCOMMERCE_SECRET_SELECT = "woocommerce_consumer_secret_encrypted";

type Row = Record<string, any> | null | undefined;

/**
 * Decrypts a stored commerce secret, or returns null when none is set.
 *
 * A decryption failure returns null rather than throwing. Callers treat
 * null as "not configured", which fails CLOSED — an unreadable Razorpay
 * secret means checkout offers Cash on Delivery instead of accepting a
 * payment it cannot verify. Throwing here would take the storefront
 * down instead. The error is logged WITHOUT the value.
 */
function read(encrypted: string | null | undefined, label: string): string | null {
  if (!encrypted) return null;
  try {
    return decryptSecret(encrypted, "commerce");
  } catch (err: any) {
    console.error(`[commerceSecrets] could not decrypt ${label}: ${err?.message}`);
    return null;
  }
}

export function razorpaySecret(row: Row): string | null {
  return read(row?.razorpay_key_secret_encrypted, "Razorpay key secret");
}

export function shopifyAccessToken(row: Row): string | null {
  return read(row?.shopify_access_token_encrypted, "Shopify access token");
}

export function woocommerceConsumerSecret(row: Row): string | null {
  return read(row?.woocommerce_consumer_secret_encrypted, "WooCommerce consumer secret");
}

export type CommerceSecretColumn =
  | "razorpay_key_secret"
  | "shopify_access_token"
  | "woocommerce_consumer_secret";

/** Update payload for storing a commerce secret. Only the encrypted column is written. */
export function encryptedWrite(column: CommerceSecretColumn, value: string) {
  return { [`${column}_encrypted`]: encryptSecret(value, "commerce") };
}

/** Update payload for clearing one — used by the disconnect handlers. */
export function clearedWrite(column: CommerceSecretColumn) {
  return { [`${column}_encrypted`]: null };
}
