// Razorpay payment verification — R2.3 revenue-path coverage.
//
// WHAT THESE COVER: signature verification, which is the control that
// decides whether an order is marked paid. A break here either accepts
// forged payments or rejects real ones, and both cost money directly.
//
// WHAT THESE DO NOT COVER: createRazorpayOrder and createRazorpayRefund
// make live HTTP calls to Razorpay and are not exercised. Nor is the
// route handler around verification (/api/public/orders/verify-payment)
// — its Supabase and pricing dependencies would need a mocked database,
// and a mock that agrees with my assumptions would prove little. The
// verification function itself is the part worth pinning down.

import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyRazorpaySignature, isRazorpayConfigured } from "@/lib/payments/razorpay";

const SECRET = "test_secret_key";
const ORDER = "order_ABC123";
const PAYMENT = "pay_XYZ789";

/** How Razorpay signs a successful payment: HMAC-SHA256 over "orderId|paymentId". */
function sign(orderId: string, paymentId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

describe("signature verification", () => {
  it("accepts a correctly signed payment", () => {
    expect(verifyRazorpaySignature(ORDER, PAYMENT, sign(ORDER, PAYMENT, SECRET), SECRET)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    // The core forgery case: someone who knows the order and payment
    // ids but not the merchant's secret.
    expect(verifyRazorpaySignature(ORDER, PAYMENT, sign(ORDER, PAYMENT, "wrong_secret"), SECRET)).toBe(false);
  });

  it("rejects a signature bound to a different order", () => {
    // Replaying a valid signature from one order onto another.
    expect(verifyRazorpaySignature(ORDER, PAYMENT, sign("order_OTHER", PAYMENT, SECRET), SECRET)).toBe(false);
  });

  it("rejects a signature bound to a different payment", () => {
    expect(verifyRazorpaySignature(ORDER, PAYMENT, sign(ORDER, "pay_OTHER", SECRET), SECRET)).toBe(false);
  });

  it("rejects a tampered signature of the correct length", () => {
    const valid = sign(ORDER, PAYMENT, SECRET);
    const tampered = valid.slice(0, -1) + (valid.endsWith("a") ? "b" : "a");
    expect(verifyRazorpaySignature(ORDER, PAYMENT, tampered, SECRET)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyRazorpaySignature(ORDER, PAYMENT, "", SECRET)).toBe(false);
  });

  it("rejects when the merchant has no secret configured", () => {
    // This is the one that matters after the R1 encryption change: if
    // resolveSecret returns null because neither column holds a value,
    // verification must FAIL CLOSED rather than treating an absent
    // secret as a pass.
    expect(verifyRazorpaySignature(ORDER, PAYMENT, sign(ORDER, PAYMENT, SECRET), null)).toBe(false);
    expect(verifyRazorpaySignature(ORDER, PAYMENT, sign(ORDER, PAYMENT, SECRET), undefined)).toBe(false);
    expect(verifyRazorpaySignature(ORDER, PAYMENT, sign(ORDER, PAYMENT, SECRET), "")).toBe(false);
  });

  it("rejects a missing order or payment id", () => {
    const sig = sign(ORDER, PAYMENT, SECRET);
    expect(verifyRazorpaySignature("", PAYMENT, sig, SECRET)).toBe(false);
    expect(verifyRazorpaySignature(ORDER, "", sig, SECRET)).toBe(false);
  });

  it("does not throw on a signature of unexpected length", () => {
    // timingSafeEqual throws when buffer lengths differ, so the length
    // check before it is load-bearing — without it a short signature
    // crashes the route instead of returning false.
    expect(() => verifyRazorpaySignature(ORDER, PAYMENT, "abc", SECRET)).not.toThrow();
    expect(verifyRazorpaySignature(ORDER, PAYMENT, "abc", SECRET)).toBe(false);
  });

  it("is not fooled by a signature that differs only in case", () => {
    expect(verifyRazorpaySignature(ORDER, PAYMENT, sign(ORDER, PAYMENT, SECRET).toUpperCase(), SECRET)).toBe(false);
  });
});

describe("configuration check", () => {
  it("requires both key id and secret", () => {
    expect(isRazorpayConfigured("key", "secret")).toBe(true);
    expect(isRazorpayConfigured("key", null)).toBe(false);
    expect(isRazorpayConfigured(null, "secret")).toBe(false);
    expect(isRazorpayConfigured(null, null)).toBe(false);
  });

  it("treats empty strings as unconfigured", () => {
    // A blank credential is what a half-finished settings save leaves
    // behind; offering "Pay Online" on that would fail at checkout.
    expect(isRazorpayConfigured("", "")).toBe(false);
    expect(isRazorpayConfigured("key", "")).toBe(false);
  });
});
