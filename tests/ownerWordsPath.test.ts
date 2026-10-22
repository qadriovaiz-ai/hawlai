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
