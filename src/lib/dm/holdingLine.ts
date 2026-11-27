// The honest answer when Hawlai cannot answer a DM — F2, 28 November 2026.
//
// When the claims guard withheld a reply, or the AI was down, or the
// records could not be read, the customer got NOTHING — and the seller
// found out only by opening a log. A customer who is ignored assumes the
// shop is closed.
//
// THIS SAYS ONLY WHAT IS TRUE: the message reached the business and a
// person will answer here. No price, no promise of a time, no claim —
// nothing the claims guard would need to check.

import { normaliseLanguage } from "@/lib/content/language";

export const HOLDING_LINES = {
  english: "Thanks for your message — I've passed it to the team, and they'll reply here.",
  hinglish: "Message ke liye shukriya — maine team ko bata diya hai, woh yahin reply karenge.",
  hindi: "आपके संदेश के लिए धन्यवाद — मैंने टीम को बता दिया है, वे यहीं जवाब देंगे।",
} as const;

/** The holding line in the owner's chosen language. */
export function holdingLine(language: unknown): string {
  return HOLDING_LINES[normaliseLanguage(language)];
}

/** Was this text one of the holding lines? */
export function isHoldingLine(text: unknown): boolean {
  const t = String(text ?? "").trim();
  return (Object.values(HOLDING_LINES) as string[]).includes(t);
}
