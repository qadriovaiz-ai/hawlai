// Approving a card whose action already finished.
//
// THE SEQUENCE: the Meta module was unregistered, so approving the
// campaign claimed the action, failed, and left it at "failed". The
// module was then registered and the merchant clicked Approve on the
// SAME card in their chat history. They got:
//
//   "Approved, but the change couldn't be applied: Action is 'failed',
//    not approved."
//
// A status field read aloud. It said nothing about what failed, nothing
// about the card being spent, and nothing about asking again working —
// which it does: create.ts treats failed as terminal and salts the
// idempotency key so a fresh request goes straight through.
//
// The refusal itself is correct and stays. Re-running a finished action
// is the thing the conditional transition exists to prevent, and
// reviving a failed row on a second click would mean one approval
// producing two executions the day the first one half-succeeded.

import { describe, it, expect } from "vitest";
import { explainRefusal } from "@/lib/publish/executor";

const row = (status: string, error?: string) => ({ status, error: error ?? null });

describe("a refusal says what happened and what to do", () => {
  it("a failed action names the failure AND points at the way forward", () => {
    const said = explainRefusal(row("failed", 'No platform module for "meta".'));
    expect(said).toMatch(/failed earlier/i);
    expect(said).toContain('No platform module for "meta".');
    expect(said).toMatch(/ask me again/i);
  });

  it("survives a failed action with no stored error", () => {
    const said = explainRefusal(row("failed"));
    expect(said).toMatch(/failed earlier/i);
    expect(said).toMatch(/ask me again/i);
    expect(said).not.toMatch(/undefined|null/);
  });

  it.each([
    ["executed", /already went through/i],
    ["rejected", /was rejected/i],
    ["stale", /things changed/i],
    ["executing", /running right now/i],
    ["draft", /never finished being prepared/i],
    ["previewed", /never finished being prepared/i],
  ])("explains %s in plain words", (status, expected) => {
    expect(explainRefusal(row(status))).toMatch(expected);
  });

  it("NEVER reads a status field aloud", () => {
    // The original message was literally the column value in quotes.
    for (const status of ["failed", "executed", "rejected", "stale", "executing", "draft", "previewed"]) {
      const said = explainRefusal(row(status));
      expect(said, `"${status}" leaked the raw status`).not.toMatch(/is "(failed|executed|rejected|stale|executing|draft|previewed)"/);
      expect(said).not.toMatch(/not approved\./);
    }
  });

  it("every branch ends with something the person can DO", () => {
    // Except the two where there is genuinely nothing to do.
    for (const status of ["failed", "rejected", "stale", "draft", "previewed"]) {
      expect(explainRefusal(row(status)), `${status} gives no next step`).toMatch(/ask me again/i);
    }
    expect(explainRefusal(row("executed"))).toMatch(/nothing more to do/i);
    expect(explainRefusal(row("executing"))).toMatch(/give it a moment/i);
  });

  it("an unknown status still gives the way forward rather than nothing", () => {
    expect(explainRefusal(row("some_future_state"))).toMatch(/ask me again/i);
  });
});

describe("asking again is genuinely a way forward, not just advice", () => {
  it("create.ts treats failed as terminal so a fresh request is not blocked", async () => {
    // The advice above is only honest if a second request actually
    // works. It does: a terminal row does not short-circuit as
    // "already pending", and the idempotency key is salted so the
    // unique index cannot reject the retry.
    const { execFileSync } = await import("child_process");
    const src = execFileSync("git", ["show", "HEAD:src/lib/publish/create.ts"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    expect(src).toMatch(/const TERMINAL = new Set\(\["executed", "failed", "rejected", "stale"\]\)/);
    expect(src).toMatch(/!TERMINAL\.has\(existing\.status\)/);
    expect(src).toMatch(/idempotencyKey = existing \? `\$\{key\}:\$\{Date\.now\(\)/);
  });
});
