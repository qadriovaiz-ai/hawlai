// S3/P0 — THE LEVEL VOCABULARY, AND THE TWO INVARIANTS.
//
// A level decides whether the owner is asked at all, so a bug here
// un-gates an action silently. Every test below is written so that the
// failure mode it guards against is the DANGEROUS one: something
// running without being asked.
//
// The founder's answers of 22 October 2026 are the spec:
//
//   L1  "owner ki chat-instruction pe turant chalta hai (bina extra
//        approval-click ke), kyunki reversible hai aur undo-backed hai"
//   L2  not now - it waits for S5's outcome loop, "kabhi nuksaan na ho,
//        sirf growth", and that proof only comes from measurement

import { describe, it, expect } from "vitest";
import {
  DEFAULT_LEVEL,
  canHoldL1,
  effectiveLevel,
  levelNote,
  pinnedToL0,
  requiresApproval,
  type AutonomyLevel,
} from "@/lib/autonomyLevels";
import { ACTION_POLICIES } from "@/lib/executionPolicy";
import { code } from "./helpers/source";

describe("1. the default is to ask", () => {
  it("NO ROW MEANS L0", () => {
    expect(DEFAULT_LEVEL).toBe("L0");
    expect(effectiveLevel("lead_update", { hasUndo: true })).toBe("L0");
    expect(effectiveLevel("lead_update", { stored: null, hasUndo: true })).toBe("L0");
  });

  it("AND AN ACTION NOBODY HAS CLASSIFIED CAN NEVER BE RAISED", () => {
    // ACTION_POLICIES' own header: absence is not "safe by default".
    expect(pinnedToL0("something_nobody_wrote_down")).toBeTruthy();
    expect(effectiveLevel("something_nobody_wrote_down", { stored: "L1", hasUndo: true })).toBe("L0");
  });

  it("requiresApproval is just the level, read the other way round", () => {
    expect(requiresApproval("lead_update", { hasUndo: true })).toBe(true);
    expect(requiresApproval("lead_update", { stored: "L1", hasUndo: true })).toBe(false);
  });
});

describe("2. INVARIANT — money is never above L0", () => {
  it("NO ROW CAN RAISE A SPEND ACTION, AND THIS IS THE WHOLE POINT", () => {
    expect(effectiveLevel("activate_ad_campaign", { stored: "L1", hasUndo: true })).toBe("L0");
    expect(requiresApproval("activate_ad_campaign", { stored: "L1", hasUndo: true })).toBe(true);
  });

  it("FOR EVERY SPEND ACTION IN THE REGISTRY, not just the one I thought of", () => {
    const spends = Object.entries(ACTION_POLICIES).filter(([, p]) => p.actionType === "spend");
    expect(spends.length).toBeGreaterThan(0);
    for (const [key] of spends) {
      expect(pinnedToL0(key)).toBeTruthy();
      expect(effectiveLevel(key, { stored: "L1", hasUndo: true })).toBe("L0");
    }
  });

  it("and for everything whose consequence cannot be taken back", () => {
    // AUTOMATION_TOGGLES' own words: a public post cannot be unseen any
    // more than a placed call can be unplaced. An undo() method cannot
    // make those reversible.
    const critical = Object.entries(ACTION_POLICIES).filter(([, p]) => p.riskLevel === "critical");
    expect(critical.length).toBeGreaterThan(0);
    for (const [key] of critical) {
      expect(effectiveLevel(key, { stored: "L1", hasUndo: true })).toBe("L0");
    }
  });

  it("AND THE DATABASE CANNOT EVEN SAY L2", () => {
    // The strongest form of "L2 is not in S3": not a code check that a
    // later edit can drop, but a CHECK constraint a row has to satisfy.
    const sql = code("supabase/migrations/209_action_levels.sql");
    expect(sql).toMatch(/check \(level in \('L0', 'L1'\)\)/);
    expect(sql).not.toMatch(/'L2'/);
  });
});

describe("3. INVARIANT — switching off is never slower than switching on", () => {
  it("THE DISABLE DIRECTION NEVER CONSULTS A LEVEL", () => {
    // CLAUDE.md rule 6. masterBrainV2's toggle path already writes
    // straight to the row when enabled is false; a level must not be
    // able to put an approval in front of that.
    expect(effectiveLevel("auto_paused_campaign", { stored: null, hasUndo: false, direction: "disable" })).toBe("L1");
    expect(requiresApproval("auto_paused_campaign", { stored: null, hasUndo: false, direction: "disable" })).toBe(false);
  });

  it("EVEN FOR AN ACTION THAT IS PINNED TO L0 IN EVERY OTHER RESPECT", () => {
    // Turning spend OFF is the safe direction too. This is the case
    // that makes the ordering inside effectiveLevel load-bearing.
    expect(effectiveLevel("activate_ad_campaign", { stored: null, hasUndo: false, direction: "disable" })).toBe("L1");
  });

  it("while enabling the same thing still asks", () => {
    expect(effectiveLevel("auto_paused_campaign", { stored: null, hasUndo: true, direction: "enable" })).toBe("L0");
  });
});

describe("4. INVARIANT — L1 means nothing without an undo", () => {
  it("AN ACTION THAT CANNOT BE PUT BACK STAYS AT L0", () => {
    expect(canHoldL1("lead_update", false).ok).toBe(false);
    expect(effectiveLevel("lead_update", { stored: "L1", hasUndo: false })).toBe("L0");
  });

  it("and with an undo it may be raised", () => {
    expect(canHoldL1("lead_update", true).ok).toBe(true);
    expect(effectiveLevel("lead_update", { stored: "L1", hasUndo: true })).toBe("L1");
  });
});

describe("5. the owner is told when their setting could not be honoured", () => {
  it("A SILENT DOWNGRADE IS THE WRONG KIND OF SAFE", () => {
    const note = levelNote("lead_update", { stored: "L1", hasUndo: false });
    expect(note).toBeTruthy();
    expect(note).toMatch(/still asking first/);
  });

  it("says nothing when there is nothing to explain", () => {
    expect(levelNote("lead_update", { stored: "L1", hasUndo: true })).toBeNull();
    expect(levelNote("lead_update", { stored: null, hasUndo: true })).toBeNull();
  });

  it("and never names a business, a product or a trade", () => {
    // multiTenantVocabulary's rule, applied to a new owner-facing
    // string before it ships rather than after.
    const notes = [
      levelNote("lead_update", { stored: "L1", hasUndo: false }),
      levelNote("activate_ad_campaign", { stored: "L1", hasUndo: true }),
      levelNote("something_nobody_wrote_down", { stored: "L1", hasUndo: true }),
    ].filter(Boolean) as string[];
    expect(notes.length).toBe(3);
    for (const n of notes) expect(n).not.toMatch(/candle|ghee|paneer|salon|dairy|keratin/i);
  });
});

describe("6. the migration says what the code says", () => {
  const sql = code("supabase/migrations/209_action_levels.sql");

  it("is scoped to one business and one action", () => {
    expect(sql).toMatch(/dealership_id uuid references dealerships\(id\) on delete cascade not null/);
    expect(sql).toMatch(/unique ?\(dealership_id, action_key\)/);
  });

  it("HAS ROW LEVEL SECURITY, like every other tenant table", () => {
    expect(sql).toMatch(/alter table action_levels enable row level security/);
    expect(sql).toMatch(/dealership_id in \(select id from dealerships where owner_id = auth\.uid\(\)\)/);
  });

  it("does not constrain action_key, and says why", () => {
    // Migration 170's reasoning, reused rather than re-litigated: the
    // policy table is code and moves faster than migrations, and a
    // mismatch is caught by a test instead of a failed insert at the
    // worst moment.
    expect(sql).not.toMatch(/check \(action_key in/);
  });
});

describe("7. every level that exists is one the code handles", () => {
  it("THE TYPE AND THE CONSTRAINT CANNOT DRIFT APART", () => {
    // If a later migration widens the CHECK, this fails until the code
    // is taught the new level - which is the direction that matters,
    // because an unknown level read as L1 would un-gate an action.
    const sql = code("supabase/migrations/209_action_levels.sql");
    const inDb = [...sql.matchAll(/'(L\d)'/g)].map((m) => m[1]);
    expect([...new Set(inDb)].sort()).toEqual(["L0", "L1"]);
    const handled: AutonomyLevel[] = ["L0", "L1"];
    for (const level of inDb) expect(handled).toContain(level as AutonomyLevel);
  });

  it("and an unrecognised stored value resolves downward, not upward", () => {
    expect(effectiveLevel("lead_update", { stored: "L2" as any, hasUndo: true })).toBe("L0");
    expect(effectiveLevel("lead_update", { stored: "anything" as any, hasUndo: true })).toBe("L0");
  });
});
