// THE OWNER'S OWN WORDS, AND TELLING THE MODEL THAT PATH EXISTS.
//
// THE FOUNDER'S P5 FINDING, 22 October 2026. He dictated wording the
// records could not support, said in as many words that it was his own,
// and the edit was refused exactly as though the model had written it.
//
// The flag was never the problem. Every CLAIMS check in the edit path
// already honours `writtenByOwner`: `clean()` keeps the owner's wording
// and warns instead of stripping it, the unknown-name refusal fires
// only when the flag is false, and the fact-bound check filters those
// lines out before it runs. The bug was that NOTHING TOLD THE MODEL THE
// FLAG EXISTED at the moment it was being refused — and two of the
// notes it gets back actively push the other way ("do not retry with
// the same name", "do not simply resend the same wording"). The one
// note that did mention it sits behind FACT_BOUND_COPY, which was off.
//
// A path the model is never told about when it matters does not exist.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { statesPriceOrStock } from "@/lib/pages/editPage";

const BRAIN = code("src/lib/agents/masterBrainV2.ts");

/** The edit tool's own case, where every refusal lives. */
const editCase = BRAIN.slice(BRAIN.indexOf('case "edit_page_text"'), BRAIN.indexOf('case "undo_page_edit"') > BRAIN.indexOf('case "edit_page_text"') ? BRAIN.indexOf('case "undo_page_edit"') : undefined);

describe("1. there is ONE statement of the path, and every refusal carries it", () => {
  it("THE WORDING EXISTS IN EXACTLY ONE PLACE, AND IS NEVER INLINED", () => {
    // Three gates refuse an edit today and a fourth will be added.
    // Copies would drift, and the drift would only show up when
    // somebody tested it by hand - which is how this was found.
    //
    // MY FIRST VERSION OF THIS TEST COUNTED `const OWNER_WORDS_PATH =`
    // and asserted it appeared once. That cannot fail: two consts of
    // one name in one scope is a TypeScript error, so the test guarded
    // something the compiler already prevents. The real risk is a gate
    // SPELLING THE SENTENCE OUT instead of referencing the constant, so
    // that is what this counts.
    expect(BRAIN).toMatch(/const OWNER_WORDS_PATH =/);
    const inlined = BRAIN.match(/say so and set writtenByOwner on that edit/g) ?? [];
    expect(inlined).toHaveLength(1);
  });

  it("IT NAMES THE FLAG, THE EFFECT, AND THE LIMIT", () => {
    const decl = BRAIN.slice(BRAIN.indexOf("const OWNER_WORDS_PATH ="), BRAIN.indexOf("export async function executeTool"));
    expect(decl).toMatch(/writtenByOwner/);
    expect(decl).toMatch(/verbatim/);
    // The limit matters as much as the permission: a draft the owner
    // approved is not the owner's dictation.
    expect(decl).toMatch(/Never set it for anything you wrote/);
    expect(decl).toMatch(/draft they approved/);
  });

  it("EVERY REFUSAL THAT TELLS THE MODEL WHAT TO DO INSTEAD CARRIES IT", () => {
    // The three notes that push the model away from the wording it
    // just tried. Each one must also name the way through.
    const pushes = [
      /Do NOT retry with the same name[^`]*\$\{OWNER_WORDS_PATH\}/,
      /add the missing fact to their Business Story first[^`]*\$\{OWNER_WORDS_PATH\}/,
      /ask the owner to add the missing fact[^`]*\$\{OWNER_WORDS_PATH\}/,
      /ask them to record the missing fact first[^`]*\$\{OWNER_WORDS_PATH\}/,
    ];
    for (const re of pushes) expect(BRAIN).toMatch(re);
  });

  it("AND NO REFUSAL NOTE SAYS 'DO NOT RESEND' WITHOUT IT", () => {
    // The property, stated as the property rather than as a list: if a
    // note tells the model not to resend the wording, it must say what
    // else is available. A fourth gate added without the path fails
    // here.
    const notes = [...BRAIN.matchAll(/note: [`"][^`"]*(?:resend the same wording|retry with the same name)[^`"]*[`"]/g)].map((m) => m[0]);
    expect(notes.length).toBeGreaterThanOrEqual(3);
    for (const note of notes) expect(note).toMatch(/\$\{OWNER_WORDS_PATH\}/);
  });
});

describe("2. the claims checks really do exempt the owner", () => {
  it("THE UNKNOWN-NAME REFUSAL ONLY FIRES ON WORDING THE MODEL WROTE", () => {
    expect(editCase).toMatch(/if \(!edit\.writtenByOwner\) \{/);
  });

  it("THE FACT-BOUND CHECK FILTERS THE OWNER'S LINES OUT BEFORE IT RUNS", () => {
    expect(editCase).toMatch(/wanted\.filter\(\(e: any\) => !e\.writtenByOwner\)/);
  });

  it("and the older layer keeps the owner's wording and warns", () => {
    const edit = code("src/lib/pages/editPage.ts");
    const clean = edit.slice(edit.indexOf("const clean = ("), edit.indexOf("const walk = ("));
    // RULE C: warned about, never edited.
    expect(clean).toMatch(/if \(writtenByOwner\) \{/);
    expect(clean).toMatch(/Saved exactly as you wrote it/);
  });
});

describe("3. the one rule the owner's words do NOT override says so itself", () => {
  it("A PRICE IN PAGE TEXT IS REFUSED, AND THE MESSAGE SAYS DICTATING IT CHANGES NOTHING", () => {
    // Deliberate, and not a claims check: the harm is two numbers
    // drifting apart with nothing keeping them in step. But an owner
    // told "your own words go on as you wrote them" reads this as the
    // flag being broken unless the rule says otherwise.
    const refusal = statesPriceOrStock("Our candle is ₹999.");
    expect(refusal).toBeTruthy();
    expect(refusal!).toMatch(/not even when you dictate it yourself/);
    expect(refusal!).toMatch(/your own wording doesn't override/);
    // And it still explains WHY, which is not about the number.
    expect(refusal!).toMatch(/nothing keeping the two in step/);
  });

  it("the stock rule says it too", () => {
    const refusal = statesPriceOrStock("Only 3 left in stock.");
    expect(refusal).toBeTruthy();
    expect(refusal!).toMatch(/your own wording doesn't override/);
  });

  it("and ordinary wording is not caught by either", () => {
    expect(statesPriceOrStock("Hand-poured in small batches.")).toBeNull();
  });
});

describe("4. the system prompt tells the model to use the path", () => {
  // S3 fix 5. The founder's third P5 attempt was refused IN THE MODEL'S
  // OWN VOICE, before any tool ran, and the cause was not the model: a
  // system-prompt rule said "when someone ASKS you to write a claim you
  // cannot back — that they are the best — do not write it", with no
  // exception for the owner dictating it himself. It was following its
  // instructions.
  //
  // THIS TEST READS THE SOURCE WITH COMMENTS NOWHERE. The prompt is a
  // template literal, so it IS code, and `code()` is the right reader.
  const src = code("src/lib/agents/masterBrainV2.ts");
  const rules = src.slice(src.indexOf("- When someone ASKS you to write a claim you cannot back"));
  const rule = rules.slice(0, rules.indexOf("`;") + 2);

  it("THE 'DO NOT WRITE THE BEST' RULE NOW CARRIES ITS EXCEPTION", () => {
    // The rule itself stays - it is what stops the model inventing a
    // superlative nobody asked for.
    expect(rule).toMatch(/do not write it and do not quietly write something near it/);
    // And the exception sits with it, not three hundred lines away.
    expect(rule).toMatch(/THEIR OWN DICTATED WORDS ARE THEIRS/);
    expect(rule).toMatch(/writtenByOwner TRUE/);
  });

  it("IT RECOGNISES WHAT THE OWNER ACTUALLY SAYS, in both languages", () => {
    expect(rule).toMatch(/ye mere exact words hain/);
    expect(rule).toMatch(/aise hi likho/);
    expect(rule).toMatch(/write it exactly like this/);
  });

  it("AND FORBIDS THE REFUSAL THAT ACTUALLY HAPPENED", () => {
    expect(rule).toMatch(/do not refuse in your own voice/i);
  });

  it("KEEPS THE LIMIT, so a draft the owner approved is still not his wording", () => {
    expect(rule).toMatch(/ONLY for words they dictated/);
    expect(rule).toMatch(/approving a draft is approving its publication, not vouching for it/);
  });

  it("AND STOPS THE PRICE RULE BEING GENERALISED", () => {
    // My own fix-3 wording is the likely reason the model said the rule
    // applied "whether the words came from me or from you": it read
    // "the one thing your own wording doesn't override" and spread the
    // sentiment. So the prompt now says what is NOT a number.
    expect(rule).toMatch(/only numbers/i);
    expect(rule).toMatch(/Do NOT generalise that refusal/);
    expect(rule).toMatch(/how something is made/);
  });
});
