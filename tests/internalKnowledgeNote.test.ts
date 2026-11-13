// A note the owner keeps, that no customer is ever told — migration 229.
//
// Until V4a the sales agent lived on one landing page. It is on every
// page of the storefront now, so everything in business_knowledge is
// one question away from being read aloud to a stranger — and `general`
// is the catch-all where a supplier's name, a cost or a note-to-self
// would land. There was no way to write one down and keep it in.

import { describe, it, expect } from "vitest";
import {
  withheldFromCopy,
  splitStories,
  withheldNote,
  needsConsent,
  INTERNAL_REASON,
  type StoryFact,
} from "@/lib/claims/personalStories";
import { code, sql } from "./helpers/source";

const ordinary = (over: Partial<StoryFact> = {}): StoryFact => ({
  category: "general",
  title: "Delivery",
  content: "We deliver within the city in two days.",
  ...over,
});

/** A row that the consent gate withholds for its own, different reason. */
const privateSituation = (): StoryFact => ({
  category: "business_story",
  title: "A customer's order",
  content: "A customer told me her husband had been in an accident and she lit one every night at the hospital.",
});

describe("1. AN INTERNAL NOTE IS NEVER USABLE IN COPY", () => {
  it("IT IS WITHHELD, whatever it says", () => {
    // THE LOAD-BEARING ONE. Everything else in this gate reads the text
    // to decide; this one was decided by the person who wrote the note.
    expect(withheldFromCopy(ordinary({ internalOnly: true }))).toBe(INTERNAL_REASON);
    expect(splitStories([ordinary({ internalOnly: true })]).usable).toEqual([]);
  });

  it("AND AN ORDINARY NOTE IS STILL USABLE — the default changed nothing", () => {
    // Default false, which is the only safe default in this direction:
    // every note written before the migration stays exactly as
    // customer-facing as it was yesterday.
    expect(withheldFromCopy(ordinary())).toBeNull();
    expect(withheldFromCopy(ordinary({ internalOnly: false }))).toBeNull();
    expect(splitStories([ordinary()]).usable).toHaveLength(1);
  });

  it("STRICTLY true — an unreadable flag leaves the note as it was", () => {
    // The opposite direction to `weak` and `consented`, deliberately: a
    // column that cannot be read must not silently empty the agent's
    // answers.
    for (const value of [undefined, null, "true", 1, "yes"] as any[]) {
      expect(withheldFromCopy(ordinary({ internalOnly: value })), String(value)).toBeNull();
    }
  });

  it("THE OWNER'S INSTRUCTION BEATS THE PATTERN, not the other way round", () => {
    // A row can be both. It must be withheld either way, and the reason
    // the model is given must be the owner's own.
    const both = { ...privateSituation(), internalOnly: true };
    expect(withheldFromCopy(both)).toBe(INTERNAL_REASON);
    expect(splitStories([both]).withheld[0].kind).toBe("internal_only");
  });

  it("an empty note marked internal is still withheld", () => {
    // The consent gate returns null early for empty text; this check
    // runs before it.
    expect(withheldFromCopy({ category: "general", title: "", content: "", internalOnly: true })).toBe(INTERNAL_REASON);
  });
});

describe("2. THE MODEL IS TOLD THE RIGHT REASON", () => {
  it("TWO REASONS GET TWO SENTENCES", () => {
    // This note used to assume every withheld row was a customer's
    // private situation, because that was the only way a row could be
    // withheld. Telling a model the wrong reason is how it talks itself
    // round one.
    const note = withheldNote(splitStories([ordinary({ internalOnly: true }), privateSituation()]).withheld);
    expect(note).toMatch(/marked INTERNAL/);
    expect(note).toMatch(/private situation/);
  });

  it("AN INTERNAL NOTE IS NOT DESCRIBED AS SOMEBODY'S PRIVATE SITUATION", () => {
    const note = withheldNote(splitStories([ordinary({ internalOnly: true })]).withheld);
    expect(note).toMatch(/marked INTERNAL/);
    expect(note).not.toMatch(/private situation/);
    expect(note).not.toMatch(/Business Story/);
  });

  it("AND THE PRIVATE-SITUATION NOTE IS UNCHANGED when that is all there is", () => {
    // An existing guard must not have been weakened by making room for
    // a second one.
    const note = withheldNote(splitStories([privateSituation()]).withheld);
    expect(note).toMatch(/Business Story/);
    expect(note).toMatch(/fabricated testimonial/);
    expect(note).not.toMatch(/marked INTERNAL/);
  });

  it("IT SAYS WHAT TO DO INSTEAD, rather than only what not to do", () => {
    // A model that cannot see something will fill the gap. The note
    // gives it somewhere to go.
    const note = withheldNote(splitStories([ordinary({ internalOnly: true })]).withheld);
    expect(note).toMatch(/must NOT invent a substitute/);
    expect(note).toMatch(/offer to come back to them/);
  });

  it("nothing withheld is still no note at all", () => {
    expect(withheldNote([])).toBe("");
    expect(withheldNote(splitStories([ordinary()]).withheld)).toBe("");
  });

  it("the withheld note never repeats the note it is withholding", () => {
    const secret = ordinary({ title: "Supplier", content: "Ravi charges us 180 a unit", internalOnly: true });
    const note = withheldNote(splitStories([secret]).withheld);
    expect(note).not.toContain("Ravi");
    expect(note).not.toContain("180");
  });
});

describe("3. ONLY THE OWNER SETS IT", () => {
  it("THE COLUMN IS READ IN BOTH READS OF THE TABLE", () => {
    // CAUGHT BY AN EXISTING TEST ON THE WAY IN. business_knowledge is
    // read in TWO places in that file, and the first version of this
    // change added the column to one of them — so every fact assembled
    // by the other path would have arrived with no internal flag, and
    // an internal note would have been spoken by exactly the agent
    // this migration exists to stop. interviewProgress's own "in BOTH
    // reads" assertion, written after a mutation found the same shape
    // of bug for `is_weak`, is what failed.
    const src = code("src/lib/claims/businessFacts.ts");
    const reads = src.split('from("business_knowledge")').slice(1);
    expect(reads.length).toBe(2);
    for (const read of reads) {
      expect(read.slice(0, read.indexOf(";")), read.slice(0, 80)).toContain("internal_only");
    }
  });

  it("AND MAPPED STRICTLY, in the one place a row becomes a fact", () => {
    const src = code("src/lib/claims/businessFacts.ts");
    const fn = src.slice(src.indexOf("function toKnowledgeFact"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/internalOnly: k\.internal_only === true/);
  });

  it("THE API WRITES IT ONLY FROM AN EXPLICIT TRUE", () => {
    const src = code("src/app/api/business-knowledge/route.ts");
    expect(src).toMatch(/update\.internal_only = internal_only === true/);
  });

  it("NOTHING ELSE IN THE CODEBASE WRITES THE COLUMN", () => {
    // It is a statement about her own business. An agent that set it
    // would be deciding what she may tell her own customers.
    const src = code("src/app/api/business-knowledge/route.ts");
    expect(src).toMatch(/internal_only/);
    // ...and no generator or agent mentions it at all.
    for (const file of [
      "src/lib/agents/chatbotAgent.ts",
      "src/lib/agents/socialManagementAgent.ts",
      "src/lib/chat/visitorPage.ts",
    ]) {
      expect(code(file), file).not.toMatch(/internal_only|internalOnly/);
    }
  });

  it("THE OWNER CAN SEE AND SET IT ON EVERY NOTE", () => {
    // General is where such a note usually lands, but "this is not for
    // customers" is true of a policy or a pricing note too, and a
    // control that appeared only sometimes is one she cannot find.
    const src = code("src/components/settings/KnowledgeBaseView.tsx");
    expect(src).toMatch(/toggleInternal/);
    expect(src).toMatch(/internal_only: next/);
    // Shown on the note itself, so it is never a hidden state.
    expect(src).toMatch(/\{f\.internal_only && \(/);
    // Not nested inside the consent panel, which only renders for rows
    // that need consent.
    const control = src.indexOf("onClick={() => toggleInternal(f)}");
    const consentPanel = src.indexOf("needsConsent(f) && (");
    expect(control).toBeGreaterThan(consentPanel);
  });
});

describe("4. THE MIGRATION", () => {
  const migration = () => sql("supabase/migrations/229_knowledge_internal_only.sql");

  it("ADDS THE COLUMN NOT NULL, DEFAULTING TO FALSE", () => {
    const m = migration();
    expect(m).toMatch(/alter table business_knowledge/i);
    expect(m).toMatch(/add column if not exists internal_only boolean not null default false/i);
  });

  it("AND CHANGES NO EXISTING ROW", () => {
    // An UPDATE in here would decide, on her behalf, which of her
    // existing notes her customers may no longer be told.
    expect(migration()).not.toMatch(/\bupdate\b/i);
    expect(migration()).not.toMatch(/\bdrop\b/i);
  });

  it("the consent gate it sits beside is untouched", () => {
    expect(needsConsent(privateSituation())).toBe(true);
    expect(needsConsent(ordinary())).toBe(false);
  });
});
