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

// ---------------------------------------------------------------
// Can a stale action block a fresh request? (No.)
// ---------------------------------------------------------------
describe("two identical requests get independent actions", () => {
  it("a campaign launch can NEVER collide, because targetRef is per-request", async () => {
    // The reported theory was that a fresh "lavender candle, ₹100/day"
    // reused the old failed row because the text was identical. It
    // cannot: launch_meta_campaign passes targetRef: draftId, and the
    // ad_creatives draft is created fresh on every request. That id is
    // hashed into the key, so two textually-identical asks produce two
    // different keys and two independent rows.
    const { intentKey } = await import("@/lib/publish/create");
    const same = {
      dealershipId: "d1",
      platform: "meta" as const,
      actionKey: "launch_ad_campaign" as const,
      targetLabel: "Lavender Candle Sale",
      requestedChanges: { description: "lavender candle ka ad chalao", daily_budget: 100 },
      requestedBy: null,
    };

    const first = intentKey({ ...same, targetRef: "draft-aaa" });
    const second = intentKey({ ...same, targetRef: "draft-bbb" });
    expect(first).not.toBe(second);
  });

  it("but a price change on the SAME variant still dedupes, which is the point", async () => {
    // targetRef there is a stable Shopify variant id, so asking twice
    // for the same price on the same product IS one decision. The
    // dedupe protects that case and never touches the launch case.
    const { intentKey } = await import("@/lib/publish/create");
    const base = {
      dealershipId: "d1",
      platform: "shopify" as const,
      actionKey: "update_product_price" as const,
      targetRef: "gid://shopify/ProductVariant/1",
      targetLabel: "Blue Kurta",
      requestedChanges: { price: "999", statedCurrency: null },
      requestedBy: null,
    };
    expect(intentKey(base)).toBe(intentKey({ ...base }));
  });

  it("a different budget is a different request even on the same draft", async () => {
    const { intentKey } = await import("@/lib/publish/create");
    const base = {
      dealershipId: "d1",
      platform: "meta" as const,
      actionKey: "launch_ad_campaign" as const,
      targetRef: "draft-aaa",
      targetLabel: "x",
      requestedBy: null,
    };
    expect(intentKey({ ...base, requestedChanges: { daily_budget: 100 } }))
      .not.toBe(intentKey({ ...base, requestedChanges: { daily_budget: 200 } }));
  });

  it("a terminal row never short-circuits a retry even when keys DO match", async () => {
    // The belt-and-braces half, for the paths where targetRef is
    // stable: create.ts only returns "already pending" for a
    // non-terminal row, and salts the key otherwise.
    const { execFileSync } = await import("child_process");
    const src = execFileSync("git", ["show", "HEAD:src/lib/publish/create.ts"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    expect(src).toMatch(/if \(existing && !TERMINAL\.has\(existing\.status\) && existing\.preview\)/);
  });
});
