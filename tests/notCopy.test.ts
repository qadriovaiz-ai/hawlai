// A SENTENCE THAT IS NOT COPY AT ALL.
//
// The sixth S2a WhatsApp run, 20 October 2026. dairy-05's customer
// message contained a placeholder and the model's own questions:
//
//   FSSAI: [LICENSE NUMBER NEEDED].
//   Cannot finalize without: (1) FSSAI licence number to include; ...
//
// Every guard let it through and every one was right by its own lights:
// there is no claim in it, no figure, no strengthening word, no invented
// name. "[LICENSE NUMBER NEEDED]" would have gone to a real customer.
//
// This is the fault the three numbers do not measure, which is why it
// gets its own check and its own file.

import { describe, it, expect } from "vitest";
import { notCopySentences, notCopyNote } from "@/lib/content/notCopy";
import { code, sourceWithComments } from "./helpers/source";

describe("1. an unfilled slot", () => {
  it("THE SENTENCE THAT WOULD HAVE BEEN SENT IS CAUGHT", () => {
    expect(notCopySentences(["FSSAI: [LICENSE NUMBER NEEDED]."])).toEqual([{ sentenceIndex: 0, reason: "slot" }]);
  });

  it("whatever shape the slot takes", () => {
    const shapes = [
      "Call us on [PHONE NUMBER].",
      "Use code {{CODE}} at checkout.",
      "Order before <date> for delivery.",
      "Delivery in ____ days.",
      "Price: [].",
    ];
    for (const s of shapes) expect(notCopySentences([s])).toHaveLength(1);
  });

  it("BUT ORDINARY COPY WITH PUNCTUATION IS NOT A SLOT", () => {
    // The direction that must not over-fire. This guard removes a
    // sentence, and over-firing has been the recurring fault of this
    // whole sequence.
    const copy = [
      "Lavender candle ₹999 mein.",
      "Har ek hand-poured, small batches mein.",
      "Shipping free hai (all orders).",
      "40 hours tak jalti hai — soy wax.",
      "Reply STOP to stop these messages.",
      "Use FIRST10 for 10 percent off your first order.",
      "₹120 for 250g.",
      "Getting a fresh haircut?",
      "We've got you sorted — 400 for a clean cut, takes about 30 minutes.",
    ];
    expect(notCopySentences(copy)).toEqual([]);
  });

  it("an emoji is not a slot either", () => {
    expect(notCopySentences(["Order karo 🕯️", "💫", "Come by whenever you're free ✂️"])).toEqual([]);
  });
});

describe("2. a note about writing the message", () => {
  it("THE QUESTION BLOCK IS CAUGHT", () => {
    const found = notCopySentences([
      "Cannot finalize without: (1) FSSAI licence number to include; (2) Confirmation that bilona applies to Paneer 250g specifically.",
    ]);
    expect(found).toEqual([{ sentenceIndex: 0, reason: "meta" }]);
  });

  it("and the other ways a model says it is stuck", () => {
    for (const s of ["I need the following before this can go out.", "Offer status: to be confirmed.", "TODO: add the booking link.", "Pending confirmation of the delivery area."]) {
      expect(notCopySentences([s])).toHaveLength(1);
    }
  });

  it("BUT A LINE ASKING THE CUSTOMER FOR SOMETHING IS COPY", () => {
    // "please provide" and "fill in" were on my first list and came off
    // it for exactly these sentences.
    const copy = [
      "Please provide your address when you order.",
      "Fill in the form and we will call you back.",
      "Confirm your slot by replying here.",
      "Let us know what you need.",
    ];
    expect(notCopySentences(copy)).toEqual([]);
  });
});

describe("3. what the owner is told", () => {
  it("names the sentence and says why it is not a claim", () => {
    const sentences = ["FSSAI: [LICENSE NUMBER NEEDED].", "Cannot finalize without: (1) the licence number."];
    const note = notCopyNote(notCopySentences(sentences), sentences);
    expect(note).toMatch(/blank in it that was never filled in/);
    expect(note).toMatch(/not part of the message/);
  });

  it("and says nothing when there is nothing to say", () => {
    expect(notCopyNote([], ["Lavender candle ₹999 mein."])).toBeNull();
  });
});

describe("4. it runs in the door, before any model call", () => {
  it("THE CHECK IS WIRED AND ITS REMOVALS REACH THE OWNER", () => {
    const src = code("src/lib/content/generateCopy.ts");
    expect(src).toMatch(/const notCopy = notCopySentences\(sentences\.map\(\(s\) => s\.text\)\)/);
    expect(src).toMatch(/parsed = withoutSentences\(parsed, sentences, \[\.\.\.new Set\(notCopy\.map\(\(f\) => f\.sentenceIndex\)\)\]\)/);
    expect(src).toMatch(/\[notCopyNoteText, introducedNoteText, factBoundNote\]/);
  });

  it("the incident is recorded where the check lives", () => {
    // CLAUDE.md rule 8: the comment IS the assertion here.
    expect(sourceWithComments("src/lib/content/notCopy.ts")).toMatch(/LICENSE NUMBER NEEDED/);
    expect(sourceWithComments("src/lib/content/notCopy.ts")).toMatch(/WORSE THAN AN UNSUPPORTED CLAIM/);
  });

  it("the phrase list names what it gives up", () => {
    expect(sourceWithComments("src/lib/content/notCopy.ts")).toMatch(/A SHORT LIST, AND DELIBERATELY SO/);
    expect(sourceWithComments("src/lib/content/notCopy.ts")).toMatch(/still passes/);
  });
});
