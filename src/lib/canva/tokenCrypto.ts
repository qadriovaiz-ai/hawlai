// ------------------------------------------------------------------
// Canva OAuth token encryption.
// ------------------------------------------------------------------
// The implementation moved to lib/crypto/secretCrypto.ts when payment
// and commerce secrets needed the same treatment. This file stays as
// the Canva-facing surface so existing call sites keep working
// unchanged, and so the "canva" key ring is bound in one place rather
// than named at every call.
//
// Behaviour is identical: same AES-256-GCM, same v1: format, same
// CANVA_TOKEN_ENCRYPTION_KEY, same failure modes. Tokens encrypted
// before this refactor decrypt unchanged.
//
// SCOPE, unchanged and still worth stating: this covers Canva only.
// Payment and commerce secrets now have their own ring (see
// secretCrypto.ts); the 14 remaining marketing OAuth columns are still
// plaintext and scheduled separately.
// ------------------------------------------------------------------

import { encryptSecret, decryptSecret, isRingConfigured } from "@/lib/crypto/secretCrypto";

export function encryptToken(plaintext: string): string {
  return encryptSecret(plaintext, "canva");
}

export function decryptToken(payload: string): string {
  return decryptSecret(payload, "canva");
}

/** True when the key is present and usable — lets UI explain a misconfiguration instead of showing a broken connect button. */
export function isTokenCryptoConfigured(): boolean {
  return isRingConfigured("canva");
}
