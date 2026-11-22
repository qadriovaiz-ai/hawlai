// The agent reads its own earlier output back.
//
// THE FINDING, 22 November 2026, from the Perceive/Observe/Memory audit.
// `chat_messages.artifacts` has existed since migration 081. Every
// assistant turn writes its artifacts there — labels, kinds, image
// urls, approval ids. NOTHING HAD EVER READ IT BACK into the model's
// context.
//
// A per-message record of this agent's own output had been
// accumulating for months, unread. The "upload isi image" failure was
// a question the database could already answer: the owner pointed at a
// picture the chat had shown him two turns earlier, and the model had
// no memory of showing it.
//
// In CoALA's terms (arXiv 2309.02427) this is the missing EPISODIC
// memory. Hawlai had semantic memory — ctx.memories, durable facts
// about the business — and no record of its own actions.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

const BRAIN = "src/lib/agents/masterBrainV2.ts";
const ROUTE = "src/app/api/master-brain/route.ts";

/** The recall block, bounded at both ends. */
function recallBlock(): string {
  const src = code(BRAIN);
  const start = src.indexOf("const recallSection = await (async () => {");
  expect(start, "the recall section is gone").toBeGreaterThan(-1);
  const end = src.indexOf("const relevantKnowledge", start);
  expect(end, "cannot find the end of the recall block").toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("1. IT READS THE STORE THAT WAS ALREADY THERE", () => {
  it("THE LOAD-BEARING ONE: it reads chat_messages.artifacts", () => {
    const b = recallBlock();
    expect(b).toMatch(/from\("chat_messages"\)/);
    expect(b).toMatch(/select\("artifacts/);
  });

  it("scoped to THIS conversation, and to the agent's own turns", () => {
    // Another conversation's output is not this conversation's memory,
    // and the owner's own messages are already in `history`.
    const b = recallBlock();
    expect(b).toMatch(/\.eq\("conversation_id", conversationId\)/);
    expect(b).toMatch(/\.eq\("role", "assistant"\)/);
  });

  it("newest first, and bounded", () => {
    // "That one" almost always means the most recent, and an unbounded
    // read would cost more context than it earns.
    const b = recallBlock();
    expect(b).toMatch(/ascending: false/);
    expect(b).toMatch(/\.limit\(12\)/);
    expect(b).toMatch(/shown\.length >= 10/);
  });

  it("IT CARRIES THE URL, which is the part a later turn needs", () => {
    // "Use that image" is answerable only with an address. Both
    // spellings, because a visual card uses `url` and a record card
    // uses `imageUrl`.
    const b = recallBlock();
    expect(b).toMatch(/a\.url/);
    expect(b).toMatch(/a\.imageUrl/);
    // And the approval id, so a later turn can talk about a decision.
    expect(b).toMatch(/a\.approval/);
  });

  it("it does NOT dump the whole card", () => {
    // A raw jsonb dump of ten turns buries the one line that matters.
    const b = recallBlock();
    expect(b).not.toMatch(/JSON\.stringify\(a\)/);
    expect(b).not.toMatch(/JSON\.stringify\(row\.artifacts\)/);
  });

  it("a card with no label is skipped, because it names nothing", () => {
    const b = recallBlock();
    expect(b).toMatch(/if \(!label\) continue/);
  });
});

describe("2. IT REACHES THE PROMPT, or none of it matters", () => {
  it("THE LOAD-BEARING ONE: the section is interpolated", () => {
    // A section computed and never interpolated is the shape this
    // codebase keeps finding — the value exists and nobody reads it,
    // which is the very bug this item fixes.
    expect(code(BRAIN)).toMatch(/\$\{recentImagesSection\}\$\{recallSection\}/);
  });

  it("and the conversation id is threaded from the route", () => {
    // Without it the section is silently empty, which would look
    // exactly like the bug still being present.
    // SLICED TO THE CALL. Asserting `activeConversationId)` anywhere in
    // the file let a mutation that removed the argument survive — the
    // route mentions that variable in several other places and one of
    // them is followed by a bracket. Fourth time this shape has cost
    // something, and the rule is in my notes: slice first, then anchor.
    const route = code(ROUTE);
    const at = route.indexOf("runMasterBrainChat(");
    expect(at, "the route no longer calls runMasterBrainChat").toBeGreaterThan(-1);
    const call = route.slice(at, route.indexOf(";", at));
    expect(call.length, "the sliced call is empty").toBeGreaterThan(20);
    expect(call, "the conversation id is not passed to the chat").toContain("activeConversationId");
  });

  it("it is OPTIONAL, so a WhatsApp turn still works", () => {
    // That caller has no chat conversation row. The section is absent
    // rather than the turn failing.
    const src = code(BRAIN);
    expect(src).toMatch(/conversationId\?: string \| null/);
    expect(recallBlock()).toMatch(/if \(!conversationId\) return ""/);
  });

  it("an empty history produces no section at all", () => {
    // A heading with nothing under it spends tokens to say nothing.
    expect(recallBlock()).toMatch(/if \(shown\.length === 0\) return ""/);
  });
});

describe("3. what it tells the model to do with the list", () => {
  it("THE LOAD-BEARING ONE: do not remake what is already there", () => {
    // The instruction that answers the failure. "isi image" cost a
    // second generation and a second charge.
    const b = recallBlock();
    expect(b).toMatch(/Do NOT remake a thing that is already here/);
  });

  it("and it says the list is the record, not a guess", () => {
    // The same reasoning as the collection clarification note: a
    // model's sense of what it probably did is not evidence against
    // what it actually did.
    const b = recallBlock();
    expect(b).toMatch(/read back from the record/);
  });

  it("it names how the owner actually points at things, in both languages", () => {
    // A rule the model cannot match to the request is a rule it will
    // not apply.
    const b = recallBlock();
    for (const phrase of ["that one", "isi wali", "woh draft"]) {
      expect(b, phrase).toContain(phrase);
    }
  });
});
