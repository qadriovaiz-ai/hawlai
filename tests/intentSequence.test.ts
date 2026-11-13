// A starting sequence for someone who showed strong interest — V5b.
//
// The owner asked not to be left with a blank builder. The tests that
// matter are about what a template must NOT contain: words of mine
// shipped as the business's, a claim fixed at template time that no
// record backs, and a fourth email to somebody who has answered by not
// answering.

import { describe, it, expect } from "vitest";
import {
  DEFAULT_INTENT_SEQUENCE,
  defaultIntentSequence,
  DEFAULT_INTENT_SEQUENCE_NAME,
} from "@/lib/automation/intentSequence";
import { EMAIL_TASKS } from "@/lib/departments/email";
import { code } from "./helpers/source";

describe("1. THE TEMPLATE WRITES NO COPY", () => {
  it("EVERY STEP NAMES AN EXISTING EMAIL TASK", () => {
    // Which is what puts each email through generateEmailContent and
    // the claims layer. A task key that does not exist would be a step
    // the engine cannot run.
    const keys = EMAIL_TASKS.map((t) => t.key);
    for (const step of DEFAULT_INTENT_SEQUENCE) {
      expect(keys, step.emailTaskType).toContain(step.emailTaskType);
    }
  });

  it("AND NO STEP CARRIES A SUBJECT OR BODY OF ITS OWN", () => {
    // THE LOAD-BEARING ONE. A custom subject here would be MY words
    // shipped as the owner's, fixed at template time and fact-checked
    // by nothing. The founder's "a Day-5 case study needs a case study"
    // is enforced by not writing the Day-5 copy at all.
    for (const step of DEFAULT_INTENT_SEQUENCE) {
      expect(step.customSubject, step.emailTaskType).toBe("");
      expect(step.customBody, step.emailTaskType).toBe("");
    }
  });

  it("THE FILE CONTAINS NO MARKETING SENTENCE AT ALL", () => {
    // Not even a helpful-looking one. If a sentence is in here it ships
    // to real customers unchecked.
    //
    // THE FIRST VERSION OF THIS MATCHED THE CODE BETWEEN STRINGS. A
    // pattern of /"[^"]{25,}"/ starts at one literal's CLOSING quote
    // and runs to the next literal's OPENING one, so it reported four
    // "strings" that were really the gaps — type fields and property
    // names. Excluding newlines makes it match literals instead.
    const src = code("src/lib/automation/intentSequence.ts");
    const strings = src.match(new RegExp('"[^"\\n]{25,}"', "g")) ?? [];
    // The only long string is the workflow's own name, which the owner
    // sees and can rename before anything is created.
    expect(strings).toEqual([`"${DEFAULT_INTENT_SEQUENCE_NAME}"`]);
  });

  it("every step sends an email and nothing else", () => {
    for (const step of DEFAULT_INTENT_SEQUENCE) expect(step.actionType).toBe("send_email");
  });
});

describe("2. THE SHAPE IS THE SAME FOR ANY BUSINESS — rule 3", () => {
  it("NO TRADE, PRODUCT OR CATEGORY WORD APPEARS", () => {
    //
    // WHOLE WORDS. "car" is inside "abandoned_cart", which is an email
    // task key and not a trade word — a substring search reported it
    // and would have been loosened by the next person rather than
    // fixed.
    const src = code("src/lib/automation/intentSequence.ts").toLowerCase();
    for (const word of [
      "candle", "car", "dealership", "restaurant", "menu", "salon",
      "clinic", "boutique", "bakery", "vehicle", "property",
    ]) {
      // `"\b"` IN A JS STRING IS A BACKSPACE CHARACTER, not a word
      // boundary. Written that way this matched nothing at all and the
      // test passed on any source — a mutation putting "vehicle" in
      // the template survived it. String.raw keeps the backslash.
      expect(src, word).not.toMatch(new RegExp(String.raw`\b` + word + String.raw`\b`));
    }
  });

  it("THE DAYS ARE 0, 2 AND 5, IN ORDER", () => {
    expect(DEFAULT_INTENT_SEQUENCE.map((s) => s.delayDays)).toEqual([0, 2, 5]);
  });

  it("AND THERE IS NO FOURTH EMAIL", () => {
    // The existing auto follow-up is "capped at one auto follow-up to
    // avoid spamming a lead who simply hasn't responded", and that
    // reasoning does not disappear because the trigger got better.
    // Somebody who ignored three emails is answering.
    expect(DEFAULT_INTENT_SEQUENCE).toHaveLength(3);
  });

  it("THE LAST ONE IS THE LOW-PRESSURE ONE", () => {
    const last = DEFAULT_INTENT_SEQUENCE[DEFAULT_INTENT_SEQUENCE.length - 1];
    expect(last.emailTaskType).toBe("follow_up");
    const task = EMAIL_TASKS.find((t) => t.key === last.emailTaskType)!;
    expect(task.instructions).toMatch(/easy out/i);
  });

  it("and the offer step is one that cannot invent an offer", () => {
    const promo = DEFAULT_INTENT_SEQUENCE.find((s) => s.emailTaskType === "promotional")!;
    expect(promo).toBeTruthy();
    const task = EMAIL_TASKS.find((t) => t.key === "promotional")!;
    expect(task.instructions).toMatch(/never invent a discount/i);
  });
});

describe("3. IT IS A STARTING POINT, NOT A DECISION", () => {
  it("A FRESH COPY EACH TIME, so editing the draft cannot rewrite the template", () => {
    const a = defaultIntentSequence();
    a[0].delayDays = 99;
    expect(defaultIntentSequence()[0].delayDays).toBe(0);
    expect(DEFAULT_INTENT_SEQUENCE[0].delayDays).toBe(0);
  });

  it("THE BUILDER FILLS THE DRAFT — it does not create anything", () => {
    // The owner sees all three steps, changes what they like, and
    // presses Create. Nothing is written by pressing this.
    const src = code("src/components/automation/WorkflowBuilder.tsx");
    const block = src.slice(src.indexOf('triggerType === "visitor_intent" && ('));
    const button = block.slice(0, block.indexOf("</div>"));
    expect(button).toMatch(/setSteps\(defaultIntentSequence\(\)\)/);
    expect(button).not.toMatch(/fetch\(/);
  });

  it("AND IT ONLY APPEARS FOR THIS TRIGGER", () => {
    const src = code("src/components/automation/WorkflowBuilder.tsx");
    expect(src).toMatch(/\{triggerType === "visitor_intent" && \(/);
  });

  it("it does not overwrite a name the owner already typed", () => {
    const src = code("src/components/automation/WorkflowBuilder.tsx");
    expect(src).toMatch(/if \(!name\) setName\(DEFAULT_INTENT_SEQUENCE_NAME\)/);
  });

  it("THE WORKFLOW IS STILL CREATED SWITCHED OFF", () => {
    // Rule 6: switching an automation ON is the owner's approval, and
    // a template must not hand that over on their behalf.
    const api = code("src/app/api/automation/workflows/route.ts");
    const from = api.indexOf('from("workflows")');
    expect(from, "the workflows insert moved").toBeGreaterThan(-1);
    // Slice to the END OF THE INSERT CALL rather than a guessed number
    // of characters — a character window is a guess about length when
    // the assertion is about structure.
    const open = api.indexOf(".insert(", from);
    expect(open, "the workflows insert moved").toBeGreaterThan(-1);
    const insert = api.slice(open, api.indexOf("})", open));
    expect(insert).toMatch(/enabled: false/);
  });
});
