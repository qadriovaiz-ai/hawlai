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

  // ── WIRED, 23 NOVEMBER 2026 — AND NOT THE WAY THIS SAID ──────
  //
  // These two were skipped, not deleted, with a note saying to un-skip
  // them when the wiring came. The wiring has come and BOTH ASSERTED
  // THE WRONG MECHANISM, so they are rewritten here: same two
  // properties, read off the mechanism that actually shipped.
  //
  // THE SHAPE CHANGED, THE STRENGTH DID NOT, and the reason is worth
  // keeping. They asserted that requestApproval CALLS the notifier.
  // The note explained why it did not yet — s6ExitTest holds that a
  // send cannot be reached from a chat tool at all — and then said the
  // call would arrive "when the template lands", sending from the
  // webhook, the one permitted WhatsApp sender.
  //
  // THAT PLAN WOULD NOT HAVE WORKED. The reachability walk does not
  // care which file the sender lives in. requestApproval is on every
  // approval-raising tool's path, so a call from there that ends at a
  // sender is reachable from a tool whether the sender sits in the
  // webhook, the dispatcher or anywhere else. Un-skipping them as
  // written would have required exactly the design the guard forbids.
  //
  // So the notice is raised as an EVENT and sent from
  // /api/events/dispatch, which no tool can walk to. The two
  // properties below are unchanged: it happens after the row exists,
  // and its outcome cannot touch the approval. The THIRD property —
  // that the notice is not reachable from a tool — is now assertable
  // rather than hoped for, and §4 does that.
  it("IT IS RAISED AFTER THE ROW IS WRITTEN", () => {
    // THE ORDER IS THE SAFETY PROPERTY. The approval exists and the
    // dashboard has it before anything is queued; losing the message
    // is a worse day, not a lost decision.
    const src = code("src/lib/chat/requestApproval.ts");
    const insert = src.indexOf('.from("pending_approvals")');
    const guard = src.indexOf("Couldn't create the approval");
    const emit = src.indexOf('eventType: "approval_raised"');
    expect(insert).toBeGreaterThan(-1);
    expect(emit, "nothing raises the notice any more").toBeGreaterThan(-1);
    expect(insert).toBeLessThan(guard);
    expect(guard).toBeLessThan(emit);
  });

  it("AND ITS ANSWER CANNOT CHANGE THE RESULT", () => {
    // emitEvent returns nothing and swallows its own errors, so there
    // is no answer to branch on — but a later edit could still wrap it
    // in a condition, which is what this refuses.
    const src = code("src/lib/chat/requestApproval.ts");
    expect(src).toMatch(/await emitEvent\(supabase, \{\s*dealershipId,\s*eventType: "approval_raised",/);
    expect(src, "the approval's result now depends on the notice").not.toMatch(/if\s*\(\s*!?\s*\(?\s*await emitEvent/);
    // And the sender itself is still not named on this path at all.
    expect(src, "requestApproval learned how to send").not.toMatch(/notifyOwnerOfApproval|sendDealerEmail|sendWhatsApp/);
  });

  it("A FAILING WHATSAPP LEG STILL SENDS THE EMAIL", async () => {
    // FOUND BY MUTATION — H3-e. Nothing exercised this, so removing
    // the inner try/catch around the WhatsApp send survived, and with
    // it the one failure mode that matters: the template is PENDING,
    // every send against it fails, and the owner would then get
    // NOTHING at all because the WhatsApp error reply travels the same
    // broken sender.
    //
    // WHATSAPP_PROVIDER is left unset on purpose. That is exactly how
    // the leg fails on a real deploy — fail-closed, the same refusal
    // that dropped the first two live deliveries in M4.
    sentMail.length = 0;
    process.env.WHATSAPP_APPROVAL_TEMPLATE = "approval_waiting_v2";
    delete process.env.WHATSAPP_PROVIDER;
    try {
      const client = {
        from: () => {
          const api: any = {
            select: () => api,
            eq: () => api,
            maybeSingle: async () => ({
              data: {
                dealership_name: "Candle by Qaaf",
                owner_id: "u1",
                owner_whatsapp_number: "918115015907",
                owner_whatsapp_verified: true,
              },
              error: null,
            }),
          };
          return api;
        },
      };
      expect(await notifyOwnerOfApproval(client, "d1", ID, "Send the Diwali email to 40 customers.")).toBe(true);
      expect(sentMail.length, "the WhatsApp failure took the email down with it").toBe(1);
      expect(sentMail[0].body).toContain("Send the Diwali email to 40 customers.");
    } finally {
      delete process.env.WHATSAPP_APPROVAL_TEMPLATE;
    }
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

// ──────────────────────────────────────────────────────────────────
// H3-a's own half: the event, the handler, and the thing that made
// an event necessary in the first place.
// ──────────────────────────────────────────────────────────────────

import { EVENT_HANDLERS } from "@/lib/events/eventHandlers";
import { functionIndex, reachable } from "./helpers/reachability";

type Row = Record<string, any>;

/** A client that answers one pending_approvals read and records nothing else. */
function clientFor(approval: Row | null) {
  const reads: Record<string, any>[] = [];
  const from = (table: string) => {
    const filters: Record<string, any> = {};
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => ((filters[k] = v), api),
      maybeSingle: async () => {
        reads.push({ table, ...filters });
        // notifyOwnerOfApproval reads the business for its name and
        // owner. Answered here so "did not send" means the handler
        // decided not to — not that the fake forgot the business.
        if (table === "dealerships") return { data: { dealership_name: "Candle by Qaaf", owner_id: "u1" }, error: null };
        if (table !== "pending_approvals") return { data: null, error: null };
        const match = approval && (filters.id === undefined || String(approval.id) === String(filters.id));
        return { data: match ? approval : null, error: null };
      },
    };
    return api;
  };
  return { client: { from }, reads };
}

const raise = async (approval: Row | null, event: Row) => {
  const { client } = clientFor(approval);
  for (const handler of EVENT_HANDLERS.approval_raised ?? []) {
    await handler(client as any, { id: "e1", dealership_id: "d1", event_type: "approval_raised", payload: {}, ...event } as any);
  }
};

const pending = (over: Row = {}) => ({
  id: ID,
  dealership_id: "d1",
  status: "pending",
  amount: null,
  action_details: { confirm: "Send the Diwali email to 40 customers." },
  ...over,
});

describe("4. THE EVENT IS WHY A TOOL CANNOT REACH THE SENDER", () => {
  const index = functionIndex();

  it("REQUESTING AN APPROVAL REACHES NO SENDER, with every door open", () => {
    // THE LOAD-BEARING ONE, and the reason this is an event at all.
    // s6ExitTest asserts this over a tool's case body; this asserts it
    // over requestApproval itself, which is the function on every
    // approval-raising tool's path — so if it ever reaches a sender,
    // every one of those tools does.
    //
    // No doors are closed. There is nothing to wall off: the path
    // genuinely does not exist.
    const walk = reachable(code("src/lib/chat/requestApproval.ts"), ["sendDealerEmail", "notifyOwnerOfApproval"], [], { index });
    expect(walk.found, "raising an approval can now reach a sender").toEqual([]);
  });

  it("AND THE WALK CAN SEE A SENDER WHEN THERE IS ONE TO SEE", () => {
    // A green result from a blind measure looks exactly like a green
    // result from a guarded product. So: point the same walk at the
    // handler, which really does send, and it must arrive.
    const walk = reachable(code("src/lib/events/eventHandlers.ts"), ["sendDealerEmail", "notifyOwnerOfApproval"], [], { index });
    expect(walk.found, "the walk cannot see the sender at all any more").toContain("notifyOwnerOfApproval");
  });

  it("the handler is registered under the event requestApproval raises", () => {
    const src = code("src/lib/chat/requestApproval.ts");
    expect(src).toMatch(/eventType: "approval_raised"/);
    expect(EVENT_HANDLERS.approval_raised?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("5. THE HANDLER STAYS QUIET WHEN IT SHOULD", () => {
  beforeEach(() => {
    sentMail.length = 0;
  });

  it("A PENDING APPROVAL IS MAILED, with the row's own sentence", async () => {
    await raise(pending(), { payload: { approvalId: ID } });
    expect(sentMail.length).toBe(1);
    expect(sentMail[0].body).toContain("Send the Diwali email to 40 customers.");
    expect(sentMail[0].subject).toContain(approvalCode(ID));
  });

  it("ONE ALREADY DECIDED IS NOT MAILED", async () => {
    // THE REASON THE ROW IS RE-READ. Up to two minutes pass before
    // this runs, and "this needs your OK" about something he approved
    // on the dashboard is worse than silence.
    for (const status of ["approved", "rejected", "stale"]) {
      sentMail.length = 0;
      await raise(pending({ status }), { payload: { approvalId: ID } });
      expect(sentMail.length, `a ${status} approval was mailed`).toBe(0);
    }
  });

  it("AND NEITHER IS ANOTHER BUSINESS'S ROW", async () => {
    // The dispatcher loops every business's events together, so a
    // payload naming someone else's approval must not address this
    // owner. Tenant scoping, in a loop that has no tenant of its own.
    await raise(pending({ dealership_id: "d2" }), { dealership_id: "d1", payload: { approvalId: ID } });
    expect(sentMail.length).toBe(0);
  });

  it("a vanished row sends nothing, and is not an error", async () => {
    await raise(null, { payload: { approvalId: ID } });
    expect(sentMail.length).toBe(0);
  });

  it("and a payload with no approval id does nothing at all", async () => {
    const { reads } = clientFor(pending());
    await raise(pending(), { payload: {} });
    expect(sentMail.length).toBe(0);
    expect(reads.length, "it read the table without an id to read by").toBe(0);
  });
});
