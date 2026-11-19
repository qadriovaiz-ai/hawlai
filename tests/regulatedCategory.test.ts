// Never declare what has not been established — 19 November 2026.
//
// Meta requires India securities and investment ads to carry
// `regional_regulated_categories: ["INDIA_FINSERV"]` with a verified
// payer and beneficiary. The enum was confirmed from Meta's ad set
// reference: "INDIA_FINSERV: Use this value to declare a Securities and
// Investments ad set if the ad set targets India Audience".
//
// THE FOUNDER'S RULE IS THE DESIGN: a false declaration is never
// acceptable in EITHER direction — not calling an ordinary business a
// finance one, and not calling a finance one ordinary.
//
// Any keyword test fails both ways eventually. "Stock", "share",
// "fund", "trust" and "returns" are ordinary words in ordinary trades.
// So this produces EVIDENCE, never a verdict: evidence sends the launch
// back to the owner with a question, and its absence sends no field at
// all — the unticked box in Ads Manager, which is the state Meta
// accepted on 19 November 2026.

import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "fs";
import {
  INDIA_FINSERV,
  declarationFor,
  financeEvidence,
  targetsIndia,
} from "@/lib/ads/regulatedCategory";
import { preflight } from "@/lib/ads/preflight";
import { code } from "./helpers/source";

const none = { found: [] as string[], where: null };
const INDIA = { geo_locations: { countries: ["IN"] } };

describe("1. AN ORDINARY BUSINESS SENDS NOTHING AT ALL", () => {
  it("THE LOAD-BEARING ONE: no evidence means no field", () => {
    // Not "declare it is not finance" — nothing. Adding a negative
    // declaration would be a claim nobody asked for, and the rule
    // forbids declaring in that direction too.
    expect(declarationFor({ india: true, evidence: none })).toEqual({ kind: "none" });
  });

  it("AND THE AD SET ONLY CARRIES THE FIELD WHEN IT IS DECLARED", () => {
    const src = code("src/lib/ads/launchCampaign.ts");
    expect(src).toMatch(
      /\.\.\.\(regulated\.kind === "declare" \? \{ regional_regulated_categories: \[regulated\.value\] \} : \{\}\)/
    );
  });

  it("ordinary trade words are not evidence", () => {
    // Each of these would stop a legitimate launch every single time.
    for (const text of [
      "Huge stock clearance sale this week",
      "Trust Jewellers — 30 years in Lucknow",
      "Share this with a friend and both get 10% off",
      "Our returns policy is 7 days, no questions",
      "A fund-raiser for the local school",
    ]) {
      expect(financeEvidence([{ label: "Your ad text", text }]).found, text).toEqual([]);
    }
  });

  it("A NON-INDIA AUDIENCE NEVER GETS THE FIELD, evidence or not", () => {
    const evidence = financeEvidence([{ label: "Your ad text", text: "mutual funds" }]);
    expect(evidence.found.length).toBeGreaterThan(0);
    expect(declarationFor({ india: false, evidence })).toEqual({ kind: "none" });
  });
});

describe("2. EVIDENCE ASKS — IT NEVER DECLARES", () => {
  const evidence = () => financeEvidence([{ label: "Your ad text", text: "Learn intraday trading with guaranteed returns" }]);

  it("IT SPOTS WHAT IS ACTUALLY THERE", () => {
    const e = evidence();
    expect(e.found).toContain("intraday trading");
    expect(e.found).toContain("guaranteed returns");
    expect(e.where).toBe("Your ad text");
  });

  it("THE LOAD-BEARING ONE: evidence REFUSES, and never declares", () => {
    // Declaring INDIA_FINSERV without verified identities is Meta's
    // "Verification required for 1 location" (#3858541) — a claim made
    // on the business's behalf that Meta rejects anyway.
    const d = declarationFor({ india: true, evidence: evidence() });
    expect(d.kind).toBe("refuse");
    expect(d.kind === "refuse" && d.reason).toMatch(/verified/i);
    expect(d.kind === "refuse" && d.reason).toMatch(/SEBI/);
  });

  it("AND IT SAYS WHERE IT SAW IT, so the owner can answer", () => {
    // "Your ad text mentions mutual funds" is answerable. "This looks
    // like a finance business" is not.
    const d = declarationFor({
      india: true,
      evidence: financeEvidence([
        { label: "Your ad text", text: "Diwali offer" },
        { label: "The category on your profile", text: "Mutual Funds advisory" },
      ]),
    });
    expect(d.kind === "refuse" && d.reason).toMatch(/The category on your profile mentions mutual funds/);
  });

  it("IT OFFERS THE WAY OUT, because a wrong match must not be a dead end", () => {
    const d = declarationFor({ india: true, evidence: evidence() });
    expect(d.kind === "refuse" && d.reason).toMatch(/if this isn't a finance or investment ad/i);
  });

  it("the regulated terms really do match the regulated things", () => {
    for (const text of ["open a demat account", "SEBI registered", "best IPO to apply", "portfolio management service", "crypto trading tips"]) {
      expect(financeEvidence([{ label: "Your ad text", text }]).found.length, text).toBeGreaterThan(0);
    }
  });
});

describe("3. THE OWNER'S WORD BEATS A KEYWORD", () => {
  const evidence = () => financeEvidence([{ label: "Your ad text", text: "stock market" }]);

  it("A RECORDED 'NOT FINANCE' SENDS NOTHING, despite the match", () => {
    // The whole point of asking. A keyword match is a question, and
    // once answered the answer stands.
    expect(declarationFor({ india: true, evidence: evidence(), ownerSaysFinance: false })).toEqual({ kind: "none" });
  });

  it("AND A RECORDED 'YES, AND VERIFIED' IS THE ONLY WAY TO INDIA_FINSERV", () => {
    expect(declarationFor({ india: true, evidence: evidence(), ownerSaysFinance: true })).toEqual({
      kind: "declare",
      value: INDIA_FINSERV,
    });
    expect(INDIA_FINSERV).toBe("INDIA_FINSERV");
  });

  it("NOTHING SETS ownerSaysFinance YET, so a declaration cannot happen by accident", () => {
    // The question belongs with the one proposed commit 10 asks, so
    // there is one way of asking rather than two. Until something
    // records an answer, "declare" is unreachable in production.
    const src = code("src/lib/ads/launchCampaign.ts");
    expect(src).not.toMatch(/ownerSaysFinance/);
  });
});

describe("4. IT REACHES THE LAUNCH, AND STOPS IT", () => {
  it("THE PREFLIGHT TURNS A REFUSAL INTO A PROBLEM", () => {
    const r = preflight({ regulated: { kind: "refuse", reason: "Meta needs the advertiser verified." } });
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.key)).toEqual(["needs_finance_verification"]);
    expect(r.problems[0].message).toMatch(/verified/);
  });

  it("AND none AND declare BOTH PASS IT", () => {
    expect(preflight({ regulated: { kind: "none" } }).ok).toBe(true);
    expect(preflight({ regulated: { kind: "declare", value: INDIA_FINSERV } }).ok).toBe(true);
  });

  it("THE LAUNCH COMPUTES IT FROM THE BUSINESS'S OWN WORDS", () => {
    const src = code("src/lib/ads/launchCampaign.ts");
    const at = src.indexOf("const regulated = declarationFor({");
    expect(at).toBeGreaterThan(-1);
    const call = src.slice(at, at + 500);
    expect(call).toMatch(/india: targetsIndia\(built\.targeting\)/);
    expect(call).toMatch(/label: "Your ad text"/);
    expect(call).toMatch(/label: "The category on your profile"/);
  });

  it("AND IT IS CHECKED BEFORE THE CAMPAIGN EXISTS", () => {
    // A refusal after the campaign POST would leave an orphan behind
    // for an ad that was never allowed to run.
    const src = code("src/lib/ads/launchCampaign.ts");
    const decide = src.indexOf("const regulated = declarationFor({");
    const campaign = src.indexOf("/campaigns`");
    expect(campaign).toBeGreaterThan(decide);
  });
});

describe("5. TARGETING INDIA IS WHAT MAKES IT APPLY", () => {
  it("a country list containing IN", () => {
    expect(targetsIndia(INDIA)).toBe(true);
  });

  it("a resolved city or region — this codebase only resolves Indian ones", () => {
    expect(targetsIndia({ geo_locations: { cities: [{ key: "123" }] } })).toBe(true);
    expect(targetsIndia({ geo_locations: { regions: [{ key: "r1" }] } })).toBe(true);
  });

  it("AN EMPTY OR MISSING GEO IS NOT INDIA", () => {
    expect(targetsIndia({ geo_locations: { cities: [] } })).toBe(false);
    expect(targetsIndia({})).toBe(false);
    expect(targetsIndia(null)).toBe(false);
  });

  it("another country is not India", () => {
    expect(targetsIndia({ geo_locations: { countries: ["AE"] } })).toBe(false);
  });
});

describe("6. THE TRADE WORDS NEVER REACH ANYTHING THAT WRITES COPY", () => {
  it("THE LOAD-BEARING ONE: only the refusal path imports this module", () => {
    // Rule 3. These are Meta's regulated scope, not a vertical Hawlai
    // serves — and they are allowed here only because they travel in
    // one direction: raising a question and stopping a launch. The day
    // an agent or a prompt imports them, they have become vocabulary.
    const allowed = new Set([
      "src/lib/ads/launchCampaign.ts",
      "src/lib/ads/regulatedCategory.ts",
      // The interview registry, added 19 November 2026 with commit 10.
      // It reads specialCategoryEvidence for ONE purpose: deciding
      // whether to show the owner the special-category question at all.
      // It asks a question; it does not write copy, and the prompt it
      // holds names only Meta's own three categories.
      "src/lib/onboarding/interview.ts",
    ]);
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) {
          if (allowed.has(full)) continue;
          if (code(full).includes("ads/regulatedCategory")) offenders.push(full);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });

  it("AND THE MODULE ITSELF WRITES NOTHING", () => {
    // No model call, no prompt, no generated text — it only ever
    // returns a decision and a sentence for the owner.
    const src = code("src/lib/ads/regulatedCategory.ts");
    expect(src).not.toMatch(/callClaude|anthropic|generate/i);
    expect(src).not.toMatch(/fetch\(/);
  });
});
