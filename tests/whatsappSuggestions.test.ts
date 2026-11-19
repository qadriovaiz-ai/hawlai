// Confirming a discovered answer from the phone — D4, 19 November 2026.
//
// D1-D3 built the four states (suggested / answered / rejected /
// skipped) and the provenance that survives them. D4 adds no state and
// no column: it adds a second place to say yes.
//
// WHY IT MATTERS THAT IT IS WHATSAPP. The owner this is for does not
// open a dashboard. A suggestion waiting on a screen he never visits is
// a question that is never answered — and the interview then asks him
// the same thing properly, which is the product asking twice for
// something it had already worked out.
//
// ─────────────────────────────────────────────────────────────────────
// THE ONE THING THAT WOULD HAVE BEEN A BUG
// ─────────────────────────────────────────────────────────────────────
//
// Copying H2's resolver for suggestions was the obvious move and the
// wrong one. TWO SEPARATE RESOLVERS CANNOT SEE EACH OTHER: with an
// approval and a suggestion both waiting, each would find exactly one
// match in its own queue and each would act. A "haan" meant for a phone
// number would approve a spend.
//
// So there is one pool, and the ambiguity H2 refuses is still refused
// when the two candidates are different KINDS of thing.

import { describe, it, expect } from "vitest";
import {
  parseDecision,
  resolvePending,
  cannotTell,
  shortCode,
  type Pending,
} from "@/lib/whatsapp/pendingReply";
import { describeSuggestion, pendingSuggestionRows, SHOWN_CHARS } from "@/lib/whatsapp/suggestionReply";
import { code } from "./helpers/source";

const WEBHOOK = "src/app/api/webhooks/whatsapp/route.ts";

const approval = (id: string): Pending => ({ id, kind: "approval", describe: "send email — ₹0" });
const suggestion = (id: string): Pending => ({ id, kind: "suggestion", describe: "What number...\n  \"98765\" (found on your site)" });

describe("1. ONE POOL, OR A HAAN LANDS ON THE WRONG THING", () => {
  it("THE LOAD-BEARING ONE: one of each waiting is AMBIGUOUS, not two single matches", () => {
    // Two separate resolvers would each return ok here. That is the
    // bug this shape exists to prevent, and it is why the resolver is
    // shared rather than copied.
    const pool = [approval("aaaa1111-0000-0000-0000-000000000000"), suggestion("bbbb2222-0000-0000-0000-000000000000")];
    const out = resolvePending(pool, { decision: "approved", code: null });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toBe("ambiguous");
  });

  it("AND THE QUESTION BACK LISTS BOTH KINDS", () => {
    // Listing only approvals would leave the owner unable to answer
    // about the one he actually meant.
    const pool = [approval("aaaa1111-0000-0000-0000-000000000000"), suggestion("bbbb2222-0000-0000-0000-000000000000")];
    const said = cannotTell("ambiguous", pool);
    expect(said).toMatch(/2 things are waiting/);
    expect(said).toMatch(/AAAA/);
    expect(said).toMatch(/BBBB/);
  });

  it("A CODE PINS IT ACROSS KINDS", () => {
    const pool = [approval("aaaa1111-0000-0000-0000-000000000000"), suggestion("bbbb2222-0000-0000-0000-000000000000")];
    const out = resolvePending(pool, { decision: "approved", code: "BBBB" });
    expect(out.ok && out.row.kind).toBe("suggestion");
  });

  it("ONE THING WAITING STILL NEEDS NO CODE, whichever kind it is", () => {
    // The one-pending exception is what makes this usable at all.
    expect(resolvePending([suggestion("bbbb2222-0000-0000-0000-000000000000")], { decision: "approved", code: null }).ok).toBe(true);
    expect(resolvePending([approval("aaaa1111-0000-0000-0000-000000000000")], { decision: "rejected", code: null }).ok).toBe(true);
  });

  it("nothing waiting says so plainly", () => {
    expect(cannotTell("none_pending", [])).toMatch(/Nothing is waiting/);
  });
});

describe("2. THE NARROW PARSE IS UNCHANGED", () => {
  it("a short yes or no in either language", () => {
    expect(parseDecision("haan")).toEqual({ decision: "approved", code: null });
    expect(parseDecision("nahi")).toEqual({ decision: "rejected", code: null });
    expect(parseDecision("yes A3F2")).toEqual({ decision: "approved", code: "A3F2" });
  });

  it("A SENTENCE IS NOT A DECISION", () => {
    // "no, the blue one is wrong" is a reply to a conversation. This
    // must never swallow an ordinary message that contains "no".
    expect(parseDecision("no, the blue one is wrong")).toBeNull();
  });

  it("AND BOTH WORDS AT ONCE IS NOT EITHER", () => {
    expect(parseDecision("haan nahi")).toBeNull();
  });
});

describe("3. A SUGGESTION READS AS SOMETHING ANSWERABLE", () => {
  const s = { questionKey: "public_phone", value: "98765 43210", source: "discovered" as const, evidence: null };

  it("THE QUESTION AND THE ANSWER BOTH", () => {
    // A value alone is not something anybody can say yes to — it has
    // to be clear what it is an answer TO.
    const said = describeSuggestion(s);
    expect(said).toMatch(/customer call or message you on/);
    expect(said).toMatch(/98765 43210/);
  });

  it("WHERE IT CAME FROM IS PART OF THE QUESTION", () => {
    // D1 drew the line between a transcription and a deduction on
    // purpose. Hiding it at the moment of acting would throw it away.
    expect(describeSuggestion(s)).toMatch(/found on your site/);
    expect(describeSuggestion({ ...s, source: "inferred" })).toMatch(/worked out from your details/);
  });

  it("A LONG VALUE IS CUT, because this is read on a phone", () => {
    const long = { ...s, value: "x".repeat(SHOWN_CHARS + 40) };
    expect(describeSuggestion(long)).toMatch(/…/);
    expect(describeSuggestion(long).length).toBeLessThan(SHOWN_CHARS + 160);
  });

  it("ONLY `suggested` ROWS ARE WAITING", () => {
    // answered, rejected and skipped are all decided. Offering one
    // again is arguing with the owner.
    const rows = [
      { id: "11111111-0000-0000-0000-000000000000", question_key: "public_phone", status: "suggested", source: "discovered", suggested_value: "98765" },
      { id: "22222222-0000-0000-0000-000000000000", question_key: "opening_hours", status: "answered", source: "owner", suggested_value: "9-6" },
      { id: "33333333-0000-0000-0000-000000000000", question_key: "street_address", status: "rejected", source: "discovered", suggested_value: null },
    ];
    const out = pendingSuggestionRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("suggestion");
  });

  it("AND THE CODE COMES FROM THE ROW'S OWN id", () => {
    // Not from question_key. An approval code and a suggestion code
    // have to mean the same kind of thing, or two identical-looking
    // codes would behave differently.
    const rows = [{ id: "abcd1234-0000-0000-0000-000000000000", question_key: "public_phone", status: "suggested", source: "discovered", suggested_value: "98765" }];
    expect(shortCode(pendingSuggestionRows(rows)[0].id)).toBe("ABCD");
  });

  it("a row with no value is not waiting, whatever its status says", () => {
    const rows = [{ id: "11111111-0000-0000-0000-000000000000", question_key: "public_phone", status: "suggested", source: "discovered", suggested_value: "" }];
    expect(pendingSuggestionRows(rows)).toEqual([]);
  });
});

describe("4. CONFIRMING GOES THROUGH THE SAME DOOR AS TYPING IT", () => {
  const src = () => code("src/lib/whatsapp/suggestionReply.ts");

  it("THE LOAD-BEARING ONE: an accept calls saveInterviewAnswer", () => {
    // Flipping the status alone would leave the fact in
    // interview_answers and never in business_knowledge, which is
    // where it is read from. That is a half-accept and worse than no
    // feature — the reason task 2a extracted this function at all.
    expect(src()).toMatch(/await saveInterviewAnswer\(service, dealershipId, question, suggestion\.value, rows\)/);
  });

  it("AND A REJECT CALLS rejectSuggestion, not the skip write", () => {
    // D3's line: rejecting says "that answer is wrong", so the
    // question stays in the interview to be asked properly. Skipping
    // says "don't ask me this".
    const s = src();
    expect(s).toMatch(/await rejectSuggestion\(service, dealershipId, suggestion\.questionKey\)/);
    expect(s).not.toMatch(/status: "skipped"/);
  });

  it("A THIN SUGGESTION IS SENT BACK, exactly as the web form would", () => {
    // Storing on a phone what a browser would have refused would make
    // WhatsApp the weaker door.
    const s = src();
    expect(s).toMatch(/if \(!outcome\.ok\)/);
    expect(s).toMatch(/outcome\.followUp/);
  });

  it("a question nobody declared is refused rather than guessed at", () => {
    expect(src()).toMatch(/if \(!question\) return \{ ok: false/);
  });
});

describe("5. THE WEBHOOK WIRES IT THE RIGHT WAY ROUND", () => {
  const src = () => code(WEBHOOK);

  it("BOTH QUEUES ARE READ BEFORE ANYTHING IS RESOLVED", () => {
    const s = src();
    const approvals = s.indexOf('from("pending_approvals")');
    const answers = s.indexOf('from("interview_answers")');
    const resolve = s.indexOf("const found = resolvePending(");
    expect(approvals).toBeGreaterThan(-1);
    expect(answers).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(approvals);
    expect(resolve).toBeGreaterThan(answers);
  });

  it("THERE IS EXACTLY ONE RESOLVE CALL", () => {
    // Two would be two pools, which is the bug.
    expect((src().match(/resolvePending\(/g) ?? [])).toHaveLength(1);
  });

  it("AND IT DISPATCHES ON THE KIND", () => {
    const s = src();
    expect(s).toMatch(/if \(found\.row\.kind === "suggestion"\)/);
    expect(s).toMatch(/applySuggestionDecision\(/);
    expect(s).toMatch(/applyApprovalDecision\(/);
  });

  it("THE SUGGESTION READ IS SCOPED TO THIS BUSINESS", () => {
    const s = src();
    const at = s.indexOf('from("interview_answers")');
    expect(s.slice(at, at + 300)).toMatch(/\.eq\("dealership_id", dealership\.id\)/);
  });

  it("AND A ROW THAT STOPPED WAITING IS SAID SO, not acted on", () => {
    // The pool was read a moment ago; it can change underneath.
    expect((src().match(/isn't waiting any more/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
