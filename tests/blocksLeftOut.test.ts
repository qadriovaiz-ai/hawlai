// WHICH BLOCK WAS LEFT OUT, AND OVER WHICH FIGURE — 5 November 2026.
//
// Since 3 November a report block whose figures nobody counted is
// pruned rather than taking the email down with it, and the email says
// so: "I left 1 thing out of this email, because a figure in it did not
// trace back to anything I counted."
//
// THE OWNER WAS TOLD SOMETHING WAS MISSING AND GIVEN NO WAY TO FIND IT.
// `blocksLeftOut` was a count in a run result that the call site
// dropped; `removed` — the block kinds and the offending figures — was
// a `console.error` in Vercel's logs, which he has never read. The
// product knew and said so where nobody was looking, which is the same
// shape as the fault the pruning rule exists to fix.
//
// WHAT THESE TESTS HOLD DOWN:
//
//   1. The line names the FIGURE as well as the block, because "a stat
//      block was left out" sends somebody searching and "over 7" is a
//      search.
//   2. The row lands in audit_log, which the owner can read and nothing
//      can alter.
//   3. A FAILED record says so. A best-effort writer with a silent
//      failure would reproduce the very fault it is fixing, and this
//      record has nothing to fall back on but a log line.
//   4. And it never breaks a send, whatever the database does.

import { describe, it, expect, vi, afterEach } from "vitest";
import { LEFT_OUT_EVENT, leftOutSummary, recordBlocksLeftOut } from "@/lib/growth/leftOut";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";
import { code } from "./helpers/source";

afterEach(() => vi.restoreAllMocks());

const REMOVED = [{ block: "suggestion", found: "5" }];
const TWO = [
  { block: "suggestion", found: "5" },
  { block: "stat", found: "1,200" },
];

/** An audit_log that records what it is given, or refuses to. */
function auditTable(opts: { error?: string; throws?: boolean } = {}) {
  const rows: any[] = [];
  const client = {
    from(table: string) {
      return {
        insert(values: any) {
          if (opts.throws) throw new Error("connection reset");
          if (opts.error) return Promise.resolve({ data: null, error: { message: opts.error } });
          rows.push({ table, ...values });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { client, rows };
}

describe("1. THE LINE NAMES THE BLOCK AND THE FIGURE", () => {
  it("SAYS WHICH FIGURE TOOK IT OUT, not only that something went", () => {
    // "a suggestion was left out" is the owner looking through a whole
    // morning's numbers. "over 5" is one search.
    const line = leftOutSummary("daily_report", "2026-11-05", REMOVED);
    expect(line).toContain("suggestion");
    expect(line).toContain('"5"');
    expect(line).toContain("2026-11-05");
    expect(line).toContain("daily report");
  });

  it("AND NAMES EVERY ONE WHEN THERE IS MORE THAN ONE", () => {
    // The plural case was unreachable in the first version of this
    // file: with one block in every fixture, a summary that printed
    // only `removed[0]` passed.
    const line = leftOutSummary("monthly_review", "2026-12-01", TWO);
    expect(line).toContain("2 blocks were");
    expect(line).toContain("suggestion");
    expect(line).toContain("stat");
    expect(line).toContain('"1,200"');
    expect(line).toContain("monthly review");
  });

  it("counts one as one, and says which email it was", () => {
    expect(leftOutSummary("daily_report", "2026-11-05", REMOVED)).toContain("1 block was");
    // "over a figure", not "each over a figure", when there is one.
    expect(leftOutSummary("daily_report", "2026-11-05", REMOVED)).not.toContain("each over");
    expect(leftOutSummary("daily_report", "2026-11-05", TWO)).toContain("each over");
    expect(leftOutSummary("daily_report", "2026-11-05", REMOVED)).not.toContain("monthly review");
    expect(leftOutSummary("monthly_review", "2026-12-01", REMOVED)).not.toContain("daily report");
  });
});

describe("2. THE RECORD LANDS WHERE THE OWNER CAN READ IT", () => {
  it("WRITES ONE audit_log ROW, WITH THE BLOCKS IN ITS DETAILS", async () => {
    // audit_log is migration 128: the owner may SELECT his own rows,
    // nothing may UPDATE or DELETE them, and event_type is free text on
    // purpose — so this needed no migration and no SQL from him.
    const { client, rows } = auditTable();
    const result = await recordBlocksLeftOut(client, {
      dealershipId: "d1",
      surface: "daily_report",
      day: "2026-11-05",
      removed: TWO,
    });
    expect(result.recorded).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].table).toBe("audit_log");
    expect(rows[0].event_type).toBe(LEFT_OUT_EVENT);
    expect(rows[0].dealership_id).toBe("d1");
    // THE STRUCTURED COPY, not just the sentence. A sentence can be
    // read; the details can be searched.
    expect(rows[0].details.blocks).toEqual(TWO);
    expect(rows[0].details.day).toBe("2026-11-05");
    expect(rows[0].summary).toContain('"1,200"');
  });

  it("AND WRITES NOTHING WHEN NOTHING WAS LEFT OUT", async () => {
    // Every ordinary morning goes through this call. A row a day saying
    // "0 blocks were left out" would bury the mornings that matter.
    const { client, rows } = auditTable();
    const result = await recordBlocksLeftOut(client, {
      dealershipId: "d1",
      surface: "daily_report",
      day: "2026-11-05",
      removed: [],
    });
    expect(result.recorded).toBe(false);
    expect(rows).toEqual([]);
  });

  it("names the surface in the actor, so the two emails are told apart", async () => {
    const { client, rows } = auditTable();
    await recordBlocksLeftOut(client, { dealershipId: "d1", surface: "monthly_review", day: "2026-12-01", removed: REMOVED });
    expect(rows[0].actor).toBe("cron:monthly_review");
  });
});

describe("3. A RECORD THAT COULD NOT BE WRITTEN SAYS SO", () => {
  it("REPORTS A REFUSED INSERT, WITH ITS REASON", async () => {
    // THE WHOLE POINT OF THIS COMMIT, pointed at itself. The fault
    // being fixed is a product that knew something and said it where
    // nobody looks. A recorder that failed silently would be that
    // fault again, one level down.
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: any[]) => void errors.push(args.join(" ")));
    const { client, rows } = auditTable({ error: "new row violates row-level security policy" });
    const result = await recordBlocksLeftOut(client, {
      dealershipId: "d1",
      surface: "daily_report",
      day: "2026-11-05",
      removed: REMOVED,
    });
    expect(result.recorded).toBe(false);
    expect(rows).toEqual([]);
    expect(errors.join("\n")).toContain("row-level security");
    // AND THE LINE ITSELF IS STILL THERE. Two records that fail in
    // different ways: the row needs the database, the log line does
    // not.
    expect(errors.join("\n")).toContain('"5"');
  });

  it("AND NEVER THROWS, whatever the client does", async () => {
    // This runs after the email has been built and before it is sent.
    // A bookkeeping failure that stopped the email would be far worse
    // than the one it is recording.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = auditTable({ throws: true });
    await expect(
      recordBlocksLeftOut(client, { dealershipId: "d1", surface: "daily_report", day: "2026-11-05", removed: REMOVED })
    ).resolves.toEqual({ recorded: false });
  });

  it("and the log line is written before the row is attempted", () => {
    // Order matters: if the audit write throws in a way nothing catches
    // one day, the line has already gone out.
    const src = code("src/lib/growth/leftOut.ts");
    expect(src.indexOf("console.error(`[growth] ${summary}`)")).toBeGreaterThan(0);
    expect(src.indexOf("console.error(`[growth] ${summary}`)")).toBeLessThan(src.indexOf("logAuditEvent(supabase"));
  });
});

describe("4. logAuditEvent REPORTS WHAT HAPPENED, AND STILL NEVER THROWS", () => {
  // It swallowed the reason as well as the exception. A refused insert
  // and a successful one were indistinguishable to all ten call sites,
  // and the one that needs to know is the one whose row is the only
  // record of something.

  it("ok ON A WRITE, AND NOT OK WITH THE REASON ON A REFUSAL", async () => {
    const good = auditTable();
    await expect(logAuditEvent(good.client, { dealershipId: "d1", actor: "a", eventType: "e", summary: "s" })).resolves.toEqual({ ok: true });

    const refused = auditTable({ error: "permission denied for table audit_log" });
    const out = await logAuditEvent(refused.client, { dealershipId: "d1", actor: "a", eventType: "e", summary: "s" });
    expect(out.ok).toBe(false);
    expect(out.error).toContain("permission denied");
  });

  it("AND A THROW IS STILL SWALLOWED, not re-thrown at the caller", async () => {
    // Ten call sites depend on this. Reporting is not the same as
    // raising.
    const { client } = auditTable({ throws: true });
    const out = await logAuditEvent(client, { dealershipId: "d1", actor: "a", eventType: "e", summary: "s" });
    expect(out.ok).toBe(false);
    expect(out.error).toContain("connection reset");
  });
});
