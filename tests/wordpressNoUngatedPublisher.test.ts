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
  it("THE LOAD-BEARING ONE: the only route to a WordPress write is the registry", () => {
    // THIS ASSERTED THE OPPOSITE UNTIL 22 NOVEMBER 2026 — that
    // wordpress had NO registry entry — and that was right while there
    // was no adapter: a registry entry with no producer is unreachable
    // code that looks wired.
    //
    // What this file protects has not changed. It was never "WordPress
    // must not be reachable"; it was "WordPress must not be writable
    // WITHOUT an approval". A registry entry is the gated route — the
    // executor only reaches it through an approved publish_action, with
    // a preview, a staleness re-read and an undo. The deleted function
    // was the ungated one.
    //
    // So the assertion moves from "no entry" to "the entry is the ONLY
    // way", which is the property that actually matters.
    const registry = code("src/lib/publish/registry.ts");
    const body = registry.slice(registry.indexOf("return {"), registry.indexOf("};", registry.indexOf("return {")));
    expect(body.length).toBeGreaterThan(50);
    expect(body, "wordpress must be registered, or a producer reaches approval and then dies in the executor").toMatch(
      /\bwordpress:\s*createWordPressPlatform\(/
    );
    // woocommerce still has no adapter and no producer.
    expect(body).not.toMatch(/\bwoocommerce\s*:/);
  });

  it("and every WordPress write goes through an approval, never a direct call", () => {
    // createPublishAction is the gate: it writes the publish_action
    // row the owner approves. A producer that called the adapter's
    // execute() directly would skip the card entirely, which is what
    // the deleted publishWordPressPost did in spirit.
    const src = code("src/lib/agents/masterBrainV2.ts");
    const wordpressActions = [...src.matchAll(/platform:\s*"wordpress"/g)];
    expect(wordpressActions.length, "nothing produces a WordPress action any more").toBeGreaterThan(0);

    // THE ADAPTER IS ONLY EVER HANDED TO createPublishAction, never
    // driven by the chat itself. `createWordPressPlatform(` appearing
    // beside an `.execute(` or `.preview(` in this file would mean the
    // chat had started performing writes on its own.
    expect(src, "the chat calls the WordPress adapter directly").not.toMatch(
      /createWordPressPlatform\([^)]*\)\s*\.\s*(execute|preview)\(/
    );
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
