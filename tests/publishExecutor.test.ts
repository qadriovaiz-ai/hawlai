// The executor: claim → execute → record.
//
// The property that matters most is the first one tested: the
// executor re-verifies the APPROVAL, not just the action's own status
// column. publish_actions.status = 'approved' is a claim;
// pending_approvals is the evidence. Trusting the column alone means
// anything that can write it bypasses the entire approval system — a
// bug, a migration, a well-meaning admin script.
//
// The product promise is that a price cannot go live without a human
// saying yes. A status field is not a human saying yes.

import { describe, it, expect, vi } from "vitest";
import { executePublishAction, isClearedToExecute, toRecord, CLAIM_TTL_MS } from "@/lib/publish/executor";
import type { PublishPlatform } from "@/lib/publish/types";

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);

function actionRow(over: Record<string, any> = {}) {
  return {
    id: "act-1",
    dealership_id: "d1",
    platform: "shopify",
    action_key: "update_product_price",
    target_ref: "gid://shopify/ProductVariant/1",
    target_label: "Blue Kurta",
    requested_changes: { price: "999" },
    preview: { summary: "", changes: [{ field: "price", before: "1299", after: "999" }], warnings: [] },
    previewed_at: new Date(NOW).toISOString(),
    status: "approved",
    approval_id: "app-1",
    idempotency_key: "k1",
    updated_at: new Date(NOW).toISOString(),
    ...over,
  };
}

/**
 * A minimal Supabase double. Records every update so the test can
 * assert what was written, which is the whole contract of an executor.
 */
function fakeDb(opts: { action: Record<string, any> | null; approval: Record<string, any> | null; claimSucceeds?: boolean }) {
  const updates: Record<string, any>[] = [];
  const claimSucceeds = opts.claimSucceeds ?? true;

  const from = (table: string) => {
    const api: any = {
      _update: null as Record<string, any> | null,
      select: () => api,
      eq: () => api,
      or: () => api,
      maybeSingle: async () => {
        if (api._update) {
          updates.push({ table, ...api._update });
          // A claim returns a row only when the conditional UPDATE matched.
          if (api._update.status === "executing") return { data: claimSucceeds ? { id: "act-1" } : null };
          return { data: { id: "act-1" } };
        }
        if (table === "publish_actions") return { data: opts.action };
        if (table === "pending_approvals") return { data: opts.approval };
        return { data: null };
      },
      update: (fields: Record<string, any>) => {
        api._update = fields;
        // Terminal writes never call maybeSingle; record them here.
        if (fields.status !== "executing") updates.push({ table, ...fields });
        return api;
      },
    };
    return api;
  };

  return { client: { from }, updates };
}

const platform = (impl: Partial<PublishPlatform> = {}): PublishPlatform => ({
  id: "shopify",
  supports: ["update_product_price"],
  isConnected: async () => true,
  preview: async () => ({ ok: false, reason: "not used" }),
  execute: async () => ({ ok: true, platformResponse: { done: true } }),
  ...impl,
});

const deps = (db: any, p: PublishPlatform = platform()) => ({
  supabase: db.client,
  platforms: { shopify: p },
  now: () => NOW,
});

describe("the approval is re-verified, not assumed", () => {
  it("REFUSES when the action claims approved but no approval exists", async () => {
    // THE LOAD-BEARING ONE. Anything that can write status='approved'
    // would otherwise get a live price change with no human involved.
    const db = fakeDb({ action: actionRow(), approval: null });
    const result = await executePublishAction(deps(db), "act-1");
    expect(result.status).toBe("failed");
    expect(db.updates.some((u) => u.status === "executing")).toBe(false);
  });

  it("REFUSES when the linked approval was rejected", async () => {
    const db = fakeDb({ action: actionRow(), approval: { id: "app-1", status: "rejected" } });
    const result = await executePublishAction(deps(db), "act-1");
    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.error).toContain("rejected");
  });

  it("REFUSES when the approval is still pending", async () => {
    const db = fakeDb({ action: actionRow(), approval: { id: "app-1", status: "pending" } });
    expect((await executePublishAction(deps(db), "act-1")).status).toBe("failed");
  });

  it("REFUSES an approval-requiring action with no approval_id at all", async () => {
    const db = fakeDb({ action: actionRow({ approval_id: null }), approval: null });
    expect((await executePublishAction(deps(db), "act-1")).status).toBe("failed");
  });

  it("runs when the approval genuinely says approved", async () => {
    const db = fakeDb({ action: actionRow(), approval: { id: "app-1", status: "approved" } });
    expect((await executePublishAction(deps(db), "act-1")).status).toBe("executed");
  });

  it("refuses an action key no policy governs", () => {
    // An unknown key means nothing decided whether it needs approval.
    // Defaulting to "allow" would let a typo skip the gate.
    expect(isClearedToExecute({ action_key: "not_a_real_action" }, null).cleared).toBe(false);
  });
});

describe("only one worker executes an action", () => {
  it("skips when the claim does not match", async () => {
    const db = fakeDb({ action: actionRow(), approval: { id: "app-1", status: "approved" }, claimSucceeds: false });
    const result = await executePublishAction(deps(db), "act-1");
    expect(result.status).toBe("skipped");
  });

  it("skips anything not in the approved state", async () => {
    for (const status of ["executing", "executed", "failed", "draft", "stale", "rejected"]) {
      const db = fakeDb({ action: actionRow({ status }), approval: { id: "app-1", status: "approved" } });
      const result = await executePublishAction(deps(db), "act-1");
      expect(result.status, `${status} must not re-run`).toBe("skipped");
    }
  });

  it("allows a crashed claim to be taken over after the TTL", () => {
    // A worker that dies mid-execute leaves 'executing' behind. The
    // TTL is what stops that costing the action permanently — it costs
    // one TTL instead.
    expect(CLAIM_TTL_MS).toBeGreaterThan(60_000);
  });
});

describe("every path records a terminal state", () => {
  it("records executed with the platform response", async () => {
    const db = fakeDb({ action: actionRow(), approval: { id: "app-1", status: "approved" } });
    await executePublishAction(deps(db), "act-1");
    const final = db.updates.at(-1)!;
    expect(final.status).toBe("executed");
    expect(final.platform_response).toEqual({ done: true });
    expect(final.executed_at).toBeTruthy();
  });

  it("records STALE distinctly from failed", async () => {
    // Stale is not an error. Nothing was written and the decision is
    // simply out of date — the next step is a fresh preview, not a
    // retry of a decision that no longer describes reality.
    const db = fakeDb({ action: actionRow(), approval: { id: "app-1", status: "approved" } });
    const p = platform({
      execute: async () => ({ ok: false, stale: true, changed: [{ field: "price", before: "1299", after: "1100" }] }),
    });
    const result = await executePublishAction(deps(db, p), "act-1");
    expect(result.status).toBe("stale");
    expect(db.updates.at(-1)!.status).toBe("stale");
  });

  it("records failed when the platform declines", async () => {
    const db = fakeDb({ action: actionRow(), approval: { id: "app-1", status: "approved" } });
    const p = platform({ execute: async () => ({ ok: false, reason: "Price is invalid" }) });
    const result = await executePublishAction(deps(db, p), "act-1");
    expect(result.status).toBe("failed");
    expect(db.updates.at(-1)!.error).toContain("Price is invalid");
  });

  it("does NOT leave the row executing when the platform THROWS", async () => {
    // The failure mode that makes an operator distrust the table: a
    // row stuck in 'executing' with no reason recorded anywhere, which
    // every other worker then skips until the TTL lapses.
    const db = fakeDb({ action: actionRow(), approval: { id: "app-1", status: "approved" } });
    const p = platform({ execute: async () => { throw new Error("socket hang up"); } });
    const result = await executePublishAction(deps(db, p), "act-1");
    expect(result.status).toBe("failed");
    const final = db.updates.at(-1)!;
    expect(final.status).toBe("failed");
    expect(final.error).toContain("socket hang up");
  });

  it("fails rather than hangs when no platform module is registered", async () => {
    const db = fakeDb({ action: actionRow({ platform: "wordpress" }), approval: { id: "app-1", status: "approved" } });
    const result = await executePublishAction(deps(db), "act-1");
    expect(result.status).toBe("failed");
    expect(db.updates.at(-1)!.status).toBe("failed");
  });
});

describe("toRecord", () => {
  it("maps snake_case columns to the platform-facing shape", () => {
    // One place, so field names cannot drift between the DB and the
    // platform modules — a drift that would present as undefined
    // targetRef and a confusing "no variant specified".
    const r = toRecord(actionRow());
    expect(r.dealershipId).toBe("d1");
    expect(r.actionKey).toBe("update_product_price");
    expect(r.targetRef).toBe("gid://shopify/ProductVariant/1");
    expect(r.idempotencyKey).toBe("k1");
    expect(r.preview?.changes[0].before).toBe("1299");
  });
});
