// THE SECOND JUDGE — S7/P2.
//
// The claim guard decides what may go out. The monitor reads what DID
// go out and asks again, from scratch, knowing nothing about what the
// guard thought. One sentence from the file it reuses is the whole
// argument: "THE RUN CANNOT BE THE JUDGE OF THE RUN."
//
// THE FIVE THINGS THESE TESTS HOLD DOWN, in the order the mistakes
// would cost:
//
//   1. "I COULD NOT CHECK" IS NOT "CLEAN". An unreachable extractor
//      read as "nothing found" is F-01's shape — `facts ? guard() :
//      skip` turned a guard off on a transient read error — and here it
//      would leave an autonomous product running with a dead
//      supervisor, in the state that looks exactly like everything
//      being fine.
//   2. A ROW THAT COULD NOT BE CHECKED COMES BACK. A final verdict
//      would retire a row nobody read.
//   3. BLINDNESS IS MEASURED FROM WHAT IS WAITING, not from when the
//      monitor last ran. A monitor that runs every morning and fails
//      every morning has run recently and seen nothing.
//   4. THE CAP IS NOT A PASS. Rows left over stay unchecked and keep
//      ageing, so the blindness grows.
//   5. AND A VERDICT THAT WAS NOT WRITTEN DID NOT HAPPEN.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MONITOR_BLIND_DAYS,
  MONITOR_BUDGET_INR,
  MONITOR_LOOKBACK_DAYS,
  MONITOR_MAX_ROWS,
  blindnessOf,
  lookbackFrom,
  runOutputMonitor,
  verdictFor,
} from "@/lib/claims/outputMonitor";
import { GROUPS } from "@/lib/automation/cronGroups";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";
import { NEEDS_RECIPIENT_RECORD, UNLICENSABLE_TYPES } from "@/lib/facts/extractClaims";
import { code, sourceWithComments } from "./helpers/source";

const TODAY = "2026-11-06";

/** What the extractor said, per call, in order. */
let answers: any[] = [];
let asked: string[][] = [];
vi.mock("@/lib/facts/extractClaims", async (orig) => ({
  ...(await orig<any>()),
  extractClaims: async (sentences: string[]) => {
    asked.push(sentences);
    return answers.shift() ?? { ok: true, claims: [], costInr: 0.2 };
  },
}));

afterEach(() => {
  answers = [];
  asked = [];
  vi.restoreAllMocks();
});

function row(over: Record<string, any> = {}) {
  return {
    id: "c1",
    text: "Hand-poured soy candles, made in Srinagar.",
    created_at: "2026-11-05T06:00:00.000Z",
    monitor_verdict: null,
    ...over,
  };
}

/** A claim_checks table that hands back rows and records updates. */
function db(rows: any[], opts: { readError?: string; writeError?: string } = {}) {
  const updates: Record<string, any>[] = [];
  const client = {
    from(_table: string) {
      const chain: any = {
        _update: null as Record<string, any> | null,
        _id: null as string | null,
        select: () => chain,
        eq(col: string, value: any) {
          if (col === "id") chain._id = value;
          return chain;
        },
        or: () => chain,
        gte: () => chain,
        order: () => chain,
        update(fields: Record<string, any>) {
          chain._update = fields;
          return chain;
        },
        limit: () => Promise.resolve(opts.readError ? { data: null, error: { message: opts.readError } } : { data: rows, error: null }),
        then: (resolve: any) => {
          if (chain._update) {
            if (opts.writeError) return resolve({ data: null, error: { message: opts.writeError } });
            updates.push({ id: chain._id, ...chain._update });
            return resolve({ data: null, error: null });
          }
          return resolve(opts.readError ? { data: null, error: { message: opts.readError } } : { data: rows, error: null });
        },
      };
      return chain;
    },
  };
  return { client, updates };
}

describe("1. 'I COULD NOT CHECK' IS A VERDICT, AND IT IS NOT 'CLEAN'", () => {
  it("AN UNREACHABLE EXTRACTOR IS NOT A CLEAN BILL OF HEALTH", () => {
    // The whole file turns on this. Reading a refusal as "no claims
    // found" would mark the output of a dead supervisor as fine.
    const out = verdictFor({ ok: false, claims: [], notCopy: [], sentences: ["x"] });
    expect(out.verdict).toBe("could_not_check");
    expect(out.findings).toEqual([]);
    expect(out.verdict).not.toBe("clean");
  });

  it("AND A SILENT ANSWER IS STILL AN ANSWER, which is the other direction", () => {
    // Run 8's shape: zero claims reported, and the run read as clean
    // because nothing was looking. That IS clean here — the difference
    // is that the extractor answered. The distinction lives in `ok`,
    // not in the claim count.
    expect(verdictFor({ ok: true, claims: [], notCopy: [], sentences: ["x"] }).verdict).toBe("clean");
  });

  it("A CLAIM OF A TYPE NOTHING CAN LICENSE IS A FAILURE", () => {
    // The same set the eval gate refuses, imported rather than
    // re-listed: benefit, capability, safety, comparison, and the one
    // that needs a record about THIS recipient.
    for (const claimType of [...UNLICENSABLE_TYPES, ...NEEDS_RECIPIENT_RECORD]) {
      const out = verdictFor({ ok: true, claims: [{ claimType, canonical: "x" }], notCopy: [], sentences: ["x"] });
      expect(out.verdict, claimType).toBe("unsupported");
      expect(out.findings[0].claimType).toBe(claimType);
    }
    // A claim type something CAN license is not a failure.
    expect(verdictFor({ ok: true, claims: [{ claimType: "product_attribute", canonical: "x" }], notCopy: [], sentences: ["x"] }).verdict).toBe("clean");
  });

  it("AND A PLACEHOLDER THAT WENT OUT IS A FAILURE FOUND FOR NOTHING", () => {
    // Gate run 6: "[LICENSE NUMBER NEEDED]" reached a customer with no
    // removal, because a placeholder is not a claim and nothing was
    // looking for one.
    const out = verdictFor({ ok: true, claims: [], notCopy: [{ sentenceIndex: 0, reason: "slot" }], sentences: ["[LICENSE NUMBER NEEDED]"] });
    expect(out.verdict).toBe("unsupported");
    expect(out.findings[0].claimType).toBe("placeholder");
    expect(out.findings[0].canonical).toContain("LICENSE NUMBER NEEDED");
  });
});

describe("2. A ROW THAT COULD NOT BE CHECKED COMES BACK", () => {
  it("THE QUERY ASKS FOR could_not_check ROWS AS WELL AS UNVERDICTED ONES", () => {
    // Writing 'could_not_check' as a final verdict would retire a row
    // nobody has actually read — the table would show a check that
    // never happened.
    const src = code("src/lib/claims/outputMonitor.ts");
    expect(src).toMatch(/monitor_verdict\.is\.null,monitor_verdict\.eq\.could_not_check/);
  });

  it("AND ITS TEXT IS KEPT, so there is something to check next time", async () => {
    answers = [{ ok: false, reason: "rate limited", costInr: 0 }];
    const d = db([row()]);
    const run = await runOutputMonitor(d.client, "d1", { today: TODAY });
    expect(run.couldNotCheck).toBe(1);
    expect(run.clean).toBe(0);
    expect(d.updates[0].monitor_verdict).toBe("could_not_check");
    expect("text" in d.updates[0], "the copy was cleared on a row nobody read").toBe(false);
  });

  it("AND A CLEAN ROW'S COPY IS DROPPED, because there is nothing to look at", async () => {
    // The only rows whose copy is dropped are the ones nothing was
    // wrong with. The plan said to keep only the refused sentences;
    // on reading it again, the copy of a row that was WRONG is the
    // evidence behind a demotion the owner will be told about.
    answers = [{ ok: true, claims: [], costInr: 0.2 }];
    const d = db([row()]);
    await runOutputMonitor(d.client, "d1", { today: TODAY });
    expect(d.updates[0].monitor_verdict).toBe("clean");
    expect(d.updates[0].text).toBe("");
  });

  it("AND AN UNSUPPORTED ROW KEEPS BOTH THE COPY AND THE FINDINGS", async () => {
    answers = [{ ok: true, claims: [{ claimType: "benefit", canonical: "burns longer" }], costInr: 0.2 }];
    const d = db([row()]);
    const run = await runOutputMonitor(d.client, "d1", { today: TODAY });
    expect(run.unsupported).toBe(1);
    expect("text" in d.updates[0]).toBe(false);
    expect(d.updates[0].monitor_unsupported).toBe(1);
    expect(d.updates[0].monitor_findings[0].canonical).toBe("burns longer");
    expect(typeof d.updates[0].checked_at).toBe("string");
  });

  it("and a verdict always travels with its time, which the table requires", async () => {
    // Migration 217: check ((monitor_verdict is null) = (checked_at is
    // null)). A write without both would be refused by Postgres.
    for (const answer of [{ ok: true, claims: [], costInr: 0.1 }, { ok: false, reason: "x", costInr: 0 }]) {
      answers = [answer];
      const d = db([row()]);
      await runOutputMonitor(d.client, "d1", { today: TODAY });
      expect(Boolean(d.updates[0].monitor_verdict)).toBe(true);
      expect(Boolean(d.updates[0].checked_at)).toBe(true);
    }
  });
});

describe("3. BLINDNESS IS MEASURED FROM WHAT IS WAITING", () => {
  it("FROM THE OLDEST UNCHECKED ROW, NOT FROM WHEN THE MONITOR LAST RAN", () => {
    // A monitor that runs every morning and fails every morning has run
    // recently and seen nothing. Measuring its own activity would
    // report that as healthy — and an autonomous product whose
    // supervisor died quietly is the worst state S7 can produce.
    expect(blindnessOf([{ created_at: "2026-11-02T06:00:00Z" }, { created_at: "2026-11-05T06:00:00Z" }], TODAY)).toBe(4);
    expect(blindnessOf([{ created_at: "2026-11-06T06:00:00Z" }], TODAY)).toBe(0);
  });

  it("AND NOTHING WAITING IS NULL, NOT ZERO", () => {
    // A business that published nothing is not a business whose monitor
    // is working. S7/P3 must not read the two the same way.
    expect(blindnessOf([], TODAY)).toBeNull();
    expect(blindnessOf([{ created_at: null }], TODAY)).toBeNull();
    expect(blindnessOf([{ created_at: "not a date" }], TODAY)).toBeNull();
  });

  it("the run reports it, and two days is the threshold", async () => {
    // Two, because the dispatcher sent a stale secret for exactly two
    // days at the start of November and nobody knew until the owner
    // noticed a missing email.
    expect(MONITOR_BLIND_DAYS).toBe(2);
    answers = [{ ok: true, claims: [], costInr: 0.1 }];
    const d = db([row({ created_at: "2026-11-01T06:00:00.000Z" })]);
    const run = await runOutputMonitor(d.client, "d1", { today: TODAY });
    expect(run.blindDays).toBe(5);
  });

  it("and the lookback stops at a fortnight", () => {
    expect(MONITOR_LOOKBACK_DAYS).toBe(14);
    expect(lookbackFrom(TODAY)).toBe("2026-10-23");
    expect(lookbackFrom("nonsense")).toBe("nonsense");
  });
});

describe("4. THE CAP IS ARITHMETIC, NOT A SWITCH", () => {
  it("STOPS SPENDING AT THE CAP, AND SAYS HOW MANY ARE LEFT", async () => {
    // A cap rather than an on/off flag. A switch defaulting to off
    // would recreate the fault still open in production — dm_auto_reply
    // reading "on" over a path that does nothing — with the sides
    // swapped: a monitor that says it is running while it checks
    // nothing.
    answers = [
      { ok: true, claims: [], costInr: 1.5 },
      { ok: true, claims: [], costInr: 1.5 },
      { ok: true, claims: [], costInr: 1.5 },
    ];
    const d = db([row({ id: "c1" }), row({ id: "c2" }), row({ id: "c3" })]);
    const run = await runOutputMonitor(d.client, "d1", { today: TODAY, budgetInr: 2 });
    expect(run.looked).toBe(2);
    expect(run.costInr).toBe(3);
    expect(String(run.stoppedBecause)).toMatch(/cap for one run was reached/);
    expect(String(run.stoppedBecause)).toContain("1 rows are still unchecked");
  });

  it("AND WHAT IS LEFT OVER STILL COUNTS AS WAITING", async () => {
    // The rows the cap skipped keep ageing, so blindness grows and
    // S7/P3 sees it. A cap that quietly reported a clean run would be
    // the budget deciding the product was safe.
    answers = [{ ok: true, claims: [], costInr: 5 }];
    const d = db([row({ id: "c1", created_at: "2026-10-30T06:00:00.000Z" }), row({ id: "c2" })]);
    const run = await runOutputMonitor(d.client, "d1", { today: TODAY, budgetInr: 1 });
    expect(run.looked).toBe(1);
    expect(run.blindDays).toBe(7);
  });

  it("and the row cap is twenty, with the budget in rupees beside it", () => {
    expect(MONITOR_MAX_ROWS).toBe(20);
    expect(MONITOR_BUDGET_INR).toBe(2);
  });

  it("A PLACEHOLDER COSTS NOTHING, because the free check answers first", async () => {
    // notCopySentences finds it in code. Asking a model about
    // "[LICENSE NUMBER NEEDED]" would be paying for an answer already
    // known.
    answers = [];
    const d = db([row({ text: "[LICENSE NUMBER NEEDED] for every batch." })]);
    const run = await runOutputMonitor(d.client, "d1", { today: TODAY });
    expect(asked, "a model was asked about a placeholder").toEqual([]);
    expect(run.costInr).toBe(0);
    expect(run.unsupported).toBe(1);
  });
});

describe("5. WHAT IT DOES WHEN IT CANNOT DO ITS JOB", () => {
  it("AN UNREADABLE TABLE IS AN ERROR, NOT AN EMPTY MONTH", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const d = db([], { readError: 'relation "claim_checks" does not exist' });
    const run = await runOutputMonitor(d.client, "d1", { today: TODAY });
    expect(run.error).toMatch(/does not exist/);
    expect(run.looked).toBe(0);
    expect(run.blindDays).toBeNull();
    expect(errors.join("\n")).toMatch(/migration 217/);
  });

  it("AND A VERDICT THAT WAS NOT WRITTEN DID NOT HAPPEN", async () => {
    // The money is still spent and the row is still waiting. Counting
    // it as checked would report a check nothing can read.
    vi.spyOn(console, "error").mockImplementation(() => {});
    answers = [{ ok: true, claims: [], costInr: 0.2 }];
    const d = db([row()], { writeError: "permission denied" });
    const run = await runOutputMonitor(d.client, "d1", { today: TODAY });
    expect(run.looked).toBe(0);
    expect(run.clean).toBe(0);
    expect(run.error).toBe("permission denied");
    expect(run.costInr).toBe(0.2);
  });

  it("and a row whose copy is already cleared is skipped without a model call", async () => {
    answers = [];
    const d = db([row({ text: "" })]);
    const run = await runOutputMonitor(d.client, "d1", { today: TODAY });
    expect(asked).toEqual([]);
    expect(run.looked).toBe(0);
  });
});

describe("6. IT IS THE SAME PASS THE EVAL GATE RUNS, AND IT RUNS ON THE CRON", () => {
  it("ASKS ABOUT THE OPENED-OUT SENTENCES, as the door does", async () => {
    // Handing the extractor "#SoyWaxOnly" is asking a different
    // question from the one the pipeline asks, and it cleared a run
    // whose tags carried claims on 2026-10-20.
    answers = [{ ok: true, claims: [], costInr: 0.1 }];
    const d = db([row({ text: "Only soy wax. #SoyWaxOnly" })]);
    await runOutputMonitor(d.client, "d1", { today: TODAY });
    expect(asked[0].join(" ")).toMatch(/soy wax only/i);
    expect(asked[0].join(" ")).not.toContain("#SoyWaxOnly");
  });

  it("REUSES THE GATE'S OWN REFUSED SET rather than listing it again", () => {
    // Two differently-written judges would give one question two
    // answers.
    const src = code("src/lib/claims/outputMonitor.ts");
    expect(src).toMatch(/UNLICENSABLE_TYPES/);
    expect(src).toMatch(/NEEDS_RECIPIENT_RECORD/);
    expect(src, "the refused types are re-listed by hand").not.toMatch(/"benefit"[\s\S]{0,80}"safety"/);
    // And it says where the instrument came from.
    expect(sourceWithComments("src/lib/claims/outputMonitor.ts")).toMatch(/outputGate\.eval\.ts/);
  });

  it("IS A heavy SUBSYSTEM, BEFORE THE EMAIL THAT WOULD REPORT IT", () => {
    // cronGroups.ts's own rule: signals is "database-only and fast…
    // never queues behind LLM calls", and this calls a model on every
    // row. And daily_autopilot sends the daily report, so a monitor
    // running after it reports today's escape tomorrow.
    expect(GROUPS.heavy).toContain("output_monitor");
    expect(GROUPS.signals).not.toContain("output_monitor");
    expect(GROUPS.heavy.indexOf("output_monitor")).toBeLessThan(GROUPS.heavy.indexOf("daily_autopilot"));
  });

  it("AND THE RUNNER TABLE HAS IT, so the group entry is not decoration", () => {
    // A key in GROUPS with no runner is a subsystem that writes a job
    // row every morning and does nothing.
    expect(typeof DAILY_RUNNERS.output_monitor).toBe("function");
  });
});
