// Telling the owner something is waiting — H3.
//
// An approval used to appear on the dashboard and nowhere else — the
// screen he is trying not to open. A card nobody knows about is a card
// nobody answers.
//
// IT GOES BY EMAIL, AND THAT WAS NOT THE FIRST CHOICE. An existing
// guard (tests/channelRules) holds that only the inbound webhook may
// send a WhatsApp message, because WhatsApp's 24-hour window means an
// unprompted send needs a Meta-approved template. The guard caught a
// design that would have failed against the live API anyway. The REPLY
// is still WhatsApp — the email carries the code H2 matches on.

import { describe, it, expect, vi, beforeEach } from "vitest";

// THE SENDER IS MOCKED SO "DID NOT SEND" IS OBSERVABLE. Without this,
// a missing address and a send that threw looked identical from
// outside — both returned false — and two mutations survived: one that
// mailed a null address, and one that sent the raw signup handle as
// the business's name.
const sentMail: { to: string; subject: string; body: string }[] = [];
vi.mock("@/lib/email/sendDealerEmail", () => ({
  ownerEmail: async (ownerId: string | null) => (ownerId ? "owner@example.test" : null),
  sendDealerEmail: async (_s: any, _d: string, to: string, subject: string, body: string) => {
    sentMail.push({ to, subject, body });
    return { sent: true };
  },
}));
import { approvalEmail, notifyOwnerOfApproval } from "@/lib/approvals/notifyOwner";
import { approvalCode, parseApprovalReply, resolveApproval } from "@/lib/whatsapp/approvalReply";
import { code } from "./helpers/source";

const ID = "a3f29c10-1111-2222-3333-444444444444";

describe("1. THE MESSAGE AND THE REPLY ARE TALKING ABOUT THE SAME ROW", () => {
  it("THE CODE IN THE EMAIL IS THE CODE H2 RESOLVES", () => {
    // THE LOAD-BEARING ONE. If these ever drifted, a "haan" would land
    // on a row he never saw — and with the critical tier included,
    // that spends money.
    const { subject, body } = approvalEmail("Candle by Qaaf", ID, "Send the Diwali email to 40 customers.");
    const shown = approvalCode(ID);
    expect(subject).toContain(shown);
    expect(body).toContain(shown);

    const reply = parseApprovalReply(`haan ${shown}`)!;
    const resolved = resolveApproval([{ id: ID }, { id: "bd7e0000-0000-0000-0000-000000000000" }], reply);
    expect(resolved.ok).toBe(true);
    expect((resolved as any).approval.id).toBe(ID);
  });

  it("THE CODE IS IN THE SUBJECT, which is what a phone shows unopened", () => {
    expect(approvalEmail("X", ID, "c").subject).toContain(approvalCode(ID));
  });

  it("AND IT CARRIES THE CARD'S OWN SENTENCE, word for word", () => {
    // Including the dispatcher's "cannot be taken back" where there is
    // one. A paraphrase would be a second version of the same claim.
    const confirm = "Send the Diwali email to 40 customers. This cannot be taken back.";
    expect(approvalEmail("X", ID, confirm).body).toContain(confirm);
  });

  it("BOTH WAYS OUT, IN THE SAME BREATH", () => {
    const body = approvalEmail("X", ID, "c").body;
    expect(body).toMatch(new RegExp(`haan ${approvalCode(ID)}`));
    expect(body).toMatch(new RegExp(`nahi ${approvalCode(ID)}`));
  });

  it("AND IT SAYS NOTHING HAS HAPPENED YET", () => {
    // The same thing requestApproval tells the model, told to the
    // person: a draft row narrated as a completed action is finding
    // F-X1.
    expect(approvalEmail("X", ID, "c").body).toMatch(/Nothing has happened yet/);
  });

  it("the amount when there is one, and nothing when there is not", () => {
    expect(approvalEmail("X", ID, "c", 7500).body).toContain("₹7500");
    expect(approvalEmail("X", ID, "c", null).body).not.toContain("₹");
  });

  it("an empty confirm still says something true", () => {
    expect(approvalEmail("X", ID, "   ").body).toContain("waiting for your approval");
  });
});

const db = (over: Record<string, unknown> = {}) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { dealership_name: "candle_by_qaaf", owner_id: "u1", ...over } }),
        }),
      }),
    }),
  }) as any;

beforeEach(() => {
  sentMail.length = 0;
});

describe("2. IT NEVER COSTS THE APPROVAL", () => {
  it("NO OWNER ADDRESS SENDS NOTHING, and is not an error", async () => {
    // It is most businesses early on, and logging a failure for every
    // approval they raise would bury the ones that matter.
    expect(await notifyOwnerOfApproval(db({ owner_id: null }), "d1", ID, "c")).toBe(false);
    expect(sentMail).toHaveLength(0);
  });

  it("AND A BUSINESS WITH ONE IS MAILED, under its formatted name", async () => {
    // "candle_by_qaaf" is a signup handle, not what his customers —
    // or he — call the business.
    expect(await notifyOwnerOfApproval(db(), "d1", ID, "Send the thing.")).toBe(true);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].to).toBe("owner@example.test");
    expect(sentMail[0].subject).toContain("Candle by Qaaf");
    expect(sentMail[0].subject).not.toContain("candle_by_qaaf");
  });

  it("AND A THROWING CLIENT IS CAUGHT", async () => {
    const throwing = { from: () => { throw new Error("no connection"); } } as any;
    expect(await notifyOwnerOfApproval(throwing, "d1", ID, "c")).toBe(false);
  });

  // ── WAITING FOR THE WIRING ───────────────────────────────────
  //
  // These two assert that requestApproval CALLS this notifier. It does
  // not, on purpose: s6ExitTest holds that a send cannot be reached
  // from a tool at all, with every door open, and requestApproval is
  // on every approval-raising tool's path. The guard is right and the
  // code moved rather than the guard.
  //
  // They are skipped rather than deleted because the wiring is coming:
  // when the Meta WhatsApp template is approved, H3 sends over
  // WhatsApp from the webhook — which is already the one permitted
  // sender — and these two are what will prove it is wired in the
  // right order. Un-skip them then.
  it.skip("IT RUNS AFTER THE ROW IS WRITTEN", () => {
    // THE ORDER IS THE SAFETY PROPERTY. The approval exists and the
    // dashboard has it; losing the message is a worse day, not a lost
    // decision.
    const src = code("src/lib/chat/requestApproval.ts");
    const insert = src.indexOf('.from("pending_approvals")');
    const guard = src.indexOf("Couldn't create the approval");
    const notify = src.indexOf("notifyOwnerOfApproval(");
    expect(insert).toBeLessThan(guard);
    expect(guard).toBeLessThan(notify);
  });

  it.skip("AND ITS ANSWER CANNOT CHANGE THE RESULT", () => {
    const src = code("src/lib/chat/requestApproval.ts");
    expect(src).toMatch(/await notifyOwnerOfApproval\(supabase, dealershipId, data\.id, confirm, req\.amount \?\? null\);/);
    expect(src).not.toMatch(/if \(!\(await notifyOwnerOfApproval/);
  });

  it("ONE EMAIL PER APPROVAL, EVEN IF THIS RUNS TWICE", () => {
    // A retried request must not ask him twice to make one decision.
    const src = code("src/lib/approvals/notifyOwner.ts");
    expect(src).toMatch(/idempotencyKey: `approval-notice:\$\{approvalId\}`/);
  });
});

describe("3. IT RESPECTS THE WHATSAPP GUARD RATHER THAN WORKING AROUND IT", () => {
  it("THIS FILE SENDS NO WHATSAPP MESSAGE", () => {
    // The guard allows exactly one sender — the inbound webhook. This
    // is the second time in the Hawl work that an existing test caught
    // a design, and the code changed rather than the test.
    const src = code("src/lib/approvals/notifyOwner.ts");
    expect(src).not.toMatch(/sendWhatsApp/);
    expect(src).not.toMatch(/gupshup/i);
  });

  it("AND THE GUARD ITSELF IS UNTOUCHED", () => {
    const guard = code("tests/channelRules.test.ts");
    expect(guard).toMatch(/expect\(senders\)\.toEqual\(\["app\/api\/webhooks\/whatsapp\/route\.ts"\]\)/);
  });

  it("but it borrows the code from the WhatsApp side, not a second slice", () => {
    // One definition, so the email and the reply cannot drift.
    const src = code("src/lib/approvals/notifyOwner.ts");
    expect(src).toMatch(/import \{ approvalCode \} from "@\/lib\/whatsapp\/approvalReply"/);
    expect(src).not.toMatch(/slice\(0, 4\)/);
  });
});
