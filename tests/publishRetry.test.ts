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

// ---------------------------------------------------------------
// Asking again, run for real.
//
// These two used to grep the committed create.ts for its exact wording
// (`!TERMINAL.has(existing.status)`, `idempotencyKey = existing ? …`).
// When the lookup was rewritten to find salted repeats too, the
// behaviour held and the greps failed on a variable rename. They now
// call createPublishAction against a table that already holds a
// finished row with the SAME key and a stored preview — the case where
// a wrong short-circuit would re-serve a spent card.
// ---------------------------------------------------------------

const PREVIEW = { summary: "Price: 1299 → 999", changes: [{ field: "price", before: "1299", after: "999" }], warnings: [] };

async function askAgainAfter(existingStatus: string) {
  const { createPublishAction, intentKey } = await import("@/lib/publish/create");
  const input = {
    dealershipId: "d1",
    platform: "shopify" as const,
    actionKey: "update_product_price" as const,
    targetRef: "gid://shopify/ProductVariant/1",
    targetLabel: "Blue Kurta",
    requestedChanges: { price: "999" },
    requestedBy: null,
  };
  const key = intentKey(input);
  const existing = { id: "old", status: existingStatus, preview: PREVIEW, approval_id: "app-old", idempotency_key: key };
  const inserts: Record<string, any>[] = [];

  const db = {
    from: (table: string) => {
      const api: any = {
        _op: null as string | null,
        _fields: null as Record<string, any> | null,
        select: () => api,
        eq: () => api,
        in: () => api,
        like: () => api,
        insert: (fields: Record<string, any>) => { api._op = "insert"; api._fields = fields; inserts.push({ table, ...fields }); return api; },
        update: () => { api._op = "update"; return api; },
        // The earlier-attempts lookup, awaited as a list.
        then: (resolve: any) =>
          resolve(api._op === null && table === "publish_actions" ? { data: [existing], error: null } : { data: null, error: null }),
        maybeSingle: async () => ({ data: { status: "pending" }, error: null }),
        single: async () => ({
          data: api._op === "insert" ? { id: table === "publish_actions" ? "act-new" : "app-new", ...api._fields } : null,
          error: null,
        }),
      };
      return api;
    },
  };

  const platform = {
    id: "shopify",
    supports: ["update_product_price"],
    isConnected: async () => true,
    preview: async () => ({ ok: true, preview: PREVIEW }),
    execute: async () => ({ ok: true, platformResponse: {} }),
  };

  const result = await createPublishAction(db, platform as any, input);
  const action = inserts.find((i) => i.table === "publish_actions");
  return { result, key, action };
}

describe("asking again is genuinely a way forward, not just advice", () => {
  it("after a FAILED action, a fresh request goes through under a salted key", async () => {
    // The advice above is only honest if a second request actually
    // works: the failed row must not come back as "already pending",
    // and the unique index must not reject the retry.
    const { result, key, action } = await askAgainAfter("failed");
    expect(result.ok).toBe(true);
    expect(result.ok && result.alreadyPending).toBeFalsy();
    expect(result.ok && result.actionId).toBe("act-new");
    expect(action?.idempotency_key).toMatch(new RegExp(`^${key}:`));
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

  it.each(["executed", "failed", "rejected", "stale"])(
    "a %s row never short-circuits a retry, even with the same key and a stored preview",
    async (status) => {
      // The belt-and-braces half, for the paths where targetRef is
      // stable. A stored preview must not make a finished row look
      // "already pending" — that is how a spent card gets re-served.
      const { result, key, action } = await askAgainAfter(status);
      expect(result.ok && result.alreadyPending, `${status} was re-served`).toBeFalsy();
      expect(action?.idempotency_key).toMatch(new RegExp(`^${key}:`));
    }
  );
});
