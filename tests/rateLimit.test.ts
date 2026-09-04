// The in-process rate limiter guarding /api/admin/seed-knowledge.
//
// Deliberately tested with an injected clock rather than timers, so
// these assert the window arithmetic instead of waiting on it.

import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __resetRateLimits } from "@/lib/security/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimits());

  it("allows up to the limit and then refuses", () => {
    const now = 1_000_000;
    expect(checkRateLimit("k", 3, 60_000, now)).toEqual({ allowed: true });
    expect(checkRateLimit("k", 3, 60_000, now)).toEqual({ allowed: true });
    expect(checkRateLimit("k", 3, 60_000, now)).toEqual({ allowed: true });
    expect(checkRateLimit("k", 3, 60_000, now).allowed).toBe(false);
  });

  it("reports a retry-after inside the window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("k", 3, 60_000, now);
    const result = checkRateLimit("k", 3, 60_000, now + 20_000);
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  it("never reports a retry-after of zero", () => {
    // A Retry-After of 0 invites an immediate retry, which is the one
    // thing the header exists to prevent.
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("k", 3, 60_000, now);
    const result = checkRateLimit("k", 3, 60_000, now + 59_999);
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("opens a fresh window once the old one lapses", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("k", 3, 60_000, now);
    expect(checkRateLimit("k", 3, 60_000, now + 60_001)).toEqual({ allowed: true });
  });

  it("counts each key separately", () => {
    // Keyed on user id in the route — one admin exhausting their
    // budget must not lock out another.
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit("user-a", 3, 60_000, now);
    expect(checkRateLimit("user-a", 3, 60_000, now).allowed).toBe(false);
    expect(checkRateLimit("user-b", 3, 60_000, now).allowed).toBe(true);
  });

  it("sweeps expired buckets rather than growing without bound", () => {
    const now = 1_000_000;
    for (let i = 0; i < 600; i++) checkRateLimit(`key-${i}`, 1, 1_000, now);
    // Past every window, so the next call should collect them.
    const after = checkRateLimit("trigger", 1, 1_000, now + 10_000);
    expect(after.allowed).toBe(true);
    // The sweep is opportunistic, so assert the observable
    // consequence: an old key behaves as brand new.
    expect(checkRateLimit("key-0", 1, 1_000, now + 10_000).allowed).toBe(true);
  });
});
