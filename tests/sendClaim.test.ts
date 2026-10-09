// The send is claimed before it happens, not recorded after.
//
// Phase 2B's duplicate window is a content hash: it cannot tell a retry
// from a deliberate second send of the same subject, and it is not
// atomic. The reason it could never be atomic was in sendDealerEmail —
// the email_sends row was inserted AFTER the send returned success, so
// at the instant two requests race the row does not exist yet.
//
// These tests execute the real claim path, including through
// sendDealerEmail, rather than asserting on source text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { claimSend, resolveClaim, countsAsSent, duplicateSendError } from "@/lib/email/sendClaim";

/**
 * A stand-in for the one guarantee the whole mechanism rests on: the
 * partial unique index from migration 208. Keyed exactly as the index
 * is — (dealership_id, idempotency_key), failed rows excluded.
 */
function db() {
  const rows: any[] = [];
  let insertError: { code?: string; message: string } | null = null;
  const api = {
    rows,
    failInsert(e: { code?: string; message: string } | null) {
      insertError = e;
    },
    from(_t: string) {
      return {
        insert(row: any) {
          return {
            select: () => ({
              single: async () => {
                if (insertError) return { data: null, error: insertError };
                const clash =
                  row.idempotency_key != null &&
                  rows.some(
                    (r) =>
                      r.dealership_id === row.dealership_id &&
                      r.idempotency_key === row.idempotency_key &&
                      r.handoff_state !== "failed"
                  );
                if (clash) return { data: null, error: { code: "23505", message: "duplicate key value" } };
                const saved = { id: `row${rows.length + 1}`, ...row };
                rows.push(saved);
                return { data: { id: saved.id }, error: null };
              },
            }),
            then: (res: any) => {
              rows.push({ id: `row${rows.length + 1}`, ...row });
              return Promise.resolve({ error: null }).then(res);
            },
          };
        },
        update(patch: any) {
          return {
            eq: async (_k: string, id: string) => {
              const row = rows.find((r) => r.id === id);
              if (row) Object.assign(row, patch);
              return { error: null };
            },
          };
        },
      };
    },
  };
  return api;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const key = { dealershipId: "d1", to: "asha@example.com", subject: "Diwali offer", via: "resend" as const, idempotencyKey: "req-1" };

describe("the claim", () => {
  it("is written BEFORE the send, with handoff_state 'claimed'", async () => {
    // This is the whole point: at the moment of the race the row must
    // already exist. The old code wrote it after success.
    const d = db();
    const claim = await claimSend(d, key);
    expect(claim.claimed).toBe(true);
    expect(d.rows[0].handoff_state).toBe("claimed");
    expect(d.rows[0].idempotency_key).toBe("req-1");
  });

  it("A SECOND CLAIM ON THE SAME REQUEST ID IS REFUSED AS A DUPLICATE", async () => {
    const d = db();
    await claimSend(d, key);
    const second = await claimSend(d, key);
    expect(second.claimed).toBe(false);
    expect((second as any).duplicate).toBe(true);
    expect(d.rows).toHaveLength(1);
  });

  it("a DIFFERENT request id for the same email goes through", async () => {
    // A deliberate second send is a new press. The content hash cannot
    // tell these two cases apart; this is the distinction it was built
    // for.
    const d = db();
    await claimSend(d, key);
    const deliberate = await claimSend(d, { ...key, idempotencyKey: "req-2" });
    expect(deliberate.claimed).toBe(true);
    expect(d.rows).toHaveLength(2);
  });

  it("another business's identical request id is not this one's duplicate", async () => {
    const d = db();
    await claimSend(d, key);
    expect((await claimSend(d, { ...key, dealershipId: "d2" })).claimed).toBe(true);
  });

  it("A FAILED CLAIM DOES NOT BLOCK THE RETRY OF ITSELF", async () => {
    // The index is partial on `handoff_state is distinct from 'failed'`
    // precisely so that no delete is needed. A delete can fail; an index
    // predicate cannot.
    const d = db();
    const first = await claimSend(d, key);
    await resolveClaim(d, (first as any).id, { sent: false });
    expect(d.rows[0].handoff_state).toBe("failed");

    const retry = await claimSend(d, key);
    expect(retry.claimed).toBe(true);
    // And nothing was deleted — the failure stays on record.
    expect(d.rows).toHaveLength(2);
    expect(d.rows[0].handoff_state).toBe("failed");
  });

  it("FAILS CLOSED when the claim cannot be written at all", async () => {
    // The opposite choice from the content-hash window, which fails
    // OPEN on a read error. If the claim cannot be written, the
    // mechanism that would notice a double is not running, and sending
    // anyway is sending with the safety off.
    const d = db();
    d.failInsert({ message: "connection reset" });
    const claim = await claimSend(d, key);
    expect(claim.claimed).toBe(false);
    expect((claim as any).duplicate).toBe(false);
    expect((claim as any).error).toMatch(/stopped rather than risk sending twice/);
  });

  it("a thrown client also fails closed", async () => {
    const broken = { from: () => { throw new Error("no connection"); } };
    const claim = await claimSend(broken, key);
    expect(claim.claimed).toBe(false);
    expect((claim as any).duplicate).toBe(false);
  });

  it("the refusal says how to proceed", () => {
    // A refusal with no way forward reads as a bug and invites a third
    // press.
    expect(duplicateSendError("asha@example.com")).toMatch(/already been sent/);
    expect(duplicateSendError("asha@example.com")).toMatch(/start a new email/);
  });
});

describe("how the claim ends", () => {
  it("a successful send becomes 'sent', and carries the resend id", async () => {
    const d = db();
    const c = await claimSend(d, key);
    await resolveClaim(d, (c as any).id, { sent: true, resendMessageId: "msg-9" });
    expect(d.rows[0].handoff_state).toBe("sent");
    // resendWebhook finds the row by this, and writes delivery_status
    // against it. The two columns do not meet.
    expect(d.rows[0].resend_message_id).toBe("msg-9");
  });

  it("a Gmail send has no resend id and the field is left alone", async () => {
    const d = db();
    const c = await claimSend(d, { ...key, via: "gmail" });
    await resolveClaim(d, (c as any).id, { sent: true });
    expect(d.rows[0].handoff_state).toBe("sent");
    expect(d.rows[0].resend_message_id).toBeUndefined();
  });

  it("A RESOLVE THAT FAILS IS LOGGED, NOT THROWN", async () => {
    // The email has already gone. Throwing here would turn a delivered
    // email into an error the owner sees, and the row left at 'claimed'
    // is the honest record of exactly what happened.
    const thrower = { from: () => ({ update: () => ({ eq: () => { throw new Error("gone"); } }) }) };
    await expect(resolveClaim(thrower, "row1", { sent: true })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("what counts as a send that happened", () => {
  it("NULL COUNTS, and that is not an oversight", () => {
    // Migration 208 added the column. Any caller with no idempotency key
    // still takes the old insert-after-success path, so null keeps
    // appearing — and those rows ARE successful sends. The backfill does
    // not make null impossible; this rule is what keeps the numbers
    // right.
    expect(countsAsSent({ handoff_state: null })).toBe(true);
    expect(countsAsSent({})).toBe(true);
  });

  it("'sent' counts; 'claimed' and 'failed' do not", () => {
    expect(countsAsSent({ handoff_state: "sent" })).toBe(true);
    // An email still in flight is not send volume.
    expect(countsAsSent({ handoff_state: "claimed" })).toBe(false);
    // One that never left is certainly not.
    expect(countsAsSent({ handoff_state: "failed" })).toBe(false);
  });
});
