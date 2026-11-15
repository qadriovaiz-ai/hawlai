// Approving from WhatsApp, without ever guessing which one — H2.
//
// The owner decided, with the trade stated, that this includes the
// critical tier: spending, sending, publishing. That decision is what
// turns everything here from a convenience into a safety control, and
// it is why the tests below are mostly about REFUSING to act.

import { describe, it, expect } from "vitest";
import {
  parseApprovalReply,
  resolveApproval,
  approvalCode,
  describeApproval,
  cannotTell,
  CODE_CHARS,
} from "@/lib/whatsapp/approvalReply";
import { code } from "./helpers/source";

const WEBHOOK = "src/app/api/webhooks/whatsapp/route.ts";

const a = (id: string, over: Record<string, unknown> = {}) => ({ id, action_type: "send_email", amount: null, ...over });

describe("1. A BARE YES NEVER DECIDES SOMETHING WE PICKED", () => {
  it("WITH TWO PENDING, A BARE YES DECIDES NOTHING", () => {
    // THE LOAD-BEARING ONE. On the dashboard the button is attached to
    // the card; on WhatsApp "haan" two minutes later is a sentence, not
    // a choice — and with the critical tier included, the wrong choice
    // spends money.
    const out = resolveApproval([a("aaaa1111-0000-0000-0000-000000000000"), a("bbbb2222-0000-0000-0000-000000000000")], {
      decision: "approved",
      code: null,
    });
    expect(out.ok).toBe(false);
    expect((out as any).reason).toBe("ambiguous");
  });

  it("WITH EXACTLY ONE PENDING IT IS UNAMBIGUOUS, so a bare yes works", () => {
    // Nothing to confuse it with. The exception is structural, not
    // lenient.
    const only = a("aaaa1111-0000-0000-0000-000000000000");
    const out = resolveApproval([only], { decision: "approved", code: null });
    expect(out.ok).toBe(true);
    expect((out as any).approval.id).toBe(only.id);
  });

  it("AND A REJECTION IS HELD TO THE SAME STANDARD", () => {
    // Saying no is never the slow path — but rejecting the WRONG thing
    // is its own harm, so an ambiguous no is refused too.
    const out = resolveApproval([a("aaaa1111-…"), a("bbbb2222-…")], { decision: "rejected", code: null });
    expect(out.ok).toBe(false);
  });

  it("nothing pending is said plainly, not treated as an error", () => {
    const out = resolveApproval([], { decision: "approved", code: null });
    expect((out as any).reason).toBe("none_pending");
    expect(cannotTell("none_pending", [])).toMatch(/Nothing is waiting/);
  });
});

describe("2. THE REFERENCE IS THE ROW'S OWN IDENTITY, NOT A POSITION", () => {
  it("THE CODE COMES FROM THE ID, so it survives reordering", () => {
    // "APPROVE 2" looks unambiguous and is not: the second item this
    // morning is a different row by lunchtime.
    const id = "a3f29c10-1111-2222-3333-444444444444";
    expect(approvalCode(id)).toBe("A3F2");
    expect(approvalCode(id).length).toBe(CODE_CHARS);
  });

  it("AND IT PICKS THAT ROW WHATEVER ORDER THEY ARRIVE IN", () => {
    const first = a("a3f29c10-1111-2222-3333-444444444444");
    const second = a("bd7e0000-1111-2222-3333-444444444444");
    for (const rows of [[first, second], [second, first]]) {
      const out = resolveApproval(rows, { decision: "approved", code: "A3F2" });
      expect((out as any).approval.id).toBe(first.id);
    }
  });

  it("A CODE THAT MATCHES NOTHING DECIDES NOTHING", () => {
    const out = resolveApproval([a("a3f29c10-…")], { decision: "approved", code: "9999" });
    expect(out.ok).toBe(false);
    expect((out as any).reason).toBe("unknown_code");
  });

  it("AND TWO ROWS SHARING A PREFIX DECIDE NOTHING EITHER", () => {
    // Rare, not impossible — and a coin toss between them is exactly
    // what this file exists to avoid.
    const out = resolveApproval(
      [a("a3f29c10-1111-2222-3333-444444444444"), a("a3f20000-5555-6666-7777-888888888888")],
      { decision: "approved", code: "A3F2" }
    );
    expect(out.ok).toBe(false);
    expect((out as any).reason).toBe("many_match");
  });

  it("the code is matched case-insensitively, because a person types it", () => {
    const row = a("a3f29c10-1111-2222-3333-444444444444");
    expect(resolveApproval([row, a("bbbb2222-…")], { decision: "approved", code: "a3f2" }).ok).toBe(true);
  });
});

describe("3. AN ORDINARY MESSAGE IS NOT AN APPROVAL", () => {
  it("A SENTENCE IS NEVER PARSED AS A DECISION", () => {
    // THE LOAD-BEARING ONE for the other direction. "no, the blue one
    // is wrong" is a reply to a conversation; treating it as a
    // rejection would decide something nobody decided.
    for (const text of [
      "no, the blue one is wrong",
      "yes please send that to the customer tomorrow",
      "can you approve the budget change for me",
      "ok so what should I do about the pricing",
    ]) {
      expect(parseApprovalReply(text), text).toBeNull();
    }
  });

  it("AND NEITHER IS AN ORDINARY QUESTION", () => {
    expect(parseApprovalReply("what is pending?")).toBeNull();
    expect(parseApprovalReply("")).toBeNull();
    expect(parseApprovalReply(null)).toBeNull();
  });

  it("A SHORT INSTRUCTION IS, in either language", () => {
    // The owner writes Hindi and English in the same breath; a product
    // that understood one would be telling him which to approve in.
    for (const yes of ["haan", "HAAN", "yes", "approve", "theek hai", "haan A3F2", "approve a3f2"]) {
      expect(parseApprovalReply(yes)?.decision, yes).toBe("approved");
    }
    for (const no of ["nahi", "no", "reject", "cancel", "nahi A3F2"]) {
      expect(parseApprovalReply(no)?.decision, no).toBe("rejected");
    }
  });

  it("A MESSAGE CARRYING BOTH WORDS DECIDES NOTHING", () => {
    // "haan nahi" is somebody changing their mind mid-sentence. Taking
    // whichever the pattern saw first would be deciding it for them —
    // and with the critical tier included, deciding it with money.
    expect(parseApprovalReply("haan nahi")).toBeNull();
    expect(parseApprovalReply("no yes")).toBeNull();
  });

  it("THE CODE IS FOUND WHEREVER IT SITS IN THE MESSAGE", () => {
    expect(parseApprovalReply("haan A3F2")?.code).toBe("A3F2");
    expect(parseApprovalReply("A3F2 haan")?.code).toBe("A3F2");
    expect(parseApprovalReply("haan")?.code).toBeNull();
  });
});

describe("4. THE WEBHOOK DECIDES THROUGH THE ONE SHARED FUNCTION", () => {
  const src = () => code(WEBHOOK);

  it("IT CALLS applyApprovalDecision, not a second copy of the rules", () => {
    // H1 moved that decision out of the route so this channel could
    // reach the SAME one. A second implementation here is the thing
    // H1 existed to prevent.
    expect(src()).toMatch(/applyApprovalDecision\(/);
    expect(src()).not.toMatch(/from\("pending_approvals"\)\s*\.update/);
  });

  it("AND IT RUNS BEFORE MASTER CHAT", () => {
    // "haan A3F2" is an instruction about a record, not a sentence for
    // a model to interpret. Handing it to the chat would put a
    // language model in charge of whether money is spent.
    const s = src();
    const parse = s.indexOf("const reply = parseApprovalReply(text)");
    const chat = s.indexOf("runMasterBrainChat(");
    expect(parse).toBeGreaterThan(-1);
    expect(parse).toBeLessThan(chat);
  });

  it("A MESSAGE THAT IS NOT AN APPROVAL STILL REACHES THE CHAT", () => {
    // The narrow parse is only safe because the fall-through is intact.
    const s = src();
    const start = s.indexOf("const reply = parseApprovalReply(text)");
    const block = s.slice(start, s.indexOf("runMasterBrainChat("));
    expect(block).toMatch(/if \(reply\) \{/);
  });

  it("IT DECIDES AS THE OWNER, AND THE TRAIL SAYS WHATSAPP", () => {
    // Both halves matter. The owner's own auth id is truthful — he
    // really is deciding — and the label is what stops the audit trail
    // claiming a button was pressed in a browser nobody opened.
    const s = src();
    expect(s).toMatch(/userId: String\(dealership\.owner_id \?\? ""\)/);
    expect(s).toMatch(/label: `whatsapp:\$\{phone\}`/);
    expect(s).toMatch(/role: "owner"/);
  });

  it("AND IT READS ONLY THIS BUSINESS'S PENDING ROWS", () => {
    const s = src();
    const start = s.indexOf('from("pending_approvals")');
    const query = s.slice(start, s.indexOf("resolveApproval("));
    expect(query).toMatch(/\.eq\("dealership_id", dealership\.id\)/);
    expect(query).toMatch(/\.eq\("status", "pending"\)/);
  });

  it("AN UNRESOLVED MESSAGE ASKS, AND DECIDES NOTHING", () => {
    const s = src();
    const start = s.indexOf("const found = resolveApproval(");
    const block = s.slice(start, s.indexOf("applyApprovalDecision("));
    expect(block).toMatch(/if \(!found\.ok\)/);
    expect(block).toMatch(/cannotTell\(found\.reason/);
    expect(block).toMatch(/return NextResponse\.json\(\{ ok: true \}\)/);
  });
});

describe("5. WHAT THE OWNER IS TOLD", () => {
  it("EVERY ANSWER NAMES WHAT IT ACTED ON", () => {
    // "Done" on its own is how somebody finds out tomorrow that the
    // wrong thing went out.
    const said = describeApproval(a("a3f29c10-1111-2222-3333-444444444444", { action_type: "send_email" }));
    expect(said).toContain("A3F2");
    expect(said).toContain("send email");
  });

  it("AND AN AMOUNT WHEN THERE IS ONE", () => {
    expect(describeApproval(a("a3f29c10-…", { amount: 7500 }))).toContain("₹7500");
    expect(describeApproval(a("a3f29c10-…", { amount: null }))).not.toContain("₹");
  });

  it("A REFUSAL ALWAYS SAYS WHAT TO TYPE NEXT", () => {
    // "I'm not sure which" with no way forward sends him back to a
    // laptop, which is the thing this feature exists to avoid.
    const rows = [a("a3f29c10-1111-2222-3333-444444444444"), a("bd7e0000-1111-2222-3333-444444444444")];
    for (const reason of ["ambiguous", "unknown_code", "many_match"] as const) {
      const said = cannotTell(reason, rows);
      expect(said, reason).toMatch(/A3F2/);
      expect(said, reason).toMatch(/Reply with the code/);
    }
  });

  it("the webhook says what it did, naming it", () => {
    const s = code(WEBHOOK);
    expect(s).toMatch(/approved \$\{said\}/);
    expect(s).toMatch(/Rejected \$\{said\}/);
  });
});
