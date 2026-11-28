// THE SHAPE OF A DM WITH NO TEXT — T1, step one, 28 November 2026.
//
// T1 (a DM that points at a post) is to be built on a REAL payload, per
// the plan. Until now a text-less DM was skipped silently. This records
// its structure for the delivery log — types and key names, never a URL,
// id, title or anything the customer sent.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { describeMessageShape } from "@/lib/dm/messageShape";

const SECRET = ["https://www.instagram.com/p/SECRET123", "17999999999999999", "my private caption", "cust@example.com"];

describe("the shape, and nothing else", () => {
  it("A SHARED POST: its attachment type and the NAMES of its payload keys", () => {
    const shape = describeMessageShape({ mid: "m1", attachments: [{ type: "share", payload: { url: SECRET[0], title: SECRET[2] } }] });
    expect(shape).toBe("attachments[share{payload:title,url}]");
  });

  it("A STORY REPLY: what it replies to, by key name", () => {
    const shape = describeMessageShape({ mid: "m1", reply_to: { story: { id: SECRET[1], url: SECRET[0] } } });
    expect(shape).toBe("reply_to{story:id,url}");
  });

  it("UNKNOWN EXTRA KEYS ARE NAMED, so a shape nobody expected is still seen", () => {
    expect(describeMessageShape({ mid: "m1", sticker_id: 123, quick_reply: { payload: "x" } })).toBe("keys{quick_reply,sticker_id}");
  });

  it("NO VALUE EVER LEAKS — not a URL, an id, a caption or an email", () => {
    const shape = describeMessageShape({
      mid: SECRET[1],
      attachments: [{ type: "share", payload: { url: SECRET[0], title: SECRET[2], email: SECRET[3] } }, { type: SECRET[0], payload: SECRET[2] }],
      reply_to: { story: { id: SECRET[1], url: SECRET[0] }, mid: SECRET[1] },
    })!;
    for (const s of SECRET) expect(shape).not.toContain(s);
    // A type that isn't a short word is not printed either.
    expect(shape).toContain("?");
  });

  it("TEXT ALONE, OR NOTHING, HAS NO SHAPE TO RECORD", () => {
    expect(describeMessageShape({ mid: "m1", text: "hi" })).toBeNull();
    expect(describeMessageShape(null)).toBeNull();
    expect(describeMessageShape("x")).toBeNull();
  });
});

describe("the webhook records it — read with comments stripped", () => {
  const src = code("src/lib/webhooks/autoReplyHandler.ts");

  it("EVERY NON-ECHO DM FROM A SENDER IS DESCRIBED — with text or without — BEFORE A TEXT-LESS ONE IS SKIPPED", () => {
    // Widened 28 Nov 2026: a story reply has TEXT and context, and the
    // first version (text-less only) missed it in the founder's test.
    expect(src).toMatch(
      /if \(senderId && !msgEvent\?\.message\?\.is_echo\) \{\s*const shape = describeMessageShape\(msgEvent\?\.message\);\s*if \(shape\) \(rawText \? contextShapes : textlessShapes\)\.push\(shape\);\s*\}[\s\S]*?if \(!senderId \|\| !text \|\| msgEvent\?\.message\?\.is_echo\) continue;/
    );
  });

  it("AND THE DELIVERY LOG CARRIES BOTH KINDS, SAID APART", () => {
    expect(src).toMatch(/textlessShapes\.length \? `a DM with no text: \$\{textlessShapes\.join\(" \| "\)\}` : ""/);
    expect(src).toMatch(/contextShapes\.length \? `a DM with text and context: \$\{contextShapes\.join\(" \| "\)\}` : ""/);
  });

  it("A PLAIN TEXT DM HAS NO SHAPE, so ordinary messages add nothing to the log", () => {
    expect(describeMessageShape({ mid: "m1", text: "iska price?" })).toBeNull();
    expect(describeMessageShape({ mid: "m1", text: "iska price?", reply_to: { story: { id: "1", url: "https://x" } } })).toBe("reply_to{story:id,url}");
  });
});
