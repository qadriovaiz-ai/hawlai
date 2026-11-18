// Dismissing a finding has to mean something — 18 November 2026.
//
// THE DEFECT, AND IT RAN DAILY. The owner clearing a finding off his
// list wrote `dismissed`; the re-audit's live set is
// ("open","rejected"); so the next morning the same finding was
// inserted again as open and offered again. "A product that re-asks is
// one the owner stops reading" is a rule this codebase already states,
// and this was it, every day.
//
// Everything needed was already built and unreachable: migration 210
// added `rejected` and the constraint "a rejection without its date is
// a cooldown nobody can compute", `surfaceable` skips a finding
// rejected less than 30 days ago, and the unique index covers open and
// rejected. Nothing could put a row into that state.

import { describe, it, expect } from "vitest";
import { recordFindings } from "@/lib/growth/strategist";
import { inCooldown, REJECTION_COOLDOWN_DAYS } from "@/lib/growth/findings";
import { code } from "./helpers/source";

const ROUTE = "src/app/api/opportunities/[id]/route.ts";
const DAY = 86_400_000;

const finding = (reference = "r1") => ({
  type: "copy",
  reference,
  title: "A heading says nothing",
  detail: "detail",
  score: { impact: 3, confidence: 3, effort: 2 },
  evidence: [{ kind: "page", id: "home" }],
}) as any;

/** A database that records what it was asked to write. */
function db(live: any[] = []) {
  const updates: { id: string; payload: any }[] = [];
  const inserts: any[] = [];
  const client = {
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: (col: string, value: any) => {
          if (col === "id") chain._id = value;
          return chain;
        },
        in: async () => ({ data: live, error: null }),
        update: (payload: any) => {
          chain._payload = payload;
          return {
            eq: async (_c: string, id: string) => {
              updates.push({ id, payload: payload });
              return { error: null };
            },
          };
        },
        insert: async (row: any) => {
          inserts.push(row);
          return { error: null };
        },
      };
      return chain;
    },
  } as any;
  return { client, updates, inserts };
}

describe("1. A DISMISSAL IS RECORDED AS A DATED REJECTION", () => {
  const src = () => code(ROUTE);

  it("IT STORES WHAT THE WORD MEANS, not the word", () => {
    // THE LOAD-BEARING ONE. "dismissed" is a wire value — the feed
    // sends it, nothing displays it — and storing it was what made the
    // owner's "no" evaporate overnight.
    expect(src()).toMatch(/const rejecting = status === "dismissed";/);
    expect(src()).toMatch(/status: rejecting \? "rejected" : status,/);
  });

  it("AND IT DATES IT, because the constraint and the count both need that", () => {
    // Migration 210: "a rejection without its date is a cooldown
    // nobody can compute" — and it is a CHECK, so an undated rejection
    // would fail the write outright.
    expect(src()).toMatch(/\.\.\.\(rejecting \? \{ rejected_at: new Date\(\)\.toISOString\(\) \} : \{\}\)/);
  });

  it("COMPLETING IS UNTOUCHED — it is a decision, not a refusal", () => {
    // Only "completed" is recorded as a decision to measure, and that
    // branch must not start claiming a rejection.
    const s = src();
    expect(s).toMatch(/if \(status === "completed"\) \{/);
    const completed = s.slice(s.indexOf('if (status === "completed")'));
    expect(completed.slice(0, 400)).not.toMatch(/rejected_at/);
  });

  it("the route still accepts only the two words the feed sends", () => {
    expect(src()).toMatch(/\["completed", "dismissed"\]\.includes\(status\)/);
  });
});

describe("2. WHILE THE NO STANDS, IT IS NOT OFFERED AGAIN", () => {
  it("A REJECTED ROW IS LEFT ALONE, NOT REOPENED", async () => {
    const rejectedYesterday = new Date(Date.now() - 1 * DAY).toISOString();
    const { client, updates, inserts } = db([
      { id: "o1", type: "copy", reference_id: "r1", status: "rejected", rejected_at: rejectedYesterday },
    ]);
    await recordFindings(client, "d1", [finding()], { now: new Date() });
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].payload.status).toBeUndefined();
    expect(updates[0].payload.rejected_at).toBeUndefined();
  });

  it("AND THE WORDING IS STILL REFRESHED while it waits", () => {
    // The count in the title changes as the site changes; the
    // rejection and its date must not.
    const src = code("src/lib/growth/strategist.ts");
    expect(src).toMatch(/reopen \? \{ \.\.\.payload, status: "open", rejected_at: null \} : payload/);
  });

  it("an unreadable date counts as inside the cooldown", () => {
    // The owner said no once; a timestamp this code cannot parse is
    // not permission to ask again.
    expect(inCooldown("not a date", new Date())).toBe(true);
    expect(inCooldown(null, new Date())).toBe(false);
  });
});

describe("3. THIRTY DAYS LATER, THE SAME STEP COMES BACK", () => {
  it("A ROW PAST ITS COOLDOWN IS REOPENED", async () => {
    // The founder's answer of 4 November, which until now nothing
    // carried out: a rejected row was never picked (the picker reads
    // only `open`) and never re-inserted (it is in the live set), so a
    // rejection was permanent and the 30 was a number nothing counted
    // to.
    const old = new Date(Date.now() - (REJECTION_COOLDOWN_DAYS + 1) * DAY).toISOString();
    const { client, updates } = db([
      { id: "o1", type: "copy", reference_id: "r1", status: "rejected", rejected_at: old },
    ]);
    await recordFindings(client, "d1", [finding()], { now: new Date() });
    expect(updates[0].payload.status).toBe("open");
  });

  it("AND REOPENING CLEARS THE DATE", async () => {
    // A row that is open again has no standing rejection — leaving the
    // date would put it straight back into cooldown on the next pick.
    const old = new Date(Date.now() - (REJECTION_COOLDOWN_DAYS + 1) * DAY).toISOString();
    const { client, updates } = db([
      { id: "o1", type: "copy", reference_id: "r1", status: "rejected", rejected_at: old },
    ]);
    await recordFindings(client, "d1", [finding()], { now: new Date() });
    expect(updates[0].payload.rejected_at).toBeNull();
  });

  it("EXACTLY THIRTY DAYS IS STILL INSIDE IT", async () => {
    const exactly = new Date(Date.now() - REJECTION_COOLDOWN_DAYS * DAY + 1000).toISOString();
    const { client, updates } = db([
      { id: "o1", type: "copy", reference_id: "r1", status: "rejected", rejected_at: exactly },
    ]);
    await recordFindings(client, "d1", [finding()], { now: new Date() });
    expect(updates[0].payload.status).toBeUndefined();
  });

  it("AN OPEN ROW IS NEVER 'REOPENED' — nothing to undo", async () => {
    const { client, updates } = db([{ id: "o1", type: "copy", reference_id: "r1", status: "open", rejected_at: null }]);
    await recordFindings(client, "d1", [finding()], { now: new Date() });
    expect(updates[0].payload.status).toBeUndefined();
  });

  it("THE DATE IS READ FROM THE DATABASE, or it cannot be counted", () => {
    // A column the select never fetched is a cooldown that silently
    // never ends.
    const src = code("src/lib/growth/strategist.ts");
    expect(src).toMatch(/\.select\("id, type, reference_id, status, rejected_at"\)/);
  });
});
