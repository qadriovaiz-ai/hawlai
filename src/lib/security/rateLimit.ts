// A small in-process rate limiter.
//
// WHAT THIS HONESTLY IS, so nobody mistakes it for more. State lives
// in a Map in one server instance's memory. On Vercel that means:
//
//   - it is per-instance, so N warm instances allow N times the limit;
//   - it resets whenever an instance is recycled or scaled to zero;
//   - it is not shared between regions.
//
// So it is a SPEED BUMP, not an access control. It is the right tool
// for "stop a loop from hammering an expensive endpoint" and the wrong
// tool for "this is what keeps attackers out" — anything relying on
// the latter needs a shared store (Postgres or Redis) instead.
//
// It is used here rather than a shared store because the endpoint it
// guards is already behind a platform-admin session AND a shared
// secret. The limiter exists to stop repeat expensive runs, not to be
// the thing standing between a stranger and the data.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Fixed-window limiter.
 *
 * @param key      what to count against — a user id, not an IP, wherever
 *                 a session exists. IPs are shared and spoofable.
 * @param limit    permitted requests per window
 * @param windowMs window length
 */
export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  // Opportunistic sweep. Without it the Map grows for the life of the
  // instance — slow, but a genuine leak on a long-lived process.
  if (buckets.size > 500) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { allowed: true };
}

/** Test seam. Never call this from a route. */
export function __resetRateLimits() {
  buckets.clear();
}
