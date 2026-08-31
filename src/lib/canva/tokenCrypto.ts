// ------------------------------------------------------------------
// AES-256-GCM encryption for stored Canva OAuth tokens.
// ------------------------------------------------------------------
// SCOPE, stated plainly: this covers Canva only. The seven OAuth
// providers already in the app (LinkedIn, Gmail, Google Ads, Pinterest,
// Snapchat, YouTube) still write their tokens to plaintext columns.
// Retrofitting them is a separate, agreed piece of work that has NOT
// been done — nobody should read this file and conclude the app's
// tokens are encrypted generally.
//
// GCM rather than CBC because it is authenticated: tampering with the
// stored string makes decryption throw instead of silently returning
// wrong bytes that then get sent to Canva as a bearer token.
//
// The key lives in the environment, not the database, so a dump of the
// canva_connections table alone yields nothing usable. That is the
// whole security benefit here and it's worth being precise about: it
// does NOT protect against an attacker who can read the running
// server's environment.
// ------------------------------------------------------------------

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit nonce, the size GCM is specified for
const VERSION = "v1";

/**
 * Reads and validates the key at call time rather than module load.
 *
 * Module-load validation would crash the entire app on boot if the key
 * were missing — including every page that has nothing to do with
 * Canva. Failing here instead means a missing key breaks Canva and
 * only Canva.
 */
function getKey(): Buffer {
  const raw = process.env.CANVA_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("CANVA_TOKEN_ENCRYPTION_KEY is not set — Canva tokens cannot be stored or read.");
  }

  // Accepts hex or base64 so whoever sets it can paste whatever their
  // key generator produced, rather than guessing an encoding.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CANVA_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). Generate one with: openssl rand -hex 32`
    );
  }
  return key;
}

/**
 * Encrypts a token into a single self-describing string:
 *   v1:<iv>:<authTag>:<ciphertext>   (each part base64)
 *
 * The version prefix exists so a future key rotation or algorithm
 * change can be detected on read instead of failing as corrupt data.
 * A fresh random IV per call is mandatory — reusing one under the same
 * key is the classic way to break GCM outright.
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) throw new Error("Refusing to encrypt an empty token — this indicates a failed OAuth response.");

  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Reverses encryptToken. Throws on a tampered or truncated value
 * rather than returning anything — a corrupted token must surface as
 * "reconnect Canva", never as a silent auth failure against Canva's
 * API that looks like their outage.
 */
export function decryptToken(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4) {
    throw new Error("Stored Canva token is malformed — the connection needs to be re-established.");
  }

  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Stored Canva token uses unknown format "${version}" — the connection needs to be re-established.`);
  }

  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  // .final() is what verifies the auth tag, so this throws on any
  // tampering. Deliberately not caught here.
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** True when the key is present and usable — lets UI explain a misconfiguration instead of showing a broken connect button. */
export function isTokenCryptoConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
