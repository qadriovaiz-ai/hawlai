// A suggestion is not an answer — D1.
//
// The three-bucket onboarding stores a draft of what we think the
// answer is, before the owner has said anything. The tests that matter
// are the ones that keep that draft out of everything that treats a
// record as truth: a suggestion that counted as knowledge would be a
// guess reaching a customer with the owner's name on it.

import { describe, it, expect } from "vitest";
import {
  prepareSuggestion,
  pendingSuggestions,
  acceptsSuggestion,
  storeSuggestion,
  rejectSuggestion,
  isSuggestionSource,
  SUGGESTION_SOURCES,
  QUOTE_CHARS,
  SUGGESTION_CHARS,
  type Suggestion,
} from "@/lib/onboarding/suggestions";
import {
  readProgress,
  contextFrom,
  unansweredNote,
  EMPTY_PROGRESS,
} from "@/lib/onboarding/interviewProgress";
import { code, sql } from "./helpers/source";

const discovered = (over: Partial<Suggestion> = {}): Suggestion => ({
  questionKey: "opening_hours",
  value: "Mon-Sat 10am to 8pm, closed Sunday",
  source: "discovered",
  evidence: { sourceKind: "hawlai_site", url: "/site/x/contact", quote: "Open Mon-Sat, 10am - 8pm" },
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  question_key: "opening_hours",
  status: "suggested",
  source: "discovered",
  suggested_value: "Mon-Sat 10am to 8pm",
  evidence: { sourceKind: "hawlai_site" },
  ...over,
});

describe("1. A SUGGESTION IS NOT AN ANSWER", () => {
  it("IT IS NOT COUNTED AS ANSWERED, ASKED OR SKIPPED", () => {
    // THE LOAD-BEARING ONE. Everything that reports what a business
    // knows reads these lists. A draft landing in `answered` would
    // tell the owner he had finished an interview he had not started,
    // and tell the facts layer a gap was filled.
    const p = readProgress([row(), row({ question_key: "price_range", status: "rejected" })]);
    expect(p.suggested).toEqual(["opening_hours"]);
    expect(p.rejected).toEqual(["price_range"]);
    expect(p.answered).toEqual([]);
    expect(p.asked).toEqual([]);
    expect(p.skipped).toEqual([]);
  });

  it("AND THE INTERVIEW STILL REACHES THE QUESTION", () => {
    // A draft nobody has confirmed leaves the question as open as it
    // was. What changes is that the card arrives pre-filled.
    const p = readProgress([row()]);
    expect(contextFrom(p).answered).not.toContain("opening_hours");
  });

  it("A REJECTED QUESTION IS STILL ASKED; A SKIPPED ONE IS NOT", () => {
    // Skipped is "don't ask me this". Rejected is "that answer is
    // wrong" — losing the question because we guessed badly once is
    // the opposite of what the owner said.
    const p = readProgress([
      row({ question_key: "price_range", status: "rejected" }),
      row({ question_key: "common_doubt", status: "skipped" }),
    ]);
    const dealtWith = contextFrom(p).answered;
    expect(dealtWith).not.toContain("price_range");
    expect(dealtWith).toContain("common_doubt");
  });

  it("AND A DRAFT DOES NOT MOVE THE PROGRESS THE FACTS LAYER REPORTS", () => {
    // unansweredNote is what tells a generator "this is not the whole
    // picture". A suggestion counting here would quieten that warning
    // on a business that has told us nothing.
    const withDrafts = readProgress([
      row({ question_key: "delivery_time" }),
      row({ question_key: "returns_policy" }),
    ]);
    expect(unansweredNote(withDrafts, ["products"])).toBeNull();
    expect(withDrafts.answered).toEqual([]);
  });

  it("the empty progress has both new lists", () => {
    expect(EMPTY_PROGRESS.suggested).toEqual([]);
    expect(EMPTY_PROGRESS.rejected).toEqual([]);
  });
});

describe("2. NOTHING IN THE FACTS LAYER READS A SUGGESTION", () => {
  it("THE FACTS LAYER DOES NOT READ interview_answers AT ALL", () => {
    // THE SAFETY PROPERTY, asserted where it lives. gatherBusinessFacts
    // reads business_knowledge and business_listing_facts; a suggestion
    // is in neither, so stripUnsupported deletes it as unsupported —
    // there is genuinely no record behind it.
    const facts = code("src/lib/claims/businessFacts.ts");
    expect(facts).not.toMatch(/suggested_value/);
    expect(facts).not.toMatch(/from\("interview_answers"\)\s*\.select\([^)]*suggested/);
  });

  it("AND THE SUGGESTION STORE NEVER WRITES WHERE FACTS ARE READ", () => {
    const src = code("src/lib/onboarding/suggestions.ts");
    expect(src).not.toMatch(/from\("business_knowledge"\)/);
    expect(src).not.toMatch(/from\("business_listing_facts"\)/);
    // It writes to exactly one table.
    const tables = [...new Set((src.match(/from\("([a-z_]+)"\)/g) ?? []))];
    expect(tables).toEqual(['from("interview_answers")']);
  });
});

describe("3. WHERE IT CAME FROM SURVIVES WHAT WAS DECIDED", () => {
  it("A SUGGESTION MAY NOT CLAIM THE OWNER SAID IT", () => {
    // THE LOAD-BEARING ONE. Storing a guess as `owner` would launder it
    // into his own words, and nothing downstream could tell.
    const bad = prepareSuggestion(discovered({ source: "owner" as any }));
    expect(bad.ok).toBe(false);
    expect((bad as any).why).toMatch(/source must be one of/);
    expect(SUGGESTION_SOURCES).toEqual(["discovered", "inferred"]);
    expect(isSuggestionSource("owner")).toBe(false);
  });

  it("REJECTION CLEARS THE VALUE AND KEEPS THE SOURCE", () => {
    // What we guessed goes; THAT we guessed stays. It is the record of
    // having been wrong, and the only way to count it later.
    const src = code("src/lib/onboarding/suggestions.ts");
    const fn = src.slice(src.indexOf("export async function rejectSuggestion"));
    const update = fn.slice(fn.indexOf(".update("), fn.indexOf("})", fn.indexOf(".update(")));
    expect(update).toMatch(/status: "rejected"/);
    expect(update).toMatch(/suggested_value: null/);
    expect(update).not.toMatch(/source:/);
  });

  it("and a rejection only applies to a row still waiting", () => {
    // Rejecting an answered question would delete a fact the owner
    // gave us, through a button meant for a guess.
    const src = code("src/lib/onboarding/suggestions.ts");
    const fn = src.slice(src.indexOf("export async function rejectSuggestion"));
    expect(fn).toMatch(/\.eq\("status", "suggested"\)/);
  });
});

describe("4. A DRAFT NEVER OVERWRITES A DECISION", () => {
  it("ANSWERED, SKIPPED AND REJECTED ARE ALL LEFT ALONE", () => {
    // Discovery runs more than once. A guess overwriting a fact the
    // owner typed is the worst thing this feature could do.
    for (const status of ["answered", "skipped", "rejected"]) {
      expect(acceptsSuggestion({ status } as any), status).toBe(false);
      const out = prepareSuggestion(discovered(), { status } as any);
      expect(out.ok, status).toBe(false);
    }
  });

  it("BUT A BETTER DRAFT REPLACES ONE NOBODY HAS SEEN", () => {
    expect(acceptsSuggestion({ status: "suggested" } as any)).toBe(true);
    expect(acceptsSuggestion({ status: "asked" } as any)).toBe(true);
    expect(acceptsSuggestion(null)).toBe(true);
    expect(prepareSuggestion(discovered(), { status: "suggested" } as any).ok).toBe(true);
  });
});

describe("5. A SUGGESTION THE OWNER CANNOT CHECK IS NOT SHOWN", () => {
  it("A DISCOVERY MUST CARRY THE SENTENCE IT WAS READ FROM", () => {
    // "Your page says this" has to come with a line of his page. A
    // discovery with no quote is an inference wearing a discovery's
    // name.
    const out = prepareSuggestion(discovered({ evidence: { sourceKind: "hawlai_site" } }));
    expect(out.ok).toBe(false);
    expect((out as any).why).toMatch(/sentence it was read from/);
  });

  it("AN INFERENCE NEEDS NO QUOTE, because nobody wrote it down", () => {
    const out = prepareSuggestion(
      discovered({ source: "inferred", evidence: { sourceKind: "catalogue" } })
    );
    expect(out.ok).toBe(true);
    expect((out as any).row.evidence.quote).toBeNull();
  });

  it("EVERY SUGGESTION SAYS WHAT KIND OF SOURCE IT CAME FROM", () => {
    const out = prepareSuggestion(discovered({ evidence: { sourceKind: "", quote: "x" } }));
    expect(out.ok).toBe(false);
    expect((out as any).why).toMatch(/what kind of source/);
  });

  it("an empty value is not a suggestion", () => {
    expect(prepareSuggestion(discovered({ value: "   " })).ok).toBe(false);
    expect(prepareSuggestion(discovered({ questionKey: "" })).ok).toBe(false);
  });

  it("THE VALUE AND THE QUOTE ARE BOTH CAPPED", () => {
    const out = prepareSuggestion(
      discovered({ value: "x".repeat(2000), evidence: { sourceKind: "hawlai_site", quote: "q".repeat(2000) } })
    ) as any;
    expect(out.ok).toBe(true);
    expect(out.row.suggested_value.length).toBe(SUGGESTION_CHARS);
    expect(out.row.evidence.quote.length).toBe(QUOTE_CHARS);
  });
});

describe("6. READING THE DRAFTS BACK", () => {
  it("ONLY ROWS THAT ARE ACTUALLY WAITING", () => {
    const out = pendingSuggestions([
      row(),
      row({ question_key: "a", status: "answered" }),
      row({ question_key: "b", status: "rejected" }),
    ]);
    expect(out.map((s) => s.questionKey)).toEqual(["opening_hours"]);
  });

  it("A ROW WITH NO VALUE IS NOT A SUGGESTION, whatever its status", () => {
    // A card saying "we think the answer is" and then nothing is worse
    // than not asking.
    expect(pendingSuggestions([row({ suggested_value: null })])).toEqual([]);
    expect(pendingSuggestions([row({ suggested_value: "  " })])).toEqual([]);
  });

  it("AND A ROW WHOSE SOURCE IS NOT A SUGGESTION SOURCE IS DROPPED", () => {
    expect(pendingSuggestions([row({ source: "owner" })])).toEqual([]);
    expect(pendingSuggestions([row({ source: null })])).toEqual([]);
  });

  it("the evidence comes back, or null rather than a broken shape", () => {
    expect(pendingSuggestions([row()])[0].evidence).toEqual({ sourceKind: "hawlai_site" });
    expect(pendingSuggestions([row({ evidence: "not an object" })])[0].evidence).toBeNull();
  });
});

describe("7. A FAILED WRITE IS NEVER A THROWN ONE", () => {
  const db = (error: any = null) => ({ from: () => ({ upsert: () => Promise.resolve({ error }), update: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error }) }) }) }) }) }) as any;

  it("discovery runs over every question, so one failure is not the end", async () => {
    expect(await storeSuggestion(db({ message: "boom" }), "d1", discovered())).toBe(false);
    expect(await storeSuggestion(db(), "d1", discovered())).toBe(true);
  });

  it("and a throwing client is caught", async () => {
    const throwing = { from: () => { throw new Error("no connection"); } } as any;
    expect(await storeSuggestion(throwing, "d1", discovered())).toBe(false);
    expect(await rejectSuggestion(throwing, "d1", "opening_hours")).toBe(false);
  });

  it("a refused suggestion never reaches the database", async () => {
    let touched = false;
    const watch = { from: () => { touched = true; return { upsert: () => Promise.resolve({ error: null }) }; } } as any;
    expect(await storeSuggestion(watch, "d1", discovered({ value: "" }))).toBe(false);
    expect(touched).toBe(false);
  });
});

describe("8. THE MIGRATION", () => {
  const m = () => sql("supabase/migrations/232_interview_suggestions.sql");

  it("ADDS THREE NULLABLE COLUMNS AND NO TABLE", () => {
    const s = m();
    expect(s).toMatch(/alter table interview_answers/i);
    for (const col of ["source text", "suggested_value text", "evidence jsonb"]) {
      expect(s, col).toContain("add column if not exists " + col);
    }
    expect(s).not.toMatch(/create table/i);
    expect(s).not.toMatch(/not null/i);
  });

  it("AND RECLASSIFIES NOTHING THAT IS ALREADY THERE", () => {
    // Writing 'owner' across the existing rows would be this migration
    // asserting something about rows it never saw. Null reads as "not
    // recorded", which is the truth.
    const s = m();
    expect(s).not.toMatch(/\bupdate\b/i);
    expect(s).not.toMatch(/\bdrop column\b/i);
  });

  it("no CHECK constraint on the new vocabulary", () => {
    // The questions are code and move faster than migrations — 170's
    // reasoning, reused by 217 and 222 and again here.
    expect(m()).not.toMatch(/check\s*\(/i);
  });
});
