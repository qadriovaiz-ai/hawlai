// Reading a provider's webhook body into messages.
//
// M2 of docs/RESEARCH-WHATSAPP-META-DIRECT.md.
//
// WHY THIS IS A PURE FUNCTION WITH ITS OWN FILE. Nothing executes the
// webhook route's POST — every WhatsApp test in this repo reads it as
// source text. The payload shape is where all the risk lives, so it
// moved somewhere it could actually be run.
//
// THREE THINGS META DOES THAT GUPSHUP DOES NOT, each a way to lose an
// owner's message, and each one asserted below:
//
//   1. `messages` is an ARRAY — Meta batches, and a parser that reads
//      [0] drops the rest. The dropped one may be the "APPROVE 2".
//   2. STATUSES arrive on the same endpoint. They have an id and no
//      `from`, and a loose parser reads them as messages from nobody.
//   3. ENTRIES AND CHANGES NEST, and only changes whose `field` is
//      "messages" are messages at all.
//
// UNVERIFIED AGAINST LIVE TRAFFIC. Written from Meta's documented
// shape and nothing else — the live run is M4. Shopify needed four
// corrections after meeting a real store, three invisible to a green
// suite; WordPress, probed live first, needed none.

import { describe, it, expect } from "vitest";
import { readInbound } from "@/lib/whatsapp/inbound";

/** One Meta delivery, with whatever `value` the case needs. */
const delivery = (value: unknown, field = "messages") => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field, value }] }],
});

const textMessage = (from: string, body: string, over: Record<string, unknown> = {}) => ({
  from,
  id: `wamid.${body}`,
  timestamp: "1700000000",
  type: "text",
  text: { body },
  ...over,
});

describe("1. META BATCHES, so every message is read", () => {
  it("THE LOAD-BEARING ONE: three messages in one delivery are all returned, in order", () => {
    // A parser that read [0] would drop two — and the dropped one is
    // as likely to be the decision as the chat.
    const read = readInbound(
      delivery({ messages: [textMessage("919000000001", "first"), textMessage("919000000001", "APPROVE 2"), textMessage("919000000001", "third")] }),
      "meta"
    );
    expect(read.messages.map((m) => m.text)).toEqual(["first", "APPROVE 2", "third"]);
  });

  it("and several entries, each with several changes, are all read", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [
        { id: "A", changes: [{ field: "messages", value: { messages: [textMessage("91900", "one")] } }] },
        {
          id: "B",
          changes: [
            { field: "messages", value: { messages: [textMessage("91901", "two")] } },
            { field: "messages", value: { messages: [textMessage("91902", "three")] } },
          ],
        },
      ],
    };
    expect(readInbound(body, "meta").messages.map((m) => m.text)).toEqual(["one", "two", "three"]);
  });

  it("the sender is normalised to digits", () => {
    const read = readInbound(delivery({ messages: [textMessage("+91 81150 15907", "hi")] }), "meta");
    expect(read.messages[0].phone).toBe("918115015907");
  });
});

describe("2. STATUSES ARE NOT MESSAGES", () => {
  it("THE LOAD-BEARING ONE: a delivery receipt produces nothing, and says so", () => {
    // They arrive on the same endpoint, constantly, and have no
    // `from`. A loose parser reads them as a message from nobody.
    const read = readInbound(
      delivery({ statuses: [{ id: "wamid.x", status: "delivered", recipient_id: "919000000001", timestamp: "1700000000" }] }),
      "meta"
    );
    expect(read.messages).toEqual([]);
    expect(read.skipped.join(" ")).toMatch(/delivery status/);
  });

  it("STATUSES ARE NEVER A SOURCE OF MESSAGES, structurally", () => {
    // DELIBERATELY ADVERSARIAL FIXTURE. A real Meta status has
    // `recipient_id` and no `type`, so merging the two arrays looks
    // harmless on real traffic — a mutation doing exactly that
    // SURVIVED every realistic case here, because the statuses simply
    // fell out as "unknown type".
    //
    // The rule being pinned is structural: `messages` is the only
    // array messages come from. A status dressed as a text message
    // must still produce nothing, or a future tidy-up that merges the
    // two is invisible until a provider sends a shape nobody expected.
    const read = readInbound(
      delivery({ statuses: [{ id: "wamid.x", status: "delivered", from: "919000000001", type: "text", text: { body: "APPROVE 1" } }] }),
      "meta"
    );
    expect(read.messages, "a delivery status was read as an instruction").toEqual([]);
  });

  it("and a statuses payload that ALSO carries a message does not lose the message", () => {
    const read = readInbound(
      delivery({ statuses: [{ id: "wamid.x", status: "read" }], messages: [textMessage("91900", "still here")] }),
      "meta"
    );
    expect(read.messages.map((m) => m.text)).toEqual(["still here"]);
  });
});

describe("3. ONLY `messages` CHANGES ARE MESSAGES", () => {
  it("THE LOAD-BEARING ONE: an account update is not read as a message", () => {
    // A WhatsApp Business Account also emits account_update and
    // phone_number_quality_update on the same subscription. Reading
    // their `value` as a message is how a parser invents a sender.
    const read = readInbound(
      delivery({ messages: [textMessage("91900", "should not be read")] }, "account_update"),
      "meta"
    );
    expect(read.messages).toEqual([]);
    expect(read.skipped.join(" ")).toMatch(/account_update/);
  });
});

describe("4. NON-TEXT IS SKIPPED, NOT MISHANDLED", () => {
  it("THE LOAD-BEARING ONE: an image produces no message and no empty text", () => {
    // Treating one as empty text would run a Master Chat turn on
    // nothing — a reply to a message the owner never sent.
    const read = readInbound(
      delivery({ messages: [{ from: "91900", id: "wamid.i", type: "image", image: { id: "media-1", caption: "look" } }] }),
      "meta"
    );
    expect(read.messages).toEqual([]);
    expect(read.skipped.join(" ")).toMatch(/image/);
  });

  it("every non-text type is skipped and counted", () => {
    // ───────────────────────────────────────────────────────────────
    // `button` LEFT THIS LIST ON 24 NOVEMBER 2026, with the owner's
    // explicit go-ahead. Stated here rather than quietly dropped.
    //
    // It was right while nothing understood a tap. H3's approval
    // notice is a Utility template with a quick-reply button, so a tap
    // is now the one non-text shape this product SENDS — and therefore
    // the one it must understand rather than count.
    //
    // THE SAFETY HALF IS UNCHANGED, and re-made for `button` in the
    // test below: a non-text message must never become a text
    // message. That was always the property. "Counted in skipped" was
    // how an UNHANDLED type satisfied it, not the property itself.
    //
    // WHAT GENUINELY NARROWS, said plainly: if some other shape of
    // `type: "button"` arrives that we do not handle, this list no
    // longer catches it. tests/whatsappTap.test.ts carries the
    // replacement coverage, including that the label must never be
    // read as text.
    // ───────────────────────────────────────────────────────────────
    for (const type of ["image", "audio", "document", "sticker", "location", "interactive", "reaction", "unsupported"]) {
      const read = readInbound(delivery({ messages: [{ from: "91900", id: "x", type }] }), "meta");
      expect(read.messages, type).toEqual([]);
      expect(read.skipped.join(" "), type).toContain(type);
    }
  });

  it("AND A BUTTON TAP IS HANDLED RATHER THAN COUNTED — still never a message", () => {
    // The replacement for `button`'s entry above. The dangerous
    // reading is the LABEL becoming text: "Review request" would reach
    // Master Chat, spending a model call to answer a sentence nobody
    // wrote, and would pass through parseDecision on the way there.
    const read = readInbound(
      delivery({ messages: [{ from: "91900", id: "x", type: "button", button: { text: "Review request", payload: "ap-1" } }] }),
      "meta"
    );
    expect(read.messages, "a button tap was read as a text message").toEqual([]);
    expect(read.taps.length).toBe(1);
    expect(read.taps[0].payload).toBe("ap-1");
    expect(read.skipped.join(" "), "a handled tap was also counted as skipped").not.toContain("button");
  });

  it("A TEXT MESSAGE IN A BATCH SURVIVES ITS NON-TEXT NEIGHBOURS", () => {
    // The case that matters: he sends a photo and then types APPROVE.
    const read = readInbound(
      delivery({
        messages: [
          { from: "91900", id: "a", type: "image", image: { id: "m" } },
          textMessage("91900", "APPROVE 1"),
          { from: "91900", id: "c", type: "sticker", sticker: { id: "s" } },
        ],
      }),
      "meta"
    );
    expect(read.messages.map((m) => m.text)).toEqual(["APPROVE 1"]);
  });

  it("a text message with no body or no sender is skipped rather than half-read", () => {
    for (const message of [
      { from: "91900", type: "text", text: {} },
      { from: "91900", type: "text", text: { body: "   " } },
      { type: "text", text: { body: "hello" } },
      { from: "", type: "text", text: { body: "hello" } },
    ]) {
      expect(readInbound(delivery({ messages: [message] }), "meta").messages).toEqual([]);
    }
  });
});

describe("5. A SHAPE IT DOES NOT RECOGNISE PRODUCES NOTHING, AND EXPLAINS", () => {
  it("THE LOAD-BEARING ONE: nothing actionable always comes with a reason", () => {
    // An empty read with no explanation is indistinguishable from a
    // provider that never called — the hardest WhatsApp report to
    // answer is "nothing happened".
    for (const body of [{}, { entry: [] }, { object: "whatsapp_business_account" }, null, "not an object", 42]) {
      const read = readInbound(body, "meta");
      expect(read.messages, JSON.stringify(body)).toEqual([]);
      expect(read.skipped.length, JSON.stringify(body)).toBeGreaterThan(0);
    }
  });

  it("it does not throw on anything, however malformed", () => {
    for (const body of [{ entry: "not an array" }, { entry: [{ changes: "no" }] }, { entry: [{ changes: [{ value: { messages: "no" } }] }] }, { entry: [null] }]) {
      expect(() => readInbound(body, "meta"), JSON.stringify(body)).not.toThrow();
    }
  });

  it("and a reason never carries a body or a number", () => {
    const read = readInbound(
      delivery({ messages: [{ from: "919000000001", id: "x", type: "image", image: { caption: "a secret caption" } }] }),
      "meta"
    );
    const said = read.skipped.join(" ");
    expect(said).not.toContain("919000000001");
    expect(said).not.toContain("secret caption");
  });
});

describe("6. GUPSHUP IS UNCHANGED, because it was kept on purpose", () => {
  it("THE LOAD-BEARING ONE: its documented shape still reads", () => {
    const read = readInbound(
      { payload: { type: "text", sender: { phone: "919000000001" }, payload: { text: "hello" } } },
      "gupshup"
    );
    expect(read.messages).toEqual([{ phone: "919000000001", text: "hello" }]);
  });

  it("and the defensive fallbacks it shipped with still work", () => {
    expect(readInbound({ source: "919000000001", text: "hi" }, "gupshup").messages).toEqual([{ phone: "919000000001", text: "hi" }]);
    expect(readInbound({ payload: { source: "919000000001", text: "hi" } }, "gupshup").messages).toEqual([{ phone: "919000000001", text: "hi" }]);
  });

  it("a non-text Gupshup message is skipped, as it always was", () => {
    expect(readInbound({ payload: { type: "image", sender: { phone: "91900" } } }, "gupshup").messages).toEqual([]);
  });

  it("META'S SHAPE IS NOT READ AS GUPSHUP'S, AND VICE VERSA", () => {
    // The whole reason the provider is an argument rather than a
    // guess: two shapes that overlap in the wrong place would silently
    // pick each other's fields.
    const metaBody = delivery({ messages: [textMessage("91900", "hello")] });
    expect(readInbound(metaBody, "gupshup").messages, "Gupshup read a Meta payload").toEqual([]);

    const gupshupBody = { payload: { type: "text", sender: { phone: "91900" }, payload: { text: "hello" } } };
    expect(readInbound(gupshupBody, "meta").messages, "Meta read a Gupshup payload").toEqual([]);
  });
});

describe("7. THE ROUTE USES IT, and handles every message", () => {
  it("THE LOAD-BEARING ONE: the loop exists and the provider is declared", async () => {
    const { code } = await import("./helpers/source");
    const src = code("src/app/api/webhooks/whatsapp/route.ts");
    expect(src).toMatch(/const read = readInbound\(body, provider\)/);
    expect(src).toMatch(/for \(const message of read\.messages\)/);
    expect(src).toMatch(/await handleOneMessage\(message\.phone, message\.text, supabase\)/);
    // The provider comes from the declared switch, not from the shape.
    expect(src).toMatch(/provider = activeProvider\(\)/);
  });

  it("the old guessing parser is gone", () => {
    const src = require("fs").readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
    expect(src).not.toMatch(/function extractIncoming/);
  });

  it("AND NOTHING ACTIONABLE IS RECORDED, not swallowed", async () => {
    const { code } = await import("./helpers/source");
    const src = code("src/app/api/webhooks/whatsapp/route.ts");
    // THE CALL, NOT THE WORDS, AND THE RIGHT CALL.
    //
    // Two mistakes in one assertion, both found by mutating. First it
    // read the outcome string, so replacing the call with
    // `void ({ ... })` left every word in place and SURVIVED —
    // recording nothing. Then, anchored on the call, it STILL
    // survived: there are TWO `recordDeliveryStandalone({ source:
    // "whatsapp", outcome: "nothing_to_reply_to" ...)` in this route —
    // one for an unset provider — and the wrong one satisfied it.
    //
    // Sliced to the branch that reports the skipped read, so only that
    // call can satisfy it.
    const branch = src.slice(src.indexOf("if (!read.messages.length"));
    expect(branch.length, "the skipped-read branch is gone").toBeGreaterThan(80);
    const call = branch.slice(0, branch.indexOf("}"));
    expect(call).toMatch(/await recordDeliveryStandalone\(\{/);
    expect(call).toMatch(/outcome: "nothing_to_reply_to"/);
    expect(call).toMatch(/read\.skipped/);
  });
});
