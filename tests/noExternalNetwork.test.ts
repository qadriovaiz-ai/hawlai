// The suite does not talk to the internet, and that is enforced.
//
// WHY, found 21 November 2026. Three tests in adLaunchPaused failed at
// ~15 seconds each and passed in isolation. The founder refused to let
// that be "noted", which was right: a flaky test means either a race
// in the test or a race in the code, and the answer here was neither.
//
// A fetch that refused and named the URL found it in one run — the
// suite was making REAL calls to graph.facebook.com, 110 of them in a
// full run (69 for a page, 41 for an ad account). The ids are fakes,
// so Meta normally rejects them in a few hundred milliseconds and
// nobody noticed. Under load, or on a slow DNS answer, the same call
// takes fifteen seconds and the test times out.
//
// Not a race. The public internet on the critical path of a unit test.
//
// LOOPBACK IS DELIBERATELY ALLOWED. The no-self-calls tests start a
// real local HTTP server to prove a route does not call its own app —
// the Vercel 508 chain. Blocking everything broke five tests that were
// right, which is how the allowance earned its place.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

describe("the network guard is installed and does its job", () => {
  it("THE LOAD-BEARING ONE: an external host is refused", async () => {
    // Refused rather than slow: the whole point. If this ever starts
    // hanging instead of throwing, the guard is gone.
    await expect(fetch("https://graph.facebook.com/v23.0/act_999")).rejects.toThrow(
      /does not talk to the internet/i
    );
  });

  it("and it names the host, so the offending call can be found", async () => {
    await expect(fetch("https://example.com/whatever")).rejects.toThrow(/example\.com/);
  });

  it("it refuses a Request object too, not only a string", async () => {
    // The launch path builds Requests; a guard that only read strings
    // would have missed exactly the calls it was written for.
    await expect(fetch(new Request("https://graph.facebook.com/v23.0/page_1"))).rejects.toThrow(
      /does not talk to the internet/i
    );
  });

  it("LOOPBACK IS ALLOWED, because the no-self-calls tests need a socket", async () => {
    // Not asserted by making a call — there is nothing listening. What
    // matters is that the guard does not REFUSE it, so the error must
    // be a connection failure rather than the guard's message.
    const err = await fetch("http://127.0.0.1:9/nothing").catch((e) => e);
    expect(String(err?.message ?? err)).not.toMatch(/does not talk to the internet/i);
  });

  it("a relative URL is left alone", async () => {
    // Nothing leaves the process, and refusing it would break tests
    // that never make a real request.
    const err = await fetch("/api/something").catch((e) => e);
    expect(String(err?.message ?? err)).not.toMatch(/does not talk to the internet/i);
  });

  it("IT IS REGISTERED IN THE CONFIG, or none of the above runs", () => {
    // A setup file nobody loads is the registry bug in another coat:
    // the module exists, the behaviour does not.
    //
    // THROUGH code(), because sourceGrepDiscipline caught the first
    // version reading these files raw — and it was right to. A comment
    // in the config naming this path would have satisfied a raw grep
    // while the file was not registered at all, which is precisely the
    // shape rule 8 exists about.
    expect(code("vitest.config.mts")).toMatch(/setupFiles[^\]]*noExternalNetwork\.ts/);
  });

  it("and it is installed per test, so a file that stubs fetch cannot disarm it", () => {
    // Installed in beforeEach rather than once at import: a file that
    // replaces globalThis.fetch and restores the original afterwards
    // would otherwise leave every later file unguarded.
    expect(code("tests/setup/noExternalNetwork.ts")).toMatch(/beforeEach\(\(\) => \{/);
  });
});
