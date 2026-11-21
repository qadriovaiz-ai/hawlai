// The test suite does not talk to the internet.
//
// WHY THIS EXISTS, found 21 November 2026 after the founder refused to
// let a flaky test be "noted". Three tests in adLaunchPaused were
// failing at ~15 seconds each and passing in isolation. A fetch that
// refused and named the URL found the cause in one run:
//
//   GET https://graph.facebook.com/v23.0/act_999
//   GET https://graph.facebook.com/v23.0/page_1
//
// REAL CALLS TO A THIRD PARTY, 110 of them in one full run — 69 for
// the page and 41 for the account. The ids are fakes, so Meta normally
// rejects them in a few hundred milliseconds and nobody noticed. Under
// load, or on a slow DNS answer, the same call takes fifteen seconds
// and the test times out. That is the whole of the flakiness: not a
// race in the code, not a race in the test, just the public internet
// on the critical path of a unit test.
//
// Two things were wrong with it beyond the flakiness. The suite was
// sending a hundred-odd invalid requests to someone else's API on
// every run, which is rude at best. And a green suite was reporting on
// a code path whose network leg had never actually been exercised
// deliberately — the calls were incidental, and every assertion passes
// with them blocked.
//
// WHAT IS ALLOWED, and why it is not simply "nothing": the
// no-self-calls tests (Vercel 508, see docs) start a REAL local HTTP
// server and assert that a route does not call its own app. That is
// the one thing in this suite that genuinely needs a socket, and it is
// loopback. Blocking it broke five tests that were right.
//
// So: loopback is allowed, everything else throws with the URL in the
// message. A test that needs an external response mocks it, which is
// what the other four hundred files already do.

import { beforeEach } from "vitest";

const LOOPBACK = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/i;

/** The host of whatever shape fetch was handed. */
function hostOf(input: unknown): string | null {
  try {
    if (typeof input === "string") return new URL(input).hostname;
    const url = (input as any)?.url ?? (input as any)?.href;
    return url ? new URL(String(url)).hostname : null;
  } catch {
    // Not a URL we can read — a relative path, or a Request built from
    // one. Nothing to block, and refusing it would break tests that
    // never leave the process.
    return null;
  }
}

const realFetch = globalThis.fetch;

/**
 * Installed fresh for each test, because a file that stubs
 * `globalThis.fetch` itself and restores it afterwards would otherwise
 * leave the next file unguarded.
 */
beforeEach(() => {
  globalThis.fetch = (async (input: any, init?: any) => {
    const host = hostOf(input);
    if (host && !LOOPBACK.test(host)) {
      const method = init?.method ?? (input as any)?.method ?? "GET";
      throw new Error(
        `The test suite does not talk to the internet, and something just tried: ${method} ${host}.\n` +
          `Mock it in the test file — vi.mock the module, or pass a fetchImpl. See tests/setup/noExternalNetwork.ts for why.\n` +
          `(Loopback is allowed, for the no-self-calls tests that start a real local server.)`
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;
});
