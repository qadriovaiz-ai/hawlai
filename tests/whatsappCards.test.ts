// A CARD MADE ON WHATSAPP CAN BE APPROVED FROM WHATSAPP — E2 of
// docs/PLAN-INSTAGRAM-STORE-AND-PRODUCT-EDITS.md, 28 November 2026.
//
// "Clay Mug ka price 499 karo" over WhatsApp made an approval card, and
// the chat's reply said to approve it on the card — which WhatsApp does
// not show. The owner had no code to type. Each card is now a line with
// its code and what it will do.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { cardsForWhatsApp, approvalCode } from "@/lib/whatsapp/approvalReply";
import { parseDecision, resolvePending } from "@/lib/whatsapp/pendingReply";

const ID = "a3f2c9d0-1111-4222-8333-444455556666";

describe("the card, as WhatsApp can show it", () => {
  it("ITS CODE, WHAT IT WILL DO IN THE CARD'S OWN WORDS, AND HOW TO ANSWER", () => {
    const text = cardsForWhatsApp([{ approval: { id: ID }, confirm: "Change Clay Mug's price from ₹450 to ₹499." }])!;
    expect(text).toBe(`Waiting for your OK:\n• A3F2: Change Clay Mug's price from ₹450 to ₹499.\n\nReply "haan A3F2" to approve, or "nahi A3F2" to reject. Nothing changes until you do.`);
  });

  it("THE CODE PRINTED IS THE CODE 'haan' RESOLVES — the round trip", () => {
    const text = cardsForWhatsApp([{ approval: { id: ID }, confirm: "x" }])!;
    const typed = /Reply "(haan \w+)"/.exec(text)![1];
    const decision = parseDecision(typed)!;
    expect(decision).toMatchObject({ decision: "approved" });
    const found = resolvePending([{ id: ID, kind: "approval", describe: "x" }, { id: "b4e1-0000", kind: "approval", describe: "y" }], decision);
    expect(found).toMatchObject({ ok: true, row: { id: ID } });
    expect(approvalCode(ID)).toBe("A3F2");
  });

  it("EVERY CARD OF THE TURN IS LISTED; A TURN WITH NO CARD ADDS NOTHING", () => {
    const two = cardsForWhatsApp([{ approval: { id: ID }, confirm: "one" }, { type: "image" } as any, { approval: { id: "b4e10000-0000-4000-8000-000000000000" }, label: "two" }])!;
    expect(two).toContain("• A3F2: one");
    expect(two).toContain("• B4E1: two");
    expect(cardsForWhatsApp([{ type: "image" } as any])).toBeNull();
    expect(cardsForWhatsApp([])).toBeNull();
  });

  it("A LONG SENTENCE IS KEPT TO ONE READABLE LINE", () => {
    const text = cardsForWhatsApp([{ approval: { id: ID }, confirm: `Change it.\n${"x".repeat(400)}` }])!;
    expect(text.split("\n")[1].length).toBeLessThanOrEqual(310);
  });

  it("THE WEBHOOK SENDS THEM AFTER THE CHAT'S REPLY — read with comments stripped", () => {
    expect(code("src/app/api/webhooks/whatsapp/route.ts")).toMatch(
      /await sendWhatsAppText\(phone, result\.reply\);\s*const cards = cardsForWhatsApp\(result\.artifacts as any\[\]\);\s*if \(cards\) await sendWhatsAppText\(phone, cards\);/
    );
  });
});
