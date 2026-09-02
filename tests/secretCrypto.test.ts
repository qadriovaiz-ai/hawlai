// Secret encryption at rest — restored from the harnesses written for
// the Canva token work (commit 5f59adc, 14 assertions) and the
// commerce secret work (commit 4b80575, 10 assertions), merged since
// they now cover one shared module.
//
// Also covers R2's explicit ask: round-trip plus the plaintext
// fallback path used during the two-phase cutover.

import { describe, it, expect, beforeAll } from "vitest";

// Distinct keys per ring, so ring isolation is actually testable
// rather than trivially true.
beforeAll(() => {
  process.env.CANVA_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  process.env.COMMERCE_ENCRYPTION_KEY = "b".repeat(64);
});

async function mod() {
  return import("@/lib/crypto/secretCrypto");
}

describe("encrypt / decrypt", () => {
  it("round-trips a value unchanged", async () => {
    const { encryptSecret, decryptSecret } = await mod();
    const secret = "rzp_live_secret_XYZ";
    expect(decryptSecret(encryptSecret(secret, "commerce"), "commerce")).toBe(secret);
  });

  it("round-trips unicode and punctuation", async () => {
    const { encryptSecret, decryptSecret } = await mod();
    const secret = "tok_ñ_₹_日本_!@#$%^&*()";
    expect(decryptSecret(encryptSecret(secret, "canva"), "canva")).toBe(secret);
  });

  it("never leaves the plaintext visible in the ciphertext", async () => {
    const { encryptSecret } = await mod();
    const secret = "sk_live_do_not_leak";
    expect(encryptSecret(secret, "commerce")).not.toContain(secret);
  });

  it("emits the versioned four-part format", async () => {
    const { encryptSecret } = await mod();
    const parts = encryptSecret("x", "commerce").split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("uses a fresh IV per call, so the same input never encrypts alike", async () => {
    const { encryptSecret } = await mod();
    // Reusing an IV under one key breaks GCM outright — this is the
    // assertion that would catch a "cache the cipher" optimisation.
    expect(encryptSecret("same", "commerce")).not.toBe(encryptSecret("same", "commerce"));
  });

  it("refuses to encrypt an empty value", async () => {
    const { encryptSecret } = await mod();
    // An empty secret means an upstream failure — storing it would
    // record a successful-looking connection with no credential.
    expect(() => encryptSecret("", "commerce")).toThrow();
  });
});

describe("tamper and corruption handling", () => {
  it("throws when the ciphertext is altered", async () => {
    const { encryptSecret, decryptSecret } = await mod();
    const parts = encryptSecret("original", "commerce").split(":");
    parts[3] = parts[3].slice(0, -2) + (parts[3].slice(-2) === "AA" ? "BB" : "AA");
    // GCM's auth tag is what makes this fail loudly rather than
    // returning plausible garbage we'd then send as a bearer token.
    expect(() => decryptSecret(parts.join(":"), "commerce")).toThrow();
  });

  it("throws on a malformed payload", async () => {
    const { decryptSecret } = await mod();
    expect(() => decryptSecret("v1:only-two", "commerce")).toThrow();
  });

  it("throws on an unknown format version", async () => {
    const { encryptSecret, decryptSecret } = await mod();
    const parts = encryptSecret("x", "commerce").split(":");
    parts[0] = "v9";
    expect(() => decryptSecret(parts.join(":"), "commerce")).toThrow(/v9/);
  });
});

describe("key ring isolation", () => {
  it("a commerce ciphertext cannot be read with the canva key", async () => {
    const { encryptSecret, decryptSecret } = await mod();
    const payload = encryptSecret("payment-secret", "commerce");
    // This is the entire justification for separate variables: a
    // Canva key rotation must not be able to touch payment secrets.
    expect(() => decryptSecret(payload, "canva")).toThrow();
  });

  it("reports each ring's configuration independently", async () => {
    const { isRingConfigured } = await mod();
    expect(isRingConfigured("canva")).toBe(true);
    expect(isRingConfigured("commerce")).toBe(true);
  });
});

describe("resolveSecret — two-phase cutover", () => {
  it("prefers the encrypted value over a stale plaintext one", async () => {
    const { encryptSecret, resolveSecret } = await mod();
    const current = encryptSecret("current", "commerce");
    expect(resolveSecret(current, "stale", "commerce", "test")).toBe("current");
  });

  it("falls back to plaintext before the backfill has run", async () => {
    const { resolveSecret } = await mod();
    expect(resolveSecret(null, "not-yet-encrypted", "commerce", "test")).toBe("not-yet-encrypted");
  });

  it("falls back to plaintext rather than throwing on a corrupt ciphertext", async () => {
    const { resolveSecret } = await mod();
    // During cutover a bad ciphertext must not break checkout when a
    // working plaintext value is sitting beside it.
    expect(resolveSecret("v1:bad:bad:bad", "working", "commerce", "test")).toBe("working");
  });

  it("returns null when neither column holds anything", async () => {
    const { resolveSecret } = await mod();
    expect(resolveSecret(null, null, "commerce", "test")).toBeNull();
  });
});

describe("key validation", () => {
  it("rejects a key of the wrong length", async () => {
    const { encryptSecret } = await mod();
    const saved = process.env.COMMERCE_ENCRYPTION_KEY;
    process.env.COMMERCE_ENCRYPTION_KEY = "tooshort";
    expect(() => encryptSecret("x", "commerce")).toThrow(/32 bytes/);
    process.env.COMMERCE_ENCRYPTION_KEY = saved;
  });

  it("reports a missing key as unconfigured rather than crashing", async () => {
    const { isRingConfigured } = await mod();
    const saved = process.env.COMMERCE_ENCRYPTION_KEY;
    delete process.env.COMMERCE_ENCRYPTION_KEY;
    expect(isRingConfigured("commerce")).toBe(false);
    process.env.COMMERCE_ENCRYPTION_KEY = saved;
  });
});

// ---- Key rotation (R6) ----
//
// Before this existed, both keys were unrecoverable: changing one
// permanently invalidated everything encrypted under it. These assert
// the property that makes rotation possible — reading under either key
// while writing only under the current one — and the idempotency check
// the re-key script depends on to be safely interruptible.

describe("key rotation", () => {
  const OLD_KEY = "1".repeat(64);
  const NEW_KEY = "2".repeat(64);

  it("reads a value written under the PREVIOUS key", async () => {
    const { encryptSecret, decryptSecret } = await mod();
    process.env.COMMERCE_ENCRYPTION_KEY = OLD_KEY;
    const underOldKey = encryptSecret("legacy-secret", "commerce");

    // Rotation begins: new key current, old key retiring.
    process.env.COMMERCE_ENCRYPTION_KEY = NEW_KEY;
    process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;

    expect(decryptSecret(underOldKey, "commerce")).toBe("legacy-secret");
  });

  it("writes only under the CURRENT key during rotation", async () => {
    const { encryptSecret, decryptSecret, isUnderCurrentKey } = await mod();
    process.env.COMMERCE_ENCRYPTION_KEY = NEW_KEY;
    process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;

    const fresh = encryptSecret("new-secret", "commerce");
    expect(isUnderCurrentKey(fresh, "commerce")).toBe(true);

    // And it must NOT be readable once the old key alone remains —
    // proving it was written with the new one.
    process.env.COMMERCE_ENCRYPTION_KEY = OLD_KEY;
    delete process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS;
    expect(() => decryptSecret(fresh, "commerce")).toThrow();
  });

  it("distinguishes already-migrated values from ones still on the old key", async () => {
    const { encryptSecret, isUnderCurrentKey } = await mod();
    process.env.COMMERCE_ENCRYPTION_KEY = OLD_KEY;
    delete process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS;
    const legacy = encryptSecret("legacy", "commerce");

    process.env.COMMERCE_ENCRYPTION_KEY = NEW_KEY;
    process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;
    const migrated = encryptSecret("migrated", "commerce");

    // This is the re-key script's idempotency check: a re-run must
    // skip what it already did rather than churn every row.
    expect(isUnderCurrentKey(legacy, "commerce")).toBe(false);
    expect(isUnderCurrentKey(migrated, "commerce")).toBe(true);
  });

  it("reports whether a rotation is in progress", async () => {
    const { isRotationInProgress } = await mod();
    process.env.COMMERCE_ENCRYPTION_KEY = NEW_KEY;
    process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;
    expect(isRotationInProgress("commerce")).toBe(true);

    delete process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS;
    expect(isRotationInProgress("commerce")).toBe(false);
  });

  it("still fails on a value encrypted under a THIRD, unknown key", async () => {
    const { encryptSecret, decryptSecret } = await mod();
    process.env.COMMERCE_ENCRYPTION_KEY = "3".repeat(64);
    delete process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS;
    const stranger = encryptSecret("stranger", "commerce");

    process.env.COMMERCE_ENCRYPTION_KEY = NEW_KEY;
    process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;
    // Trying two keys must not become "accept anything".
    expect(() => decryptSecret(stranger, "commerce")).toThrow();
  });

  it("keeps the rings independent during rotation", async () => {
    const { encryptSecret, decryptSecret } = await mod();
    process.env.COMMERCE_ENCRYPTION_KEY = NEW_KEY;
    process.env.COMMERCE_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;
    const commerceValue = encryptSecret("commerce-only", "commerce");
    // Rotating commerce must not make canva able to read its values.
    expect(() => decryptSecret(commerceValue, "canva")).toThrow();
  });
});
