// ------------------------------------------------------------------
// AES-256-GCM secret encryption at rest — shared implementation.
// ------------------------------------------------------------------
// Lifted verbatim from lib/canva/tokenCrypto.ts (which now delegates
// here) so payment and commerce secrets reuse the exact algorithm,
// format and failure behaviour already in production for Canva rather
// than growing a second crypto path that could drift from it.
//
// KEY RINGS. Secrets are grouped by blast radius, each with its own
// environment variable:
//
//   canva     — marketing convenience. Losing this key forces every
//               user to reconnect Canva. Annoying, survivable.
//   commerce  — money. Losing this key breaks checkout for every
//               merchant and locks their store integrations.
//
// They are separate variables so the two can be rotated
// independently. Rotating the Canva key is a routine operation with a
// known, tolerable consequence; performing that same operation and
// silently taking down payments would be a different event entirely.
// The operator may still set both variables to the same VALUE if they
// prefer one secret to manage — that stays their call, and separate
// names keep the option of divorcing them later without a migration.
//
// SCOPE. Covers razorpay_key_secret, shopify_access_token and
// woocommerce_consumer_secret. The 14 remaining marketing OAuth
// columns (Gmail, Google Ads, LinkedIn, Pinterest, Snapchat, YouTube,
// Instagram, Meta page token) are still PLAINTEXT and are scheduled
// separately. Stated here so nobody reads this file and concludes the
// database is encrypted generally.
//
// What this protects against: a dump of the dealerships table, a leaked
// backup, a read-only SQL compromise. What it does NOT protect against:
// an attacker who can read the running server's environment.
// ------------------------------------------------------------------

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit nonce, the size GCM is specified for
const VERSION = "v1";

export type KeyRing = "canva" | "commerce";

const RING_ENV: Record<KeyRing, string> = {
  canva: "CANVA_TOKEN_ENCRYPTION_KEY",
  commerce: "COMMERCE_ENCRYPTION_KEY",
};

/**
 * Read per call, not at module load. Module-load validation would take
 * the whole app down on boot over a missing key — including every page
 * with nothing to do with secrets. Failing here means a missing key
 * breaks only what actually needs it.
 *
 * Referenced through a switch on literals rather than a computed
 * `process.env[name]` so the lookup is statically visible to any
 * bundler that inspects it. These are server-only variables and never
 * NEXT_PUBLIC_ — a secret key inlined into a client bundle would be
 * the whole vulnerability, handed out.
 */
function readRawKey(ring: KeyRing): string | undefined {
  switch (ring) {
    case "canva":
      return process.env.CANVA_TOKEN_ENCRYPTION_KEY;
    case "commerce":
      return process.env.COMMERCE_ENCRYPTION_KEY;
  }
}

function getKey(ring: KeyRing): Buffer {
  const raw = readRawKey(ring);
  if (!raw) {
    throw new Error(`${RING_ENV[ring]} is not set — these secrets cannot be stored or read.`);
  }

  // Accepts hex or base64 so whoever sets it can paste whatever their
  // key generator produced, rather than guessing an encoding.
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `${RING_ENV[ring]} must decode to ${KEY_BYTES} bytes (got ${key.length}). Generate one with: openssl rand -hex 32`
    );
  }
  return key;
}

/**
 * Encrypts to a single self-describing string:
 *   v1:<iv>:<authTag>:<ciphertext>   (each part base64)
 *
 * The version prefix lets a future key rotation or algorithm change be
 * detected on read instead of failing as corrupt data. A fresh random
 * IV per call is mandatory — reusing one under the same key breaks GCM
 * outright.
 */
export function encryptSecret(plaintext: string, ring: KeyRing): string {
  if (!plaintext) throw new Error("Refusing to encrypt an empty secret — this indicates an upstream failure.");

  const key = getKey(ring);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Reverses encryptSecret. Throws on a tampered or truncated value
 * rather than returning anything — GCM's auth tag is verified by
 * .final(), so tampering fails loudly instead of yielding plausible
 * garbage that would then be sent to a payment provider as a key.
 */
export function decryptSecret(payload: string, ring: KeyRing): string {
  const parts = payload.split(":");
  if (parts.length !== 4) throw new Error("Stored secret is malformed and cannot be read.");

  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== VERSION) throw new Error(`Stored secret uses unknown format "${version}".`);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(ring), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** True when the ring's key is present and usable. */
export function isRingConfigured(ring: KeyRing): boolean {
  try {
    getKey(ring);
    return true;
  } catch {
    return false;
  }
}

/**
 * Two-phase cutover read: prefer the encrypted column, fall back to
 * plaintext while the backfill is still pending.
 *
 * Both columns exist at once by design (migration 160 adds the
 * encrypted ones without dropping the originals), so a failed or
 * half-finished backfill is recoverable and never takes checkout down.
 *
 * A decryption failure falls back to plaintext rather than throwing:
 * during cutover a bad ciphertext must not be able to break payments
 * when a working plaintext value is sitting right beside it. The error
 * is logged WITHOUT the value so it is diagnosable without putting a
 * secret in the logs.
 */
export function resolveSecret(
  encrypted: string | null | undefined,
  plaintext: string | null | undefined,
  ring: KeyRing,
  label: string
): string | null {
  if (encrypted) {
    try {
      return decryptSecret(encrypted, ring);
    } catch (err: any) {
      console.error(`[secretCrypto] could not decrypt ${label}: ${err?.message}`);
    }
  }
  return plaintext ?? null;
}
