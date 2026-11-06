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
//   L2  not then - it waited for S5's outcome loop, "kabhi nuksaan na
//        ho, sirf growth", and that proof only comes from measurement
//
// L2 EXISTS SINCE S7/P4, 6 November 2026, because the measurement
// arrived: S5's decision and outcome records, S7/P1's record of what
// actually went out, S7/P2's second judge reading it, and S7/P3's
// brake. Two tests below were RESTATED for it rather than loosened, and
// each says so where it stands — the founder's decision 1 of
// 5 November, and CLAUDE.md rule 7 followed by bringing it to him
// first.

import { describe, it, expect } from "vitest";
import fs from "fs";
import {
  DEFAULT_LEVEL,
  canHoldL1,
  canHoldL2,
  effectiveLevel,
  levelNote,
  maxLevelFor,
  pinnedToL0,
  requiresApproval,
  type AutonomyLevel,
} from "@/lib/autonomyLevels";
import { L2_ALLOWLIST, isAllowlistedForL2 } from "@/lib/autonomy/policy";
import { ACTION_POLICIES, AUTOMATION_TOGGLES } from "@/lib/executionPolicy";
import { code, sql as sqlOf } from "./helpers/source";

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

  it("AND THE DATABASE REFUSES L2 FOR EVERY ONE OF THEM, not merely fails to spell it", () => {
    // RESTATED ON 6 NOVEMBER 2026, AND IT IS STRICTER THAN IT WAS.
    //
    // It used to assert that migration 209's CHECK allowed 'L0' and
    // 'L1' only — the strongest form of "L2 is not in S3". Migration
    // 220 widened that CHECK, on the founder's decision 1 of
    // 5 November, which he gave with this test in front of him
    // (CLAUDE.md rule 7: bring it to the owner, do not loosen it).
    //
    // THE INVARIANT WAS NEVER "L2 CANNOT EXIST". It was "a level cannot
    // be written that the code has not earned the right to honour", and
    // the old wording was the strongest statement of it available while
    // L2 was unreachable. Now there is a stronger one: a SECOND
    // constraint that names the keys permitted at L2, so the database
    // refuses it for everything else — including every action that
    // spends, deletes or cannot be taken back.
    //
    // 209 predicted this migration in those words: "a later migration
    // widens this CHECK the way 179 and 204 widened
    // publish_actions.platform — one value at a time, as each is
    // actually earned."
    const widened = sqlOf("supabase/migrations/220_action_levels_l2.sql");
    expect(widened).toMatch(/check \(level in \('L0', 'L1', 'L2'\)\)/);

    const clause = widened.slice(widened.indexOf("action_levels_l2_allowlist"));
    const allowed = [...clause.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((k) => k !== "L0" && k !== "L1" && k !== "L2");
    expect(allowed.length, "the allowlist constraint names no action key").toBeGreaterThan(0);

    // EVERY PINNED ACTION, WALKED. Not the one I thought of: the same
    // shape the spend invariant above uses.
    const pinned = Object.entries(ACTION_POLICIES).filter(
      ([, p]) => p.actionType === "spend" || p.actionType === "delete" || p.riskLevel === "critical"
    );
    expect(pinned.length).toBeGreaterThan(0);
    for (const [key] of pinned) {
      expect(allowed, `the database would accept L2 for ${key}`).not.toContain(key);
      // And the code refuses it too, with the specific reason rather
      // than "not on the list".
      expect(canHoldL2(key, { hasUndo: true }).ok, key).toBe(false);
    }
  });

  it("AND THE ALLOWLIST IN THE CODE AND THE ONE IN THE DATABASE CANNOT DRIFT", () => {
    // A key in the code and not in the constraint fails every insert at
    // the worst possible moment — the drift migration 170 refused to
    // allow for action_key, applied to the far smaller set that may run
    // unattended. A key in the constraint and not in the code is the
    // dangerous direction: the database would accept a level the code
    // has not been taught to honour.
    const clause = sqlOf("supabase/migrations/220_action_levels_l2.sql");
    const inDb = [...clause.slice(clause.indexOf("action_levels_l2_allowlist")).matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .filter((k) => !["L0", "L1", "L2"].includes(k));
    expect([...inDb].sort()).toEqual([...L2_ALLOWLIST].sort());
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
    expect(canHoldL1("lead_update", { hasUndo: false }).ok).toBe(false);
    expect(effectiveLevel("lead_update", { stored: "L1", hasUndo: false })).toBe("L0");
  });

  it("and with an undo it may be raised", () => {
    expect(canHoldL1("lead_update", { hasUndo: true }).ok).toBe(true);
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
    //
    // READ FROM THE NEWEST MIGRATION THAT DEFINES THE CONSTRAINT, found
    // rather than named — 6 November 2026. It named 209, and broke the
    // moment 220 widened it. The check is drop-and-recreate, so only
    // the highest-numbered one describes what the database accepts, and
    // naming a file here means this test has to be edited every time
    // the thing it guards changes. That is the edit that gets made
    // carelessly.
    const dir = "supabase/migrations";
    const latest = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && sqlOf(`${dir}/${f}`).includes("action_levels_level_check"))
      .sort()
      .pop();
    expect(latest, "no migration defines action_levels_level_check").toBeTruthy();
    const sql = sqlOf(`${dir}/${latest}`);
    const levelCheck = sql.slice(sql.indexOf("action_levels_level_check"));
    const inDb = [...levelCheck.matchAll(/'(L\d)'/g)].map((m) => m[1]);
    expect([...new Set(inDb)].sort()).toEqual(["L0", "L1", "L2"]);
    const handled: AutonomyLevel[] = ["L0", "L1", "L2"];
    for (const level of inDb) expect(handled).toContain(level as AutonomyLevel);
  });

  it("AND A LEVEL AN OLDER BUILD DOES NOT KNOW READS AS NOTHING", () => {
    // The other half of the same invariant, and the one that protects a
    // deploy in flight: readStoredLevel only returns a level this build
    // recognises, and anything else comes back null, which means L0,
    // which means ask. A newer database and an older build is a state
    // that exists for a few minutes on every deploy.
    const store = code("src/lib/autonomyLevelsStore.ts");
    expect(store).toMatch(/const KNOWN: AutonomyLevel\[\] = \["L0", "L1", "L2"\]/);
    expect(store).toMatch(/KNOWN as string\[\]\)\.includes/);
  });

  it("and an unrecognised stored value resolves downward, not upward", () => {
    // "L2" WAS THE EXAMPLE HERE UNTIL IT BECAME REAL. It is now a
    // level the code handles, so the fixture moved on to one that is
    // not — which is the test this was always meant to be: an
    // unrecognised value resolves to asking, whatever it says.
    expect(effectiveLevel("lead_update", { stored: "L3" as any, hasUndo: true })).toBe("L0");
    expect(effectiveLevel("lead_update", { stored: "anything" as any, hasUndo: true })).toBe("L0");
    expect(effectiveLevel("lead_update", { stored: "" as any, hasUndo: true })).toBe("L0");
    // AND A REAL L2 ON A NON-ALLOWLISTED ACTION ALSO RESOLVES TO L0 —
    // not to L1. The owner never said "run this on my word"; he said
    // "run it on your own", and a refusal of that is not consent to the
    // other thing.
    expect(effectiveLevel("lead_update", { stored: "L2", hasUndo: true })).toBe("L0");
  });
});

describe("8. L2 — RUNNING WITH NOBODY WATCHING — S7/P4", () => {
  // L1 is justified by reversibility. L2 is justified by reversibility
  // AND by this particular action having been earned, which is why
  // there is a list and why it holds one key.

  it("ONLY THE ALLOWLISTED ACTION CAN HOLD IT", () => {
    // The founder's decision 3: update_page_meta alone — the search
    // title and description of a page of his own site. Reversible,
    // undo-backed, nothing spends, nothing reaches an inbox.
    expect([...L2_ALLOWLIST]).toEqual(["update_page_meta"]);
    expect(canHoldL2("update_page_meta", { hasUndo: true }).ok).toBe(true);
    expect(maxLevelFor("update_page_meta", { hasUndo: true })).toBe("L2");
  });

  it("AND AN ACTION THE REGISTRY KNOWS BUT NOBODY EARNED CANNOT", () => {
    // update_post is classified, reversible in principle, and not on
    // the list. "Not yet shown to be safe" is a different refusal from
    // "can never be safe", and the owner is told the first one.
    expect(isAllowlistedForL2("update_post")).toBe(false);
    const refused = canHoldL2("update_post", { hasUndo: true });
    expect(refused.ok).toBe(false);
    expect(String(refused.why)).toMatch(/has not been shown to be safe/);
    expect(maxLevelFor("update_post", { hasUndo: true })).toBe("L1");
  });

  it("WITHOUT AN UNDO IT CANNOT, EVEN ON THE LIST", () => {
    // The platform half. hawlaiSite is the only platform implementing
    // undo(), so an allowlisted action whose platform loses that
    // implementation stops being eligible — and the refusal is L1's
    // reason, not the allowlist's, because that is the true one.
    const refused = canHoldL2("update_page_meta", { hasUndo: false });
    expect(refused.ok).toBe(false);
    expect(String(refused.why)).toMatch(/nothing can put this back/);
    expect(maxLevelFor("update_page_meta", { hasUndo: false })).toBe("L0");
  });

  it("AND NOTHING THAT SPENDS, DELETES OR CANNOT BE UNDONE CAN — FOR EVERY ONE IN THE REGISTRY", () => {
    // The exit test's own clause, walked rather than sampled.
    for (const [key, policy] of Object.entries(ACTION_POLICIES)) {
      if (policy.actionType !== "spend" && policy.actionType !== "delete" && policy.riskLevel !== "critical") continue;
      expect(canHoldL2(key, { hasUndo: true }).ok, key).toBe(false);
      expect(maxLevelFor(key, { hasUndo: true }), key).toBe("L0");
      // AND THE REASON IS THE SPECIFIC ONE. "It spends money" rather
      // than "it is not on the list", for an action that could never be
      // on the list.
      expect(String(canHoldL2(key, { hasUndo: true }).why), key).not.toMatch(/has not been shown to be safe/);
    }
  });

  it("AND AN UNCLASSIFIED ACTION CANNOT, allowlist or not", () => {
    // ACTION_POLICIES' own header: an action's absence there is not
    // "safe by default".
    expect(canHoldL2("something_nobody_wrote_down", { hasUndo: true }).ok).toBe(false);
    expect(String(canHoldL2("something_nobody_wrote_down", { hasUndo: true }).why)).toMatch(/no one has classified/);
  });

  it("THE ACTION THAT SWITCHES ON AN UNATTENDED AUTOMATION IS PINNED TO L0", () => {
    // FOUND BY S7's EXIT TEST, AND IT WAS A REAL HOLE.
    // `set_automation_toggle` is classified edit / high — not spend,
    // not delete, not critical — so every other rule let it reach L1.
    // ACTION_POLICIES' own comment says what it is: "THE ONE THAT TURNS
    // OFF EVERY OTHER GATE. After this runs, content publishes and
    // emails send with nobody looking."
    //
    // ASSERTED HERE AND NOT ONLY IN THE EXIT TEST. Two mutations
    // survived because the only assertion lived in tests/open/, which
    // the default suite does not run — so a guard found by the exit
    // test would have gone unprotected until P7 closed the stage.
    expect(maxLevelFor("set_automation_toggle", { hasUndo: true })).toBe("L0");
    expect(canHoldL1("set_automation_toggle", { hasUndo: true }).ok).toBe(false);
    expect(canHoldL2("set_automation_toggle", { hasUndo: true }).ok).toBe(false);
    expect(String(pinnedToL0("set_automation_toggle"))).toMatch(/cannot be less gated than that automation/);

    // AND THE REASON STAYS TRUE: it is pinned because what it switches
    // on is critical, so if no toggle were critical any more this
    // pinning would need re-arguing rather than silently surviving.
    const criticalToggles = Object.entries(AUTOMATION_TOGGLES).filter(([, t]) => t.risk === "critical");
    expect(criticalToggles.length, "no automation toggle is critical any more").toBeGreaterThan(2);
  });

  it("THE SWITCH-OFF DIRECTION IS STILL NEVER GATED", () => {
    // Rule 6, unchanged by L2: a level must not be able to make the
    // safe direction the slow one.
    expect(effectiveLevel("set_automation_toggle", { stored: "L2", hasUndo: true, direction: "disable" })).toBe("L1");
    expect(requiresApproval("set_automation_toggle", { stored: "L2", hasUndo: true, direction: "disable" })).toBe(false);
    // And enabling the same thing still asks, whatever the row says.
    expect(requiresApproval("set_automation_toggle", { stored: "L2", hasUndo: true, direction: "enable" })).toBe(true);
  });

  it("AND A SET-BUT-REFUSED L2 IS EXPLAINED, not silently downgraded", () => {
    // A silent downgrade is the wrong kind of safe: the owner would
    // conclude the setting does not work.
    const note = levelNote("update_post", { stored: "L2", hasUndo: true });
    expect(String(note)).toMatch(/run on its own/);
    expect(String(note)).toMatch(/still asking first/);
    expect(levelNote("update_page_meta", { stored: "L2", hasUndo: true })).toBeNull();
    // And it never says "L2" to him. He did not choose a letter.
    expect(String(note)).not.toMatch(/L[012]/);
  });

  it("and nothing in the product can grant it yet", () => {
    // P4 teaches the type and the database. Promotion is P5, and until
    // it exists the only way a row reaches L2 is somebody writing one
    // by hand — which is the state this phase is meant to be in.
    const files = fs.readdirSync("src/lib/autonomy");
    expect(files).not.toContain("promotion.ts");
    expect(pinnedToL0("update_page_meta")).toBeNull();
  });
});
