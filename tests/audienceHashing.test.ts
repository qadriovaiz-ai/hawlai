// Audience hashing for Meta customer-list uploads.
//
// NOT a verbatim restoration — the original harness (retargeting piece
// 1) was written in an earlier session and deleted, so this is
// equivalent coverage derived from the module's current behaviour.
// The behaviours asserted are the ones the original was written to
// protect: normalisation before hashing, suppression on normalised
// values, and no plaintext PII in the output.

import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  normalizePhone,
  normalizeEmail,
  sha256,
  hashPhone,
  hashEmail,
  isSuppressed,
  buildHashedAudienceCsv,
} from "@/lib/ads/audienceHashing";

const suppression = { phones: new Set<string>(), emails: new Set<string>() };

describe("phone normalisation", () => {
  it("prepends the country code to a bare 10-digit Indian number", () => {
    expect(normalizePhone("9876543210")).toBe("919876543210");
  });

  it("strips the 00 international prefix", () => {
    expect(normalizePhone("00919876543210")).toBe("919876543210");
  });

  it("strips a domestic trunk 0", () => {
    expect(normalizePhone("09876543210")).toBe("919876543210");
  });

  it("keeps an already-normalised number unchanged", () => {
    expect(normalizePhone("919876543210")).toBe("919876543210");
  });

  it("ignores punctuation and spacing", () => {
    // The same person typed four ways must produce ONE hash, or the
    // match rate silently drops instead of erroring.
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
    expect(normalizePhone("(+91) 98765 43210")).toBe("919876543210");
  });

  it("rejects a number too short to be real", () => {
    expect(normalizePhone("12345")).toBeNull();
  });

  it("rejects null, undefined and non-numeric input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });
});

describe("email normalisation", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("rejects a value with no @", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("hashing", () => {
  it("produces a SHA-256 hex digest matching an independent computation", () => {
    expect(sha256("abc")).toBe(crypto.createHash("sha256").update("abc", "utf8").digest("hex"));
  });

  it("hashes the NORMALISED value, not the raw input", () => {
    // This is the assertion that matters: hashing raw input would
    // produce different hashes for the same person and Meta would
    // match neither.
    expect(hashPhone("+91 98765-43210")).toBe(sha256("919876543210"));
    expect(hashEmail("  Owner@Example.COM ")).toBe(sha256("owner@example.com"));
  });

  it("returns null rather than hashing an unusable value", () => {
    expect(hashPhone("123")).toBeNull();
    expect(hashEmail("nope")).toBeNull();
  });
});

describe("suppression", () => {
  it("matches on the normalised phone, however the input was formatted", () => {
    const list = { phones: new Set(["919876543210"]), emails: new Set<string>() };
    // The same person appears across leads/orders/carts with
    // inconsistent formatting — suppression has to survive that or a
    // DND opt-out silently fails to apply.
    expect(isSuppressed(list, "+91 98765 43210", null)).toBe(true);
    expect(isSuppressed(list, "09876543210", null)).toBe(true);
  });

  it("matches on the normalised email", () => {
    const list = { phones: new Set<string>(), emails: new Set(["owner@example.com"]) };
    expect(isSuppressed(list, null, "Owner@EXAMPLE.com")).toBe(true);
  });

  it("does not suppress an unrelated contact", () => {
    const list = { phones: new Set(["919876543210"]), emails: new Set<string>() };
    expect(isSuppressed(list, "919999999999", null)).toBe(false);
  });
});

describe("CSV export", () => {
  it("emits only the hashed phone and email columns", () => {
    const { csv } = buildHashedAudienceCsv([{ phone: "9876543210", email: "a@b.com" }], suppression);
    expect(csv.split("\n")[0]).toBe("phone,email");
  });

  it("contains no plaintext contact details anywhere", () => {
    const { csv } = buildHashedAudienceCsv(
      [{ phone: "9876543210", email: "owner@example.com" }],
      suppression
    );
    // The export used to include a plaintext name column. This is the
    // regression guard: the file must never be a readable PII list.
    expect(csv).not.toContain("9876543210");
    expect(csv).not.toContain("owner@example.com");
    expect(csv).toContain(sha256("919876543210"));
  });

  it("counts and excludes suppressed contacts", () => {
    const list = { phones: new Set([`919876543210`]), emails: new Set<string>() };
    const result = buildHashedAudienceCsv(
      [{ phone: "9876543210" }, { phone: "919999999999" }],
      list
    );
    expect(result.suppressed).toBe(1);
    expect(result.included).toBe(1);
  });

  it("counts rows that have no contact detail at all", () => {
    const result = buildHashedAudienceCsv([{ phone: null, email: null }], suppression);
    expect(result.skippedNoContact).toBe(1);
    expect(result.included).toBe(0);
  });

  it("does not include the same person twice", () => {
    const result = buildHashedAudienceCsv(
      [{ phone: "9876543210" }, { phone: "+91 98765 43210" }],
      suppression
    );
    // Two spellings of one number are one person; a duplicate would
    // inflate the audience size Meta reports back.
    expect(result.included).toBe(1);
  });
});
