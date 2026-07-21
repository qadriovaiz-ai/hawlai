import crypto from "crypto";

// Razorpay is optional and off by default — it activates automatically
// the moment RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set in the
// environment. Callers must check isRazorpayConfigured() before offering
// "Pay Online" so the storefront falls back to Cash on Delivery cleanly
// when no Razorpay account is connected yet.
export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

export async function createRazorpayOrder(amountInPaise: number, receipt: string): Promise<RazorpayOrder> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured");

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: amountInPaise, currency: "INR", receipt }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Razorpay order creation failed (${res.status}): ${detail}`);
  }
  return res.json();
}

// Razorpay's Checkout.js success handler returns order id + payment id +
// an HMAC-SHA256 signature of "order_id|payment_id" keyed with the
// account's key secret. Recomputing and comparing it here is the only
// way to know a payment is real — the handler callback firing on the
// client proves nothing by itself (it can be called with fabricated
// arguments by anyone with devtools open).
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret || !orderId || !paymentId || !signature) return false;

  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
