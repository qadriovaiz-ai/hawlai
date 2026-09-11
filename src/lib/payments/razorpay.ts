import crypto from "crypto";

// Razorpay is per-dealership, not a shared platform account — each
// business's customers pay into that business's OWN Razorpay account.
// Every function here takes the business's credentials as a parameter;
// callers get them from loadRazorpayConnection (razorpayConnection.ts),
// never from env.
//
// Two ways a business can be connected, one shape for callers:
//   - Connect Razorpay (OAuth, razorpayOAuth.ts): the owner signs in on
//     Razorpay and approves Hawlai. API calls use a Bearer token; the
//     Checkout.js key is the connection's public_token.
//   - API keys: the older paste-your-keys flow, kept only for servers
//     without a Razorpay partner app. Basic auth; the key id is the
//     Checkout.js key.

export type RazorpayCredentials = {
  method: "oauth" | "keys";
  /** Given to Checkout.js as `key`. Publishable — safe for the browser. */
  checkoutKey: string;
  /** Authorization header for Razorpay's API. Server-only. */
  authorization: string;
};

export function isRazorpayConfigured(keyId: string | null | undefined, keySecret: string | null | undefined): boolean {
  return Boolean(keyId && keySecret);
}

/** Credentials from a Key ID + Key Secret pair, or null when either is missing. */
export function keyCredentials(keyId: string | null | undefined, keySecret: string | null | undefined): RazorpayCredentials | null {
  if (!isRazorpayConfigured(keyId, keySecret)) return null;
  return {
    method: "keys",
    checkoutKey: keyId!,
    authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
  };
}

const NOT_CONNECTED = "Razorpay is not connected for this business yet";

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

export async function createRazorpayOrder(amountInPaise: number, receipt: string, credentials: RazorpayCredentials | null): Promise<RazorpayOrder> {
  if (!credentials) throw new Error(NOT_CONNECTED);

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: credentials.authorization },
    body: JSON.stringify({ amount: amountInPaise, currency: "INR", receipt }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Razorpay order creation failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export type FetchedOrder =
  | { ok: true; order: RazorpayOrder }
  | { ok: false; reason: "not_found" | "unreachable" | "no_connection" };

/**
 * Reads an order back from Razorpay with THIS business's credentials.
 *
 * "not_found" is Razorpay saying no — the order doesn't exist, or
 * belongs to another account, which this business's credentials can't
 * see. "unreachable" is Razorpay not answering after a retry: the
 * payment may well be real, and the caller must not treat it as forged.
 */
export async function fetchRazorpayOrder(orderId: string, credentials: RazorpayCredentials | null): Promise<FetchedOrder> {
  if (!credentials) return { ok: false, reason: "no_connection" };
  if (!/^order_[A-Za-z0-9]+$/.test(orderId)) return { ok: false, reason: "not_found" };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, { headers: { Authorization: credentials.authorization } });
      if (res.ok) return { ok: true, order: await res.json() };
      if (res.status >= 400 && res.status < 500) return { ok: false, reason: "not_found" };
    } catch {
      // network error — retried once below
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, reason: "unreachable" };
}

// Razorpay's Checkout.js success handler returns order id + payment id +
// an HMAC-SHA256 signature of "order_id|payment_id". Recomputing and
// comparing it here is the only way to know a payment is real — the
// handler callback firing on the client proves nothing by itself (it
// can be called with fabricated arguments by anyone with devtools
// open). The key is the business's key secret, or for Connect Razorpay
// the partner app's client secret (loadRazorpayConnection's
// signingSecret).
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
export async function createRazorpayRefund(paymentId: string, amountInPaise: number, credentials: RazorpayCredentials | null): Promise<RazorpayRefund> {
  if (!credentials) throw new Error(NOT_CONNECTED);

  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: credentials.authorization },
    body: JSON.stringify({ amount: amountInPaise }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Razorpay refund failed (${res.status}): ${detail}`);
  }
  return res.json();
}
