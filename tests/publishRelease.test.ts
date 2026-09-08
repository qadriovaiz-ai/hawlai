// The approve → execute handoff, driven end to end.
//
// THE SEAM THAT SHIPPED BROKEN. publishExecutor.test.ts has twelve
// passing tests and every one of them starts from a fabricated
// `status: "approved"` row. Nothing in the product could produce that
// state: create.ts writes 'approved' only under
// `if (!policy.requiresApproval)`, and all five action keys are in
// ALWAYS_REQUIRES_APPROVAL, so the branch is dead. Both sides of the
// handoff were unit-tested; the gap between them was not, and the
// first real approval in production hit it.
//
// The other reason it was invisible: that file's fake Supabase ignores
// .eq() entirely and returns the same row for any query. A double that
// cannot express a filter cannot fail a test about a conditional
// UPDATE — and the conditional UPDATE is the whole safety property
// here. So this file uses a fake that actually applies filters, even
// though it costs more to write.

import { describe, it, expect } from "vitest";
import { releaseApprovedAction } from "@/lib/publish/release";
import type { PublishPlatform } from "@/lib/publish/types";

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

function actionRow(over: Record<string, any> = {}) {
  return {
    id: "act-1",
    dealership_id: "d1",
    platform: "shopify",
    action_key: "update_product_price",
    target_ref: "gid://shopify/ProductVariant/1",
    target_label: "Oxygen",
    requested_changes: { price: "799.00" },
    preview: { summary: "", changes: [{ field: "price", before: "1025.00", after: "799.00" }], warnings: [] },
    previewed_at: new Date(NOW).toISOString(),
    // The state the route ACTUALLY leaves behind. Not 'approved' —
    // that is what the executor's own tests assumed into existence.
    status: "awaiting_approval",
    approval_id: "app-1",
    idempotency_key: "k1",
    updated_at: new Date(NOW - 60_000).toISOString(),
    ...over,
  };
}

/** Mirrors executor.ts's claim expression. Kept literal so a change there shows up here. */
function matchesOr(row: any, expr: string | null): boolean {
  if (!expr) return true;
  if (/(^|,)status\.eq\.approved(,|$)/.test(expr) && row.status === "approved") return true;
  const stale = /and\(status\.eq\.executing,updated_at\.lt\.([^)]+)\)/.exec(expr);
  if (stale && row.status === "executing" && row.updated_at < stale[1]) return true;
  return false;
}

/**
 * A Supabase double that honours filters.
 *
 * Rows are mutated in place, so the test can read the final state of
 * the table rather than inferring it from a list of update calls —
 * "did this action end up executed" is the actual question.
 */
function fakeDb(tables: Record<string, any[]>) {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let orExpr: string | null = null;
    let patch: Record<string, any> | null = null;
    let applied = false;

    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v) && matchesOr(r, orExpr));

    // Applies the pending UPDATE at most once, whether the caller
    // awaits the builder directly (executor's finish()) or ends with
    // .select().maybeSingle() (the claim, and the release transition).
    const apply = () => {
      if (applied) return null;
      applied = true;
      const matched = rows();
      matched.forEach((r) => Object.assign(r, patch));
      return matched[0] ?? null;
    };

    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => { filters.push([col, val]); return api; },
      or: (expr: string) => { orExpr = expr; return api; },
      update: (fields: Record<string, any>) => { patch = fields; return api; },
      maybeSingle: async () => {
        if (!patch) return { data: rows()[0] ?? null };
        // A conditional UPDATE returns a row only when it matched —
        // which is what makes it a mutex, and what the other fake
        // could not express.
        const row = apply();
        return { data: row ? { id: row.id } : null };
      },
      single: async () => ({ data: rows()[0] ?? null }),
      then: (resolve: any) => { if (patch) apply(); return resolve({ data: null, error: null }); },
    };
    return api;
  };
  return { from };
}

const platform = (impl: Partial<PublishPlatform> = {}): PublishPlatform => ({
  id: "shopify",
  supports: ["update_product_price"],
  isConnected: async () => true,
  preview: async () => ({ ok: false, reason: "not used" }),
  execute: async () => ({ ok: true, platformResponse: { done: true } }),
  ...impl,
});

// `action: null` means the approval has NO publish action (an ad
// budget change); omitting it means the ordinary awaiting_approval row.
function setup(opts: { action?: Record<string, any> | null; approvalStatus?: string | null; platform?: PublishPlatform } = {}) {
  const writes: string[] = [];
  const actions = opts.action === undefined ? [actionRow()] : opts.action === null ? [] : [opts.action];
  const approvals = opts.approvalStatus === null ? [] : [{ id: "app-1", status: opts.approvalStatus ?? "approved" }];
  const p = opts.platform ?? platform({ execute: async () => { writes.push("shopify-write"); return { ok: true, platformResponse: { done: true } }; } });
  const tables = { publish_actions: actions, pending_approvals: approvals };
  return {
    tables,
    writes,
    deps: { supabase: fakeDb(tables), platforms: { shopify: p }, now: () => NOW },
    action: () => tables.publish_actions[0],
  };
}

describe("the missing transition", () => {
  it("EXECUTES an action sitting at awaiting_approval — the bug, directly", async () => {
    // THE REGRESSION TEST. Before the fix this returned
    // skipped/"Action is 'awaiting_approval', not approved" and the
    // merchant saw "Approved, but the change couldn't be applied".
    // Nothing reached Shopify, and no amount of executor testing could
    // have shown it, because no executor test ever started here.
    const t = setup();
    const result = await releaseApprovedAction(t.deps as any, "app-1");

    expect(result.kind).toBe("ran");
    expect(result.kind === "ran" && result.outcome.status).toBe("executed");
    expect(t.writes).toEqual(["shopify-write"]);
    expect(t.action().status).toBe("executed");
  });

  it("finds the action by approval id, not by action id", async () => {
    // The route only holds the approval's id; the action is reached
    // through it. A lookup on the wrong column would find nothing and
    // silently report success on an approval that published nothing.
    const t = setup();
    const result = await releaseApprovedAction(t.deps as any, "app-1");
    expect(result.kind === "ran" && result.actionId).toBe("act-1");
  });
});

describe("releasing cannot become a way around the approval", () => {
  it.each(["pending", "rejected"])("refuses when the approval record is %s", async (approvalStatus) => {
    // The transition writes status='approved' on the ACTION. If that
    // were taken as evidence, this new step would be exactly the
    // bypass the executor re-verification exists to prevent — a
    // status column talking itself into a live price change.
    const t = setup({ approvalStatus });
    const result = await releaseApprovedAction(t.deps as any, "app-1");

    expect(result.kind === "ran" && result.outcome.status).toBe("failed");
    expect(t.writes).toEqual([]);
  });

  it("refuses when the approval record is missing entirely", async () => {
    const t = setup({ approvalStatus: null });
    const result = await releaseApprovedAction(t.deps as any, "app-1");
    expect(result.kind === "ran" && result.outcome.status).toBe("failed");
    expect(t.writes).toEqual([]);
  });
});

describe("a second approval cannot apply the change twice", () => {
  it("does NOT revive an already-executed action", async () => {
    // THE LOAD-BEARING SAFETY PROPERTY, and the reason the transition
    // is filtered on awaiting_approval rather than written blind.
    //
    // The route has no already-approved guard and the inline card's
    // decision state is local to the component, so a page reload
    // genuinely does offer the button again. Unconditional, that
    // second click would write a live price to the merchant's store a
    // second time off one decision.
    const t = setup({ action: actionRow({ status: "executed" }) });
    const result = await releaseApprovedAction(t.deps as any, "app-1");

    expect(result.kind === "ran" && result.outcome.status).toBe("skipped");
    expect(t.writes).toEqual([]);
    expect(t.action().status).toBe("executed");
  });

  it.each(["failed", "rejected", "stale", "executing"])("does not revive a %s action", async (status) => {
    const t = setup({ action: actionRow({ status }) });
    const result = await releaseApprovedAction(t.deps as any, "app-1");
    expect(result.kind === "ran" && result.outcome.status).toBe("skipped");
    expect(t.writes).toEqual([]);
    expect(t.action().status).toBe(status);
  });
});

describe("recoverable and irrelevant cases", () => {
  it("still runs an action already at approved — a crash between the two writes", async () => {
    // The transition landing and the execute call not happening is a
    // real sequence (a timeout, a redeploy mid-request). Filtering the
    // UPDATE on awaiting_approval means it matches nothing here, so
    // the executor has to be called regardless of whether the
    // transition fired — otherwise the fix trades one wedged state for
    // another.
    const t = setup({ action: actionRow({ status: "approved" }) });
    const result = await releaseApprovedAction(t.deps as any, "app-1");

    expect(result.kind === "ran" && result.outcome.status).toBe("executed");
    expect(t.writes).toEqual(["shopify-write"]);
  });

  it("leaves approvals that have no publish action alone", async () => {
    // Ad budget and targeting approvals go through the same route.
    // Treating a missing publish action as an error would break every
    // one of them.
    const t = setup({ action: null });
    const result = await releaseApprovedAction(t.deps as any, "app-1");

    expect(result.kind).toBe("not_a_publish_action");
    expect(t.writes).toEqual([]);
  });

  it("reports a platform failure rather than claiming the price changed", async () => {
    const t = setup({ platform: platform({ execute: async () => ({ ok: false, reason: "Shopify declined the write." }) }) });
    const result = await releaseApprovedAction(t.deps as any, "app-1");

    expect(result.kind === "ran" && result.outcome.status).toBe("failed");
    expect(t.action().status).toBe("failed");
  });
});
