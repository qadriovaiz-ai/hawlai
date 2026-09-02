// Onboarding-state resolution — regression cover for the blank
// dashboard incident.
//
// The bug: /dashboard/page and /chat/layout redirect at each other,
// and read `onboarding_completed` through two different query shapes.
// When those disagreed the result was an infinite redirect that
// Next.js resolved through RSC navigation, so the browser never
// tripped ERR_TOO_MANY_REDIRECTS — it looped silently until the
// connection pool was saturated and every request sat pending.
//
// The assertion that matters most is "indeterminate never redirects".
// Failing open shows a slightly wrong screen; failing closed made the
// product unusable, and only one of those is recoverable by the person
// using it.

import { describe, it, expect } from "vitest";
import { resolveOnboardingState, shouldSendToOnboarding } from "@/lib/onboardingState";

/** Minimal stub of the two chained selects the resolver makes. */
function fakeDb(profile: any, dealership: any, opts: { dealershipError?: string } = {}) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () =>
                  table === "profiles"
                    ? { data: profile, error: null }
                    : { data: dealership, error: opts.dealershipError ? { message: opts.dealershipError } : null },
              };
            },
          };
        },
      };
    },
  } as any;
}

describe("completed onboarding", () => {
  it("reports complete and does not send to onboarding", async () => {
    const state = await resolveOnboardingState(
      fakeDb({ dealership_id: "d1", full_name: "Ovaiz" }, { dealership_name: "Acme", onboarding_completed: true }),
      "u1"
    );
    expect(state.onboardingCompleted).toBe(true);
    expect(state.indeterminate).toBe(false);
    expect(shouldSendToOnboarding(state)).toBe(false);
  });

  it("carries the dealership and owner name through", async () => {
    const state = await resolveOnboardingState(
      fakeDb({ dealership_id: "d1", full_name: "Ovaiz" }, { dealership_name: "Acme", onboarding_completed: true }),
      "u1"
    );
    expect(state.dealershipName).toBe("Acme");
    expect(state.ownerName).toBe("Ovaiz");
  });
});

describe("incomplete onboarding", () => {
  it("reports incomplete and sends to onboarding", async () => {
    const state = await resolveOnboardingState(
      fakeDb({ dealership_id: "d1", full_name: null }, { dealership_name: "Acme", onboarding_completed: false }),
      "u1"
    );
    expect(state.onboardingCompleted).toBe(false);
    expect(shouldSendToOnboarding(state)).toBe(true);
  });

  it("treats a null flag as incomplete", async () => {
    const state = await resolveOnboardingState(
      fakeDb({ dealership_id: "d1" }, { dealership_name: "Acme", onboarding_completed: null }),
      "u1"
    );
    expect(shouldSendToOnboarding(state)).toBe(true);
  });
});

describe("inconclusive reads NEVER redirect", () => {
  it("does not send to onboarding when the dealership row cannot be read", async () => {
    // THE regression guard. A failed read used to be indistinguishable
    // from "incomplete", which is what let /chat bounce a fully
    // onboarded user back to /dashboard forever.
    const state = await resolveOnboardingState(fakeDb({ dealership_id: "d1" }, null), "u1");
    expect(state.indeterminate).toBe(true);
    expect(state.onboardingCompleted).toBe(true);
    expect(shouldSendToOnboarding(state)).toBe(false);
  });

  it("does not send to onboarding when the query errors", async () => {
    const state = await resolveOnboardingState(
      fakeDb({ dealership_id: "d1" }, null, { dealershipError: "permission denied" }),
      "u1"
    );
    expect(state.indeterminate).toBe(true);
    expect(shouldSendToOnboarding(state)).toBe(false);
  });

  it("does not send to onboarding when there is no dealership at all", async () => {
    const state = await resolveOnboardingState(fakeDb({ dealership_id: null }, null), "u1");
    expect(state.dealershipId).toBeNull();
    expect(shouldSendToOnboarding(state)).toBe(false);
  });

  it("does not send to onboarding when the profile is missing", async () => {
    const state = await resolveOnboardingState(fakeDb(null, null), "u1");
    expect(state.indeterminate).toBe(true);
    expect(shouldSendToOnboarding(state)).toBe(false);
  });
});

describe("both ends of the redirect pair agree", () => {
  it("gives the SAME answer for the same user, every time", async () => {
    // /dashboard/page and /chat/layout both call this. The loop was
    // only possible because they computed it separately; identical
    // input must give identical output or the loop is back.
    const db = () => fakeDb({ dealership_id: "d1" }, { dealership_name: "Acme", onboarding_completed: true });
    const a = await resolveOnboardingState(db(), "u1");
    const b = await resolveOnboardingState(db(), "u1");
    expect(shouldSendToOnboarding(a)).toBe(shouldSendToOnboarding(b));
    expect(a).toEqual(b);
  });
});
