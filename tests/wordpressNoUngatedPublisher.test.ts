// WordPress has no publisher outside the approval registry.
//
// WHAT WAS DELETED, 22 November 2026, at the owner's instruction while
// sizing the WordPress work. `publishWordPressPost` lived in
// src/lib/agents/wordpressAgent.ts with ZERO callers and had never run.
// It POSTed to /wp-json/wp/v2/posts on a live site with:
//
//   no approval record, no preview, no claims check,
//   no staleness re-read, no idempotency key
//
// — every protection this codebase has for a public-facing write,
// absent. It was not a Rule 6 violation, because nothing called it.
// It was worse: a working publisher one import away from a chat tool,
// sitting in the file anyone building WordPress support would open
// first. The deletion is the point of this file; the assertions keep
// it deleted.
//
// WHY A TEST RATHER THAN TRUST. `tests/approvalCoverage.test.ts` fails
// for anything new that reaches a sender directly — but it reads the
// senders it knows about, and a function with no callers reaches
// nothing, so it was invisible there. This file asserts the ABSENCE,
// which is the only thing that survives a helpful re-addition.
//
// THE REPLACEMENT IS NOT A FUNCTION HERE. WordPress publishing goes
// through the PublishPlatform contract: preview reads, execute
// re-reads and compares against the approved before-value, undo
// proposes rather than writes, and the approval row records what was
// agreed. See docs/RESEARCH-WOO-WP.md.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments } from "./helpers/source";
import * as wordpressAgent from "@/lib/agents/wordpressAgent";

const AGENT = "src/lib/agents/wordpressAgent.ts";

describe("1. THE AGENT CANNOT WRITE TO A WORDPRESS SITE", () => {
  it("THE LOAD-BEARING ONE: it issues no mutating HTTP method at all", () => {
    // Asserted on the CODE, comments stripped: this file's header
    // quotes the deleted function's own `method: "POST"` while
    // explaining why it is gone, and rule 8 is explicit that a grep is
    // defeated by a comment about the thing it looks for.
    const src = code(AGENT);
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(src, `the WordPress agent issues a ${verb}`).not.toMatch(
        new RegExp(`method\\s*:\\s*["'\`]${verb}`, "i")
      );
    }
  });

  it("and it exports exactly one function, which only reads", () => {
    // THE REAL MODULE, not its source — a source grep cannot see a
    // function re-exported from somewhere else, and this is the
    // assertion that holds whatever shape a re-addition takes.
    const exported = Object.keys(wordpressAgent).filter(
      (k) => typeof (wordpressAgent as any)[k] === "function"
    );
    expect(exported).toEqual(["testWordPressConnection"]);
  });

  it("NO PUBLISHER BY ANY NAME, because the next one will not be called publishWordPressPost", () => {
    // A rename is the obvious way this comes back. The property is
    // "nothing here publishes", not "this one identifier is absent".
    const exported = Object.keys(wordpressAgent);
    const writers = exported.filter((k) => /publish|create|update|post|write|send|delete/i.test(k));
    expect(writers, `these look like writers: ${writers.join(", ")}`).toEqual([]);
  });

  it("the connection test really is a read, and really is still here", () => {
    // Not vacuous: the file still has a job, and deleting the whole
    // module would otherwise satisfy every assertion above.
    expect(typeof wordpressAgent.testWordPressConnection).toBe("function");
    const src = code(AGENT);
    expect(src).toMatch(/wp-json\/wp\/v2\/users\/me/);
    expect(src).toMatch(/Authorization: `Basic \$\{auth\}`/);
  });
});

describe("2. NOTHING ANYWHERE ELSE WRITES TO WORDPRESS EITHER", () => {
  it("THE LOAD-BEARING ONE: wordpress has no entry in the platform registry", () => {
    // The registry is the only route to a write, and its own comment
    // says why wordpress is absent: "a stub would make the executor
    // claim success on a publish that never happened".
    const registry = code("src/lib/publish/registry.ts");
    const body = registry.slice(registry.indexOf("return {"), registry.indexOf("};", registry.indexOf("return {")));
    expect(body.length).toBeGreaterThan(50);
    expect(body).not.toMatch(/\bwordpress\s*:/);
    expect(body).not.toMatch(/\bwoocommerce\s*:/);
  });

  it("and no producer creates a wordpress action", () => {
    // createPublishAction with "wordpress" would reach approval and
    // then die in the executor, AFTER the owner had said yes. That is
    // the failure the registry comment records for "meta".
    const src = code("src/lib/agents/masterBrainV2.ts");
    expect(src).not.toMatch(/platform:\s*["']wordpress["']/);
  });
});

describe("3. THE DELETION IS RECORDED, so the next reader does not restore it", () => {
  it("the file says what was removed and why", () => {
    // Read WITH comments deliberately — this codebase records the dated
    // incident behind each guard, and here the record IS the guard: a
    // bare absence invites a helpful re-addition.
    const withComments = sourceWithComments(AGENT);
    expect(withComments).toMatch(/publishWordPressPost/);
    expect(withComments).toMatch(/ZERO callers/);
    expect(withComments).toMatch(/PublishPlatform/);
    expect(withComments).toMatch(/RESEARCH-WOO-WP/);
  });
});
