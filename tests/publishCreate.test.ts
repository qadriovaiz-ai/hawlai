// draft → preview → request approval.
//
// The properties worth pinning are the ones that decide whether an
// owner's approval queue stays trustworthy: asking twice must not
// stack two identical decisions, a preview failure must not leave a
// silent orphan, and an action must never become executable without
// an approval behind it.

import { describe, it, expect, vi } from "vitest";
import { createPublishAction, intentKey, type CreateInput } from "@/lib/publish/create";
import type { PublishPlatform } from "@/lib/publish/types";

const input = (over: Partial<CreateInput> = {}): CreateInput => ({
  dealershipId: "d1",
  platform: "shopify",
  actionKey: "update_product_price",
  targetRef: "gid://shopify/ProductVariant/1",
  targetLabel: "Blue Kurta",
  requestedChanges: { price: "999" },
  requestedBy: "u1",
  ...over,
});

const PRICE_PREVIEW = { summary: "Price: 1299 → 999", changes: [{ field: "price", before: "1299", after: "999" }], warnings: [] };

const platform = (over: Partial<PublishPlatform> = {}): PublishPlatform => ({
  id: "shopify",
  supports: ["update_product_price"],
  isConnected: async () => true,
  preview: async () => ({
    ok: true,
    preview: { summary: "Price: 1299 → 999", changes: [{ field: "price", before: "1299", after: "999" }], warnings: [] },
  }),
  execute: async () => ({ ok: true, platformResponse: {} }),
  ...over,
});

/** Records every insert and update so the test can assert the sequence. */
function fakeDb(opts: {
  existing?: Record<string, any> | null;
  /** The linked approval as pending_approvals holds it. Defaults to still pending. */
  approval?: Record<string, any> | null;
  approvalReadFails?: boolean;
} = {}) {
  const writes: Record<string, any>[] = [];
  let approvalId = "app-1";

  const from = (table: string) => {
    const api: any = {
      _op: null as string | null,
      _fields: null as Record<string, any> | null,
      select: () => api,
      eq: () => api,
      in: () => api,
      like: () => api,
      insert: (fields: Record<string, any>) => { api._op = "insert"; api._fields = fields; writes.push({ table, op: "insert", ...fields }); return api; },
      update: (fields: Record<string, any>) => { api._op = "update"; api._fields = fields; writes.push({ table, op: "update", ...fields }); return api; },
      // The earlier-attempts lookup is awaited as a list.
      then: (resolve: any) => {
        if (api._op === null && table === "publish_actions") return resolve({ data: opts.existing ? [opts.existing] : [], error: null });
        return resolve({ data: null, error: null });
      },
      maybeSingle: async () => {
        if (api._op === null && table === "pending_approvals") {
          if (opts.approvalReadFails) return { data: null, error: { message: "connection reset" } };
          return { data: opts.approval === undefined ? { status: "pending" } : opts.approval, error: null };
        }
        return { data: null };
      },
      single: async () => {
        if (api._op === "insert" && table === "publish_actions") {
          return { data: { id: "act-1", ...api._fields }, error: null };
        }
        if (api._op === "insert" && table === "pending_approvals") {
          return { data: { id: approvalId }, error: null };
        }
        return { data: null, error: null };
      },
    };
    return api;
  };

  return { client: { from }, writes };
}

describe("intentKey", () => {
  it("is stable for the same intent", () => {
    expect(intentKey(input())).toBe(intentKey(input()));
  });

  it("ignores who asked", () => {
    // The same change requested by two people is one change, not two
    // decisions for the owner to make.
    expect(intentKey(input({ requestedBy: "u1" }))).toBe(intentKey(input({ requestedBy: "u2" })));
  });

  it("ignores the ORDER of the requested fields", () => {
    const a = intentKey(input({ requestedChanges: { price: "999", note: "x" } }));
    const b = intentKey(input({ requestedChanges: { note: "x", price: "999" } }));
    expect(a).toBe(b);
  });

  it("changes when the target or the value changes", () => {
    expect(intentKey(input({ targetRef: "gid://shopify/ProductVariant/2" }))).not.toBe(intentKey(input()));
    expect(intentKey(input({ requestedChanges: { price: "899" } }))).not.toBe(intentKey(input()));
  });
});

describe("asking twice does not stack two decisions", () => {
  it("returns the pending action instead of creating a second", async () => {
    // Two rows saying "set this price to 999" is not two decisions —
    // it is one decision and a confusing queue.
    // The stored preview is what the platform produced when it was
    // created. Re-serving now re-reads the platform and requires a match,
    // so the fixture holds a real preview rather than an empty one.
    const db = fakeDb({ existing: { id: "act-existing", status: "awaiting_approval", preview: PRICE_PREVIEW, approval_id: "app-existing" } });
    const result = await createPublishAction(db.client, platform(), input());
    expect(result.ok && result.alreadyPending).toBe(true);
    expect(result.ok && result.actionId).toBe("act-existing");
    expect(db.writes.filter((w) => w.op === "insert")).toEqual([]);
  });

  it("allows a fresh request once the previous one finished", async () => {
    // A price set last week is a fair thing to set again. The key is
    // salted so the unique index does not block a legitimate repeat.
    for (const status of ["executed", "failed", "rejected", "stale"]) {
      const db = fakeDb({ existing: { id: "old", status, preview: null, approval_id: null } });
      const result = await createPublishAction(db.client, platform(), input());
      expect(result.ok, `${status} should permit a new request`).toBe(true);
      expect(db.writes.some((w) => w.op === "insert" && w.table === "publish_actions")).toBe(true);
    }
  });
});

describe("a waiting card is only shown again if it is still true", () => {
  const waiting = (over: Record<string, any> = {}) => ({ id: "act-old", status: "awaiting_approval", preview: PRICE_PREVIEW, approval_id: "app-old", ...over });

  it("a card whose approval was REJECTED is closed, never re-served", async () => {
    // The ₹0.00 activation card came back after it was rejected: the
    // rejection never reached publish_actions, so this lookup saw an
    // undecided row and handed back its stored preview.
    const db = fakeDb({ existing: waiting(), approval: { status: "rejected" } });
    const result = await createPublishAction(db.client, platform(), input());
    expect(result.ok && result.alreadyPending).toBeFalsy();
    expect(db.writes).toContainEqual(expect.objectContaining({ table: "publish_actions", op: "update", status: "rejected" }));
    expect(db.writes.some((w) => w.op === "insert" && w.table === "publish_actions")).toBe(true);
  });

  it("a card whose approval row is gone is closed too", async () => {
    const db = fakeDb({ existing: waiting(), approval: null });
    const result = await createPublishAction(db.client, platform(), input());
    expect(result.ok && result.alreadyPending).toBeFalsy();
  });

  it("a PENDING card whose details changed is retired and replaced", async () => {
    const db = fakeDb({ existing: waiting({ preview: { summary: "old", changes: [{ field: "price", before: "1099", after: "999" }], warnings: [] } }) });
    const result = await createPublishAction(db.client, platform(), input());
    expect(result.ok && result.alreadyPending).toBeFalsy();
    expect(result.ok && result.preview.changes[0].before).toBe("1299");
    expect(db.writes).toContainEqual(expect.objectContaining({ table: "publish_actions", op: "update", status: "stale" }));
    expect(db.writes).toContainEqual(expect.objectContaining({ table: "pending_approvals", op: "update", status: "rejected" }));
  });

  it("if the approval can't be checked, it neither re-serves nor stacks", async () => {
    const db = fakeDb({ existing: waiting(), approvalReadFails: true });
    const result = await createPublishAction(db.client, platform(), input());
    expect(result.ok).toBe(false);
    expect(db.writes.filter((w) => w.op === "insert")).toEqual([]);
  });

  it("an approved, in-flight action is reported as such without re-previewing", async () => {
    const preview = vi.fn();
    const db = fakeDb({ existing: waiting({ status: "executing" }), approval: { status: "approved" } });
    const result = await createPublishAction(db.client, platform({ preview } as any), input());
    expect(result.ok && result.alreadyPending).toBe(true);
    expect(preview).not.toHaveBeenCalled();
  });
});

describe("the happy path leaves a linked, approvable action", () => {
  it("previews, creates an approval, and links it LAST", async () => {
    const db = fakeDb();
    const result = await createPublishAction(db.client, platform(), input());
    expect(result.ok).toBe(true);

    const statuses = db.writes.filter((w) => w.status).map((w) => w.status);
    expect(statuses).toContain("previewed");
    expect(statuses).toContain("awaiting_approval");

    // Linked LAST, and the order is the safety property: until
    // approval_id lands the executor refuses the action, so a crash
    // between the two inserts leaves an orphan approval to reject —
    // never an action that can run unapproved.
    const linkWrite = db.writes.find((w) => w.approval_id);
    expect(linkWrite?.status).toBe("awaiting_approval");
    expect(db.writes.indexOf(linkWrite!)).toBe(db.writes.length - 1);
  });

  it("records the approval with NO rupee amount", async () => {
    // Null is not an oversight. A price change has no amount, and
    // inventing one would feed the threshold logic a meaningless
    // number instead of routing to the critical no-amount rule.
    const db = fakeDb();
    await createPublishAction(db.client, platform(), input());
    const approval = db.writes.find((w) => w.table === "pending_approvals");
    expect(approval?.amount).toBeNull();
    expect(approval?.action_type).toBe("update_product_price");
  });

  it("puts the human-readable summary in action_details", async () => {
    // The owner approving a price change should not have to read a
    // JSON patch to understand it.
    const db = fakeDb();
    await createPublishAction(db.client, platform(), input());
    const approval = db.writes.find((w) => w.table === "pending_approvals");
    expect(approval?.action_details.summary).toBe("Price: 1299 → 999");
    expect(approval?.action_details.publish_action_id).toBe("act-1");
  });
});

describe("refusals happen before anything is recorded", () => {
  it("refuses an action the platform does not support", async () => {
    const db = fakeDb();
    const result = await createPublishAction(db.client, platform({ supports: [] }), input());
    expect(result.ok).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it("refuses without a resolved target", async () => {
    // Resolution is a conversational concern — this function must not
    // guess which product was meant.
    const db = fakeDb();
    const result = await createPublishAction(db.client, platform(), input({ targetRef: "" }));
    expect(result.ok).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it("marks the draft failed when preview fails, rather than orphaning it", async () => {
    // The attempt stays visible. A silently vanishing draft is how an
    // owner ends up asking "did that go through?" with nothing to look at.
    const db = fakeDb();
    const p = platform({ preview: async () => ({ ok: false, reason: "Product was deleted" }) });
    const result = await createPublishAction(db.client, p, input());
    expect(result.ok).toBe(false);
    const failed = db.writes.find((w) => w.status === "failed");
    expect(failed?.error).toBe("Product was deleted");
    expect(db.writes.some((w) => w.table === "pending_approvals")).toBe(false);
  });
});
