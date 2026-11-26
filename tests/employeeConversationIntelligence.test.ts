// Phase 1 — Employee Conversation Intelligence (improved).
//
// Focused tests for detectConversationLanguage — the language of the
// owner's latest message, re-derived by runMasterBrainChat every turn —
// and for the system prompt carrying the employee-conversation section
// that speaks in it. Behavior tests on the helper; wiring tests through
// code() (see tests/helpers/source.ts).

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { detectConversationLanguage } from "@/lib/agents/masterBrainV2";

describe("detectConversationLanguage (Phase 1, improved)", () => {
  it("returns bengali for Bengali script", () => {
    expect(detectConversationLanguage("আপনারা কেমন আছেন?")).toBe("bengali");
  });

  it("returns punjabi for Gurmukhi script", () => {
    expect(detectConversationLanguage("ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਅਸੀਂ ਕੀ ਕਰੀਏ?")).toBe("punjabi");
  });

  it("returns gujarati for Gujarati script", () => {
    expect(detectConversationLanguage("કેમ છો? અમને મદદ કરો.")).toBe("gujarati");
  });

  it("returns tamil for Tamil script", () => {
    expect(detectConversationLanguage("வணக்கம், நான் உங்களுக்கு என்ன செய்யலாம்?")).toBe("tamil");
  });

  it("returns telugu for Telugu script", () => {
    expect(detectConversationLanguage("నమస్తే, నేను మీకు ఎంత సహాయపడతాను?")).toBe("telugu");
  });

  it("returns kannada for Kannada script", () => {
    expect(detectConversationLanguage("ನಮಸ್ಕಾರ, ನಾನು ನಿಮಗೆ ಎಷ್ಟು ಸಹಾಯ ಮಾಡಬಲ್ಲೆನೆ?")).toBe("kannada");
  });

  it("returns malayalam for Malayalam script", () => {
    expect(detectConversationLanguage("നമസ്തേ, ഞാന്‍ നിങ്ങള്‍ക്ക് എത്രമാതിരം സഹായം തരാം?")).toBe("malayalam");
  });

  it("returns odia for Odia script", () => {
    expect(detectConversationLanguage("ନମସ୍କର, ମୋତେ ସାହାଯ୍ୟ ଚାଇଁବେ?")).toBe("odia");
  });

  it("returns urdu for Urdu in its native (Arabic) script", () => {
    expect(detectConversationLanguage("آپ کیسے ہیں؟")).toBe("urdu");
  });

  it("AND NEEDS A URDU LETTER, so Arabic and Persian are not mislabelled", () => {
    // CORRECTED 26 November 2026. U+0600–U+06FF carries Arabic,
    // Persian and Urdu alike, so testing the block alone told the
    // model to answer in Urdu to someone writing Arabic.
    //
    // Arabic-block text with none of Urdu's own letters returns null
    // — the same choice this function already makes for Devanagari.
    // A wrong language is worse than an unnamed one, because the
    // prompt's fallback tells the model to infer it from the message.
    expect(detectConversationLanguage("كيف حالك اليوم؟"), "Arabic read as Urdu").toBeNull();
    expect(detectConversationLanguage("حال شما چطور است؟"), "Persian read as Urdu").toBeNull();
  });

  it("AND THE URDU LETTERS IT KEYS ON ARE URDU'S OWN, not Persian's", () => {
    // ے ٹ ڈ ڑ ں ھ are Urdu. گ چ پ ژ are shared with Persian and are
    // deliberately not in the set — keying on one of those would
    // undo the fix above.
    for (const urdu of ["یہ ٹھیک ہے", "میں نے ڈبہ بھیجا", "آپ کے لیے"]) {
      expect(detectConversationLanguage(urdu), urdu).toBe("urdu");
    }
    // code(), NOT sourceWithComments — and that was this assertion's
    // own first failure. The comment beside the regex NAMES the
    // Persian-shared code points in order to say they are excluded, so
    // reading the comments made the test fail on the explanation
    // rather than on the code. Rule 8's trap from the other side.
    const src = code("src/lib/agents/masterBrainV2.ts");
    const at = src.indexOf("return \"urdu\"");
    expect(at).toBeGreaterThan(-1);
    const line = src.slice(src.lastIndexOf("\n", at), at);
    expect(line.length).toBeLessThan(120);
    expect(line).toContain("06D2");
    for (const persian of ["06AF", "0686", "067E", "0698"]) {
      expect(line, `U+${persian} is shared with Persian`).not.toContain(persian);
    }
  });

  it("returns null for Devanagari — never assume it is Hindi", () => {
    expect(detectConversationLanguage("तुम कैसे हो? आज का काम कैसा था?")).toBeNull();
  });

  it("returns hinglish for messages carrying Hinglish markers", () => {
    expect(detectConversationLanguage("Haan, aur haan — kya yeh sahi hai?")).toBe("hinglish");
  });

  it("returns null for Latin without Hinglish markers — do not force English", () => {
    expect(detectConversationLanguage("Hello — can you help me with the campaign plan?")).toBeNull();
    expect(detectConversationLanguage("The lavender candle sells out every Friday")).toBeNull();
  });
});

describe("runMasterBrainChat carries the Phase 1 improved employee conversation section", () => {
  const brain = code("src/lib/agents/masterBrainV2.ts");

  it("builds an employeeSection from the detected language", () => {
    expect(brain).toMatch(/const employeeLanguage = detectConversationLanguage\(message\)/);
    expect(brain).toMatch(/const employeeSection = `/);
  });

  it("the section is the employee voice, separate from the brand voice", () => {
    expect(brain).toContain("## Employee conversation — your voice, not the brand voice");
  });

  it("the section mentions the detected language or the infer path", () => {
    expect(brain).toMatch(/Match the owner's language/);
  });

  it("the section tells the model to infer rather than force English when uncertain", () => {
    expect(brain).toMatch(/Never force a guess when uncertain/);
  });

  it("the section asks the owner's language and ONE question at a time", () => {
    expect(brain).toMatch(/Match the owner's language/);
    expect(brain).toMatch(/Ask ONE question at a time/);
  });

  it("the section is injected into the system prompt", () => {
    expect(brain).toMatch(/\$\{employeeSection\}/);
  });
});
