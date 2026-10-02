// An approval nobody decided closes itself after 14 days.
//
// Notifying was the whole of this: after two days the owner was told,
// and then the row sat pending forever. One card on a live account has
// been waiting since September. A card from weeks ago is not a decision
// anyone still wants to take — the price it quotes has moved, the
// campaign it names may be over — and approving it would apply
// yesterday's intent to today's business.

import { describe, it, expect } from "vitest";
import { expireOldApprovals } from "@/lib/automation/staleApprovalDetection";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-02T00:00:00Z").getTime();

/**
 * A fake that accepts filters in any order, because the real client does.
 *
 * The first version resolved on `.in()`, so `.update().in().eq()` — a
 * perfectly ordinary chain — threw "eq is not a function". That is the
 * fake being wrong about Supabase, not the code being wrong.
 */
function db(rows: { id: string; created_at: string; status: string }[]) {
  const writes: { table: string; values: any; ids: string[]; statusFilter?: string }[] = [];
  return {
    writes,
    from(table: string) {
      let values: any = null;
      let ids: string[] = [];
      let statusFilter: string | undefined;
      const chain: any = {
        select: () => chain,
        update: (v: any) => ((values = v), chain),
        eq: (col: string, value: any) => {
          if (col === "status") statusFilter = value;
          return chain;
        },
        in: (_col: string, list: string[]) => ((ids = list), chain),
        // Uses the cutoff it is GIVEN. Hard-coding fourteen days here
        // let a mutation that expired everything pending pass: the fake
        // was answering the question instead of the code.
        lt: async (_col: string, cutoff: string) => ({
          data: rows.filter((r) => r.status === "pending" && new Date(r.created_at).getTime() < new Date(cutoff).getTime()),
        }),
        // Awaited at the end of the chain, whatever order the filters came in.
        then: (resolve: any) => {
          if (values) writes.push({ table, values, ids, statusFilter });
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
}

describe("expiring an old approval", () => {
  it("closes one that has waited longer than a fortnight", async () => {
    const store = db([{ id: "a1", created_at: new Date(NOW - 20 * DAY).toISOString(), status: "pending" }]);
    expect(await expireOldApprovals(store as any, "d1", NOW)).toBe(1);
    const approval = store.writes.find((w) => w.table === "pending_approvals")!;
    expect(approval.values.status).toBe("expired");
    expect(approval.values.rejection_reason).toMatch(/Nobody decided within 14 days/);
    expect(approval.values.rejection_reason).toMatch(/Ask again/);
  });

  it("leaves one that is merely old alone", async () => {
    const store = db([{ id: "a1", created_at: new Date(NOW - 10 * DAY).toISOString(), status: "pending" }]);
    expect(await expireOldApprovals(store as any, "d1", NOW)).toBe(0);
    expect(store.writes).toEqual([]);
  });

  it("marks the publish action STALE, not failed — nothing was attempted", async () => {
    const store = db([{ id: "a1", created_at: new Date(NOW - 30 * DAY).toISOString(), status: "pending" }]);
    await expireOldApprovals(store as any, "d1", NOW);
    const action = store.writes.find((w) => w.table === "publish_actions")!;
    expect(action.values.status).toBe("stale");
    // And only one still waiting: an executed action is not reopened.
    expect(action.statusFilter).toBe("awaiting_approval");
  });

  it("closes the approval BEFORE the action", async () => {
    // Until it stops being 'pending' the executor can still be handed
    // it, and an action marked stale beside a live approval is the worse
    // of the two orders to be interrupted in.
    const store = db([{ id: "a1", created_at: new Date(NOW - 30 * DAY).toISOString(), status: "pending" }]);
    await expireOldApprovals(store as any, "d1", NOW);
    expect(store.writes.map((w) => w.table)).toEqual(["pending_approvals", "publish_actions"]);
  });
});
