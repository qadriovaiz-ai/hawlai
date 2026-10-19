// THE GRADING SHEET MUST SHOW THE RECORDS THE PIPELINE HAD.
//
// Founder, 19 October 2026: "business.city record ban gaya bola — isko
// dikhao. Grading sheet ke records box mein koi city field nahi hai …
// sirf dawe par nahi chalega."
//
// He was right, and the fault was not the claim. The sheet assembled
// its OWN record list — the owner's rows, the catalogue, a shipping
// line — so it showed the grader a different set from the one the door
// actually read. business.city had been a record for two runs, "Indore"
// appeared six times in the output, and the sheet had no city in it, so
// the claim could not be checked.
//
// That is the fixture bug of S1-1 running the other way. Then the
// graders saw records the pipeline lacked; here the pipeline had records
// the graders could not see. Either way the sheet is not evidence about
// the pipeline, and a blind grader cannot be asked to take anything on
// trust.

import { describe, it, expect } from "vitest";
import { toGradedRows } from "../scripts/eval/harness";
import { CASES } from "../scripts/eval/cases";
import { contextFromFacts } from "@/lib/facts/getContext";
import { code } from "./helpers/source";

const caseById = (id: string) => CASES.find((c) => c.id === id)!;
const recordsFor = (id: string) => toGradedRows(caseById(id), { body: "Placeholder." }, [])[0].availableFacts;

describe("the sheet's records are the door's records", () => {
  it("EVERY RECORD THE CONTEXT HOLDS APPEARS ON THE SHEET", () => {
    for (const id of ["candle-01", "salon-10", "dairy-07"]) {
      const c = caseById(id);
      const ctx = contextFromFacts(c.fixture.key, c.fixture.facts, { kind: "email", topic: c.topic });
      const shown = recordsFor(id).join("\n");
      for (const r of ctx.records) {
        // A statement key is shown as the owner's words, not as a key.
        const needle = r.key.startsWith("statement.") ? String(r.value) : r.key;
        expect(shown, `${id}: ${r.key}`).toContain(needle);
      }
    }
  });

  it("THE CITY IS ON THE SHEET — the claim the founder asked to see", () => {
    expect(recordsFor("salon-10").join("\n")).toContain("business.city = Indore");
    expect(recordsFor("dairy-07").join("\n")).toContain("business.city = Indore");
    expect(recordsFor("candle-01").join("\n")).toContain("business.city = Shahjahanpur");
  });

  it("and so are the offers and the counts, which were also missing", () => {
    const dairy = recordsFor("dairy-07").join("\n");
    expect(dairy).toContain("offer.first10.percent = 10 percent");
    expect(dairy).toContain("business.paid_orders = 40");
  });

  it("A KNOWN-UNKNOWN READS AS ONE, not as an absence", () => {
    // The salon ships nothing. "shipping.mode = NO ANSWER ON RECORD" is
    // a different thing from no shipping line at all, and a grader
    // judging "free shipping on treatments" needs the difference.
    expect(recordsFor("salon-10").join("\n")).toContain("shipping.mode = NO ANSWER ON RECORD");
  });

  it("WHAT THE SLICE WITHHELD IS NAMED", () => {
    // getContext narrows to the product the topic mentions. A grader
    // judging "a smaller option of ghee at 120 INR" has to know the
    // paneer existed and was NOT given to the writer — otherwise the
    // claim looks unjudgeable rather than wrong.
    const dairy = recordsFor("dairy-07").join("\n");
    expect(dairy).toMatch(/not given to the writer for this piece: Paneer 250g/);
  });

  it("a records-unreadable case shows nothing, and says so", () => {
    expect(recordsFor("candle-08")).toEqual([]);
  });

  it("THE SHEET CALLS THE DOOR'S OWN READER — one source, not two", () => {
    const src = code("scripts/eval/harness.ts");
    expect(src).toContain("contextFromFacts");
    // The hand-built list is gone. If it comes back, the two drift
    // again and nobody notices until a grader asks.
    expect(src).not.toContain("extractFromKnowledge");
  });
});
