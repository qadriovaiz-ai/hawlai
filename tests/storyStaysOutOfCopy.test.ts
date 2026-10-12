// (c) THE FOUNDER'S RULE, APPLIED TO THE INPUT.
//
// "Story text does not go into customer copy. Facts do."
//
// The 11 October welcome email carried a founder-story line, and the
// cause was the prompt, not the output: formatFactsForCopy injected the
// recorded story IN FULL under the words "use these specifics; they are
// what makes this business different". The model did as it was told.
//
// WHY THIS IS NOT A DELETION. For the live business all 14 recorded
// rows are filed under `business_story`, and nine of them hold the
// PRODUCT FACTS. businessFacts.ts filters that category out of the
// facts branch, so that block is their only way into the prompt.
// Deleting it would have blinded the model to everything true about
// the product — which is what docs/PLAN-AGENCY.md A.4 originally
// recommended, and was wrong.
//
// So: STORY rows held back by title, the owner's reason-and-feeling
// sentences dropped from the rows that stay, facts introduced as facts.

import { describe, it, expect } from "vitest";
import { isStoryRow, isMotiveSentence, factSentences, rowsForPrompt, STORY_TITLES } from "@/lib/content/storyRows";
import { code, sourceWithComments } from "./helpers/source";

describe("1. the three STORY titles are held back", () => {
  it("THE FOUNDER'S THREE", () => {
    for (const t of ["How it started", "The first customers", "How you talk about the work"]) {
      expect(isStoryRow(t), t).toBe(true);
    }
  });

  it("and an edited title that EXTENDS one still counts", () => {
    expect(isStoryRow("How it started, 2019")).toBe(true);
    expect(isStoryRow("how it started in my kitchen")).toBe(true);
  });

  it("A SHORT TITLE IS NOT A PREFIX MATCH — the bug an existing test caught", () => {
    // A row titled just "How" holds "Hand-poured in small batches.
    // Paraffin-free, soy wax only." My first matcher compared both
    // directions, so "How" matched "how it started" and those facts
    // were held back. tests/customerStoryConsent.test.ts went red.
    expect(isStoryRow("How")).toBe(false);
    expect(isStoryRow("The first")).toBe(false);
  });

  it("THE SIX FACT TITLES ARE NOT HELD BACK", () => {
    for (const t of [
      "How it's made, step by step",
      "The part that takes longest",
      "Materials and suppliers",
      "The detail people notice",
      "What you refuse to do",
      "What people get wrong",
      "Something I can stand behind",
    ]) {
      expect(isStoryRow(t), t).toBe(false);
    }
  });

  it("the list is the three the founder classified, not more", () => {
    expect(STORY_TITLES).toHaveLength(3);
  });
});

describe("2. the motive sentence, which is a health-claim seed", () => {
  const MOTIVE = "Lavender isliye choose ki kyunki kaam ke baad khud stressed rehti thi.";

  it("THE LIVE SENTENCE IS DROPPED", () => {
    // Row 10 is classified FACT and keeps its material facts, but this
    // sentence is a reason joined to a feeling — and a model that reads
    // it reaches for "stress relief".
    expect(isMotiveSentence(MOTIVE)).toBe(true);
  });

  it("AND THE REST OF ITS ROW SURVIVES", () => {
    const r = factSentences(`${MOTIVE} Soy wax Kanpur ke supplier se aata hai. Lavender oil imported hai.`);
    expect(r.dropped).toHaveLength(1);
    expect(r.kept.join(" ")).toContain("Kanpur");
    expect(r.kept.join(" ")).toContain("Lavender oil");
    expect(r.kept.join(" ")).not.toContain("stressed");
  });

  it("other motive shapes, both languages", () => {
    for (const s of [
      "I started it because I couldn't find one I liked.",
      "I chose soy because I wanted something cleaner.",
      "Mujhe lavender pasand hai.",
      "I felt there was nothing honest on the shelf.",
      "इसलिए चुना क्योंकि मुझे तनाव रहता था।",
    ]) {
      expect(isMotiveSentence(s), s).toBe(true);
    }
  });

  it("A FACT IS NOT A MOTIVE, even in the first person", () => {
    // THIS IS THE COST SIDE and it is the whole design: the detector
    // targets a REASON joined to a FEELING, not first-person grammar.
    for (const s of [
      "Kabhi sasta paraffin wax mix nahi karti.",
      "Har candle 24 ghante set hoti hai.",
      "Main double boiler mein wax melt karti hoon.",
      "Hand-poured in small batches. Paraffin-free, soy wax only.",
      "Soy wax Kanpur ke supplier se aata hai.",
      "We pour in 30-candle batches because the wax cools unevenly above that.",
    ]) {
      expect(isMotiveSentence(s), s).toBe(false);
    }
  });

  it("a row that is ALL motive comes back with nothing usable", () => {
    const r = factSentences("I started because I felt lost. I wanted something of my own.");
    expect(r.kept).toEqual([]);
    expect(r.dropped).toHaveLength(2);
  });
});

describe("3. what a prompt actually receives", () => {
  const ROWS = [
    { category: "business_story", title: "How it started", content: "My mother's shop shut in 2019." },
    { category: "business_story", title: "How it's made, step by step", content: "Double boiler melt, then fragrance at the right temperature." },
    { category: "business_story", title: "Materials and suppliers", content: "Lavender isliye choose ki kyunki khud stressed rehti thi. Soy wax Kanpur se aata hai." },
    { category: "business_story", title: "Something I can stand behind", content: "Paraffin-free, soy wax only. Hand-poured in small batches." },
  ];

  it("THE FACTS COME THROUGH", () => {
    const r = rowsForPrompt(ROWS);
    const text = r.rows.map((x) => x.content).join(" ");
    expect(text).toContain("Double boiler");
    expect(text).toContain("Kanpur");
    expect(text).toContain("Paraffin-free, soy wax only");
    expect(text).toContain("Hand-poured in small batches");
  });

  it("AND THE STORY DOES NOT", () => {
    const r = rowsForPrompt(ROWS);
    const text = r.rows.map((x) => x.content).join(" ");
    expect(text).not.toContain("mother's shop");
    expect(text).not.toContain("stressed");
  });

  it("WHAT WAS HELD BACK IS COUNTED, so the caller can say so", () => {
    const r = rowsForPrompt(ROWS);
    expect(r.storyRowsHeld).toBe(1);
    expect(r.motiveSentencesHeld).toBe(1);
  });

  it("nothing recorded, nothing held", () => {
    const r = rowsForPrompt([]);
    expect(r.rows).toEqual([]);
    expect(r.storyRowsHeld).toBe(0);
    expect(r.motiveSentencesHeld).toBe(0);
  });
});

describe("4. it does NOT share the output-side list, deliberately", () => {
  it("THE TWO LISTS ARE SEPARATE, and the reason is written down", () => {
    // ownerVoice.OWNER_VOICE feeds narrativeProvenance, which STRIPS
    // OUTPUT: a false positive there deletes an owner's honest
    // sentence. This file filters INPUT: a false positive means the
    // model is shown less. Opposite costs, so opposite tuning, so two
    // lists — which is the one case that justifies breaking this
    // codebase's one-list convention.
    // The IMPORT is checked on comment-stripped source (rule 8); the
    // written REASON is a comment, so it is checked on source WITH
    // comments - which is what sourceWithComments exists for, and the
    // choice is visible rather than accidental.
    expect(code("src/lib/content/storyRows.ts")).not.toMatch(/from "@\/lib\/content\/ownerVoice"/);
    const withComments = sourceWithComments("src/lib/content/storyRows.ts");
    expect(withComments).toMatch(/STRIPS OUTPUT/);
    expect(withComments).toMatch(/filters INPUT/);
  });

  it("and the prompt no longer tells the model the story is the point", () => {
    const facts = code("src/lib/claims/businessFacts.ts");
    expect(facts).not.toMatch(/use these specifics; they are what makes this business different/);
    expect(facts).toMatch(/state these as facts/);
  });
});
