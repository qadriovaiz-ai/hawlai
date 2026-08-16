import crypto from "crypto";

// Razorpay is per-dealership, not a shared platform account — each
// business connects their OWN Key ID + Key Secret (from their own
// Razorpay account) so their customers' payments settle directly into
// their own bank account, not into whichever account happens to be in
// the platform's env vars. Every function here takes credentials as
// parameters; callers are responsible for fetching the right
// dealership's own keys first.

export function isRazorpayConfigured(keyId: string | null | undefined, keySecret: string | null | undefined): boolean {
  return Boolean(keyId && keySecret);
}

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

export async function createRazorpayOrder(amountInPaise: number, receipt: string, keyId: string, keySecret: string): Promise<RazorpayOrder> {
  if (!keyId || !keySecret) throw new Error("Razorpay is not connected for this business yet");

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
// arguments by anyone with devtools open). Must be checked against the
// SAME dealership's key secret that created the order, or a payment
// to Dealership A's Razorpay account could be spoofed as paying for
// Dealership B's order.
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, keySecret: string | null | undefined): boolean {
  if (!keySecret || !orderId || !paymentId || !signature) return false;

  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

// The one place real money moves for a refund. Deliberately has no
// caller anywhere except the dashboard's human-approval action
// (/api/refunds PATCH, action: "approve") — the live-call refund tool
// only ever inserts a refund_requests row, never reaches this
// function directly. amountInPaise, not rupees, matching
// createRazorpayOrder's existing convention.
export async function createRazorpayRefund(paymentId: string, amountInPaise: number, keyId: string, keySecret: string): Promise<RazorpayRefund> {
  if (!keyId || !keySecret) throw new Error("Razorpay is not connected for this business yet");

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: amountInPaise }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Razorpay refund failed (${res.status}): ${detail}`);
  }
  return res.json();
}
