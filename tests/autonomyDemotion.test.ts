// TAKING A PERMISSION BACK — S7/P3.
//
// Built before promotion exists, which is the whole shape of the stage:
// the brake before the accelerator. Nothing can reach L2 until P4/P5, so
// this file is tested against a rule rather than against a feature — and
// that is the point of writing it now.
//
// THE FIVE THINGS IT MUST GET RIGHT, in the order the mistakes cost:
//
//   1. IT FIRES ON WHAT WENT OUT, and never on what was caught. A claim
//      the guard removed is the system WORKING; counting it would make
//      this fire on its own successes.
//   2. THE OWNER'S OWN WORDS NEVER DEMOTE. He is entitled to publish
//      his own sentence. Punishing him for it would be the product
//      disciplining him for using it as designed.
//   3. A PUBLIC ESCAPE REACHES THE WHOLE BUSINESS, a private one does
//      not — the founder's decision 5.
//   4. A BLIND MONITOR DEMOTES. Silence is not evidence, and an
//      autonomous product whose supervisor died quietly is the worst
//      state this stage can produce.
//   5. AND IT ASKS NOBODY. Rule 6: the safe direction must not be the
//      slow one.

import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import { applyDemotion, demoteAfter, demoteFromRun, reachFor } from "@/lib/autonomy/demotion";
import { MONITOR_BLIND_DAYS } from "@/lib/claims/outputMonitor";
import { code, sourceWithComments, sql as sqlOf } from "./helpers/source";

const decisions: any[] = [];
vi.mock("@/lib/growth/recordDecision", () => ({
  recordDecisionQuietly: async (_s: any, input: any) => void decisions.push(input),
}));
const notes: any[] = [];
vi.mock("@/lib/notifications/emit", () => ({
  emitNotification: async (_s: any, input: any) => void notes.push(input),
}));

afterEach(() => {
  decisions.length = 0;
  notes.length = 0;
  vi.restoreAllMocks();
});

const ESCAPE = { surface: "page_meta", published: true, unsupported: 1 };

/** An action_levels table that records what was written. */
function db(opts: { rows?: any[]; error?: string } = {}) {
  const writes: any[] = [];
  const client = {
    from(_t: string) {
      const chain: any = {
        _update: null as any,
        _filters: {} as Record<string, any>,
        update(fields: any) {
          chain._update = fields;
          return chain;
        },
        eq(col: string, value: any) {
          chain._filters[col] = value;
          return chain;
        },
        neq(col: string, value: any) {
          chain._filters[`neq:${col}`] = value;
          return chain;
        },
        select: () =>
          opts.error
            ? Promise.resolve({ data: null, error: { message: opts.error } })
            : (writes.push({ ...chain._update, filters: { ...chain._filters } }),
              Promise.resolve({ data: opts.rows ?? [{ id: "l1" }], error: null })),
      };
      return chain;
    },
  };
  return { client, writes };
}

describe("1. IT FIRES ON WHAT WENT OUT, NOT ON WHAT WAS CAUGHT", () => {
  it("ONE PUBLISHED UNSUPPORTED CLAIM IS ENOUGH — NOT A RATE", () => {
    // A rate needs a denominator and a window, and both are arguments
    // to have while a wrong claim is live on a customer's screen.
    expect(demoteAfter([ESCAPE]).demote).toBe(true);
  });

  it("AND A CLAIM THAT WAS CAUGHT DEMOTES NOTHING", () => {
    // claims_removed is the system working. Migration 217's `published`
    // is the whole reason this distinction is available.
    expect(demoteAfter([{ ...ESCAPE, published: false }]).demote).toBe(false);
    expect(demoteAfter([{ ...ESCAPE, unsupported: 0 }]).demote).toBe(false);
    expect(demoteAfter([]).demote).toBe(false);
    expect(demoteAfter([]).reach).toBeNull();
  });

  it("THE OWNER'S OWN WORDING NEVER DEMOTES ANYTHING", () => {
    // Both page tools keep an unsupported claim when he says he wrote
    // it, and tell him he is standing behind it. Taking a permission
    // away for that would punish him for using the product as designed.
    expect(demoteAfter([{ ...ESCAPE, ownerWords: true }]).demote).toBe(false);
    // And one of his among ours still demotes, for ours.
    expect(demoteAfter([{ ...ESCAPE, ownerWords: true }, ESCAPE]).demote).toBe(true);
  });
});

describe("2. HOW WIDE IT REACHES — the founder's decision 5", () => {
  it("A PUBLIC OUTPUT TAKES EVERY RAISED LEVEL ON THAT BUSINESS", () => {
    // A claim that is wrong on a public page is usually wrong in the
    // next email too.
    for (const surface of ["page_meta", "page_text", "social", "product_description"]) {
      expect(demoteAfter([{ ...ESCAPE, surface }]).reach, surface).toBe("business");
    }
  });

  it("AND ONE PERSON'S INBOX IS NARROWER", () => {
    for (const surface of ["email", "whatsapp", "lead_message"]) {
      expect(demoteAfter([{ ...ESCAPE, surface }]).reach, surface).toBe("action");
    }
  });

  it("AN UNCLASSIFIED SURFACE IS TREATED AS PUBLIC, AND SAID OUT LOUD", () => {
    // The safe direction here is MORE demotion. A surface nobody has
    // classified is one nobody has thought about, and guessing "it only
    // went to one person" about an unknown channel is the guess that
    // costs something.
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    expect(reachFor("some_new_channel")).toBe("business");
    expect(errors.join("\n")).toMatch(/not a surface anyone has classified/);
  });

  it("AND THE WIDEST REACH AMONG SEVERAL WINS", () => {
    // An email escape and a page escape in one run is a public escape.
    // Taking the narrower of the two would leave the page's permission
    // in place.
    const mixed = demoteAfter([
      { ...ESCAPE, surface: "email" },
      { ...ESCAPE, surface: "page_text" },
    ]);
    expect(mixed.reach).toBe("business");
  });
});

describe("3. A BLIND MONITOR DEMOTES, because silence is not evidence", () => {
  it("TWO DAYS UNCHECKED IS ENOUGH, AND ONE IS NOT", () => {
    expect(demoteAfter([], { blindDays: MONITOR_BLIND_DAYS }).demote).toBe(true);
    expect(demoteAfter([], { blindDays: MONITOR_BLIND_DAYS }).blind).toBe(true);
    expect(demoteAfter([], { blindDays: MONITOR_BLIND_DAYS }).reach).toBe("business");
    expect(demoteAfter([], { blindDays: MONITOR_BLIND_DAYS - 1 }).demote).toBe(false);
  });

  it("AND NOTHING WAITING IS NOT BLINDNESS", () => {
    // A business that published nothing is not a business whose
    // monitor is broken. null must not be read as a large number of
    // days, nor as zero.
    expect(demoteAfter([], { blindDays: null }).demote).toBe(false);
    expect(demoteAfter([]).demote).toBe(false);
  });

  it("an escape outranks blindness, and says the escape's reason", () => {
    // Both true at once: something got out AND nothing has been checked
    // for days. The owner should be told the thing that happened, not
    // the thing that failed to happen.
    const both = demoteAfter([ESCAPE], { blindDays: 9 });
    expect(both.blind).toBe(false);
    expect(String(both.why)).toMatch(/do not support/);
  });

  it("and every reason is a sentence the owner could read", () => {
    for (const d of [demoteAfter([ESCAPE]), demoteAfter([{ ...ESCAPE, surface: "email" }]), demoteAfter([], { blindDays: 5 })]) {
      expect(String(d.why).length).toBeGreaterThan(30);
      // No jargon: these go into a notification and into the daily
      // email, which the owner reads and which never says "L2".
      expect(String(d.why)).not.toMatch(/L[012]|action_levels|claim_check/);
    }
  });
});

describe("4. CARRYING IT OUT", () => {
  it("LOWERS EVERY RAISED LEVEL AND LEAVES L0 ROWS ALONE", async () => {
    const d = db();
    const out = await applyDemotion(d.client, { dealershipId: "d1", decision: demoteAfter([ESCAPE]) });
    expect(out.lowered).toBe(1);
    expect(d.writes[0].level).toBe("L0");
    // A row already at L0 is not rewritten, so `lowered` counts what
    // changed rather than what was looked at.
    expect(d.writes[0].filters["neq:level"]).toBe("L0");
    expect(d.writes[0].filters.dealership_id).toBe("d1");
    // Business-wide: not scoped to one action.
    expect(d.writes[0].filters.action_key).toBeUndefined();
  });

  it("AND SCOPES TO ONE ACTION WHEN THAT IS THE REACH", async () => {
    const d = db();
    await applyDemotion(d.client, {
      dealershipId: "d1",
      decision: demoteAfter([{ ...ESCAPE, surface: "email" }]),
      actionKey: "send_email",
    });
    expect(d.writes[0].filters.action_key).toBe("send_email");
  });

  it("REFUSES LOUDLY WHEN THE REACH IS ONE ACTION AND NOBODY SAID WHICH", async () => {
    // Lowering everything would be wrong and lowering nothing silently
    // would be worse. It does neither.
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const d = db();
    const out = await applyDemotion(d.client, { dealershipId: "d1", decision: demoteAfter([{ ...ESCAPE, surface: "email" }]) });
    expect(out.lowered).toBe(0);
    expect(String(out.error)).toMatch(/nothing said which/);
    expect(d.writes).toEqual([]);
  });

  it("A WRITE THAT FAILED IS THE LOUDEST FAILURE IN THE STAGE", async () => {
    // A demotion that did not happen leaves an unattended action
    // running after the product decided it should not be.
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const d = db({ error: "permission denied" });
    const out = await applyDemotion(d.client, { dealershipId: "d1", decision: demoteAfter([ESCAPE]) });
    expect(out.lowered).toBe(0);
    expect(out.error).toBe("permission denied");
    expect(errors.join("\n")).toMatch(/COULD NOT LOWER/);
  });

  it("RECORDS IT AS A DECISION, so a revoked permission is measurable", async () => {
    // `automation_switched` has been a declared kind since migration
    // 215 and this is its first writer.
    const d = db();
    await applyDemotion(d.client, { dealershipId: "d1", decision: demoteAfter([ESCAPE]), evidenceIds: ["c1", "c2"] });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].kind).toBe("automation_switched");
    expect(decisions[0].why).toEqual([{ kind: "claim_check", id: "c1" }, { kind: "claim_check", id: "c2" }]);
    expect(decisions[0].decidedBy).toBe("system:output_monitor");
    // NO BASELINE AND NO SOURCE: what a removed permission did for the
    // business is not something this product collects, and migration
    // 215's fourth verdict exists for that. Claiming a source the
    // results job cannot read would be the invented number this project
    // refuses.
    expect(decisions[0].baseline).toBeNull();
    expect(decisions[0].measure.source).toBeNull();
  });

  it("AND TELLS THE OWNER, in two records that fail in different ways", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const d = db();
    await applyDemotion(d.client, { dealershipId: "d1", decision: demoteAfter([ESCAPE]) });
    expect(notes).toHaveLength(1);
    expect(notes[0].kind).toBe("autonomy_lowered");
    expect(String(notes[0].body)).toMatch(/do not support/);
    // emitNotification swallows a refused insert and notifications.kind
    // is CHECK-constrained, so until migration 218 is run the
    // notification lands nowhere. The line does not depend on it.
    expect(errors.join("\n")).toMatch(/lowered 1 level/);
  });

  it("and nothing is done when nothing is being demoted", async () => {
    const d = db();
    const out = await applyDemotion(d.client, { dealershipId: "d1", decision: demoteAfter([]) });
    expect(out.lowered).toBe(0);
    expect(d.writes).toEqual([]);
    expect(decisions).toEqual([]);
    expect(notes).toEqual([]);
  });
});

describe("5. THE JOIN WITH THE MONITOR", () => {
  it("A FAILED MONITOR RUN DEMOTES NOTHING", async () => {
    // A monitor that could not read its own table has not found a clean
    // morning — but it has not found an escape either, and demoting on
    // a database outage would punish a business for an outage. The
    // blindness it reports covers the case where nobody has looked for
    // days, and that is a measured number rather than a failed query.
    const d = db();
    const out = await demoteFromRun(d.client, "d1", { error: "relation does not exist", blindDays: 40, escapes: [] });
    expect(out.decision.demote).toBe(false);
    expect(d.writes).toEqual([]);
  });

  it("AND AN ESCAPE THE MONITOR FOUND IS CARRIED OUT, WITH ITS ROW AS EVIDENCE", async () => {
    const d = db();
    const out = await demoteFromRun(d.client, "d1", {
      blindDays: 0,
      escapes: [{ id: "cc-1", surface: "page_meta", published: true, unsupported: 2, ownerWords: false }] as any,
    });
    expect(out.decision.demote).toBe(true);
    expect(out.lowered).toBe(1);
    expect(decisions[0].why).toEqual([{ kind: "claim_check", id: "cc-1" }]);
  });

  it("and a blind run with no escapes still demotes", async () => {
    const d = db();
    const out = await demoteFromRun(d.client, "d1", { blindDays: MONITOR_BLIND_DAYS, escapes: [] });
    expect(out.decision.blind).toBe(true);
    expect(out.lowered).toBe(1);
  });
});

describe("6. IT ASKS NOBODY — rule 6's shape", () => {
  it("THERE IS NO APPROVAL ANYWHERE ON THIS PATH", () => {
    // CLAUDE.md rule 6: "Switching an automation off is never gated —
    // the safe direction must not be the slow one." A demotion that
    // waited for a click would leave an unattended action running while
    // it waited.
    const src = code("src/lib/autonomy/demotion.ts");
    expect(src).not.toMatch(/requestApproval/);
    expect(src).not.toMatch(/pending_approvals/);
    expect(src).not.toMatch(/executionPolicy/);
  });

  it("AND THE FILE SAYS WHY, so a later tidy-up does not add one", () => {
    const src = sourceWithComments("src/lib/autonomy/demotion.ts");
    expect(src).toMatch(/rule 6/);
    expect(src).toMatch(/safe direction must not be the slow one/);
  });

  it("it only ever writes L0, never a level upward", () => {
    // The dangerous direction is up, and this file is the one that goes
    // down. A promotion living here would make "demotion" the thing
    // that could grant a permission.
    const src = code("src/lib/autonomy/demotion.ts");
    expect(src).toMatch(/level: "L0"/);
    expect(src).not.toMatch(/level: "L[12]"/);
  });
});

describe("7. IT IS WIRED, AND THE DATABASE WILL TAKE THE TELLING", () => {
  it("the runner joins the monitor to the demotion", () => {
    // Neither one calls the other: the monitor spends money and talks
    // to a model, and the rule that takes a permission away must be
    // testable without either. So the daily runner is the one place
    // that knows about both, and a group entry with no join behind it
    // would be a monitor that finds escapes and does nothing.
    // THE JOIN IS A NAMED FUNCTION, not an inline body in the runner
    // table. tests/dailyRunOrder.test.ts checks every entry there
    // against one shape — "  <key>: (s, " — and an async arrow broke
    // it. That test catching this is the test working, so the code
    // moved rather than the assertion.
    const runners = code("src/lib/automation/dailyRunners.ts");
    expect(runners).toContain("  output_monitor: (s, id) => monitorAndDemote(s, id),");

    const join = code("src/lib/autonomy/demotion.ts");
    const fn = join.slice(join.indexOf("export async function monitorAndDemote"));
    expect(fn).toMatch(/runOutputMonitor\(supabase, dealershipId\)/);
    expect(fn).toMatch(/demoteFromRun\(supabase, dealershipId, run\)/);
    expect(fn.indexOf("runOutputMonitor")).toBeLessThan(fn.indexOf("demoteFromRun"));
  });

  it("migration 218 teaches the notifications table the new kind", () => {
    // notifications.kind is CHECK-constrained and emitNotification
    // swallows a refused insert, so without this the brake would work,
    // write its decision row, and tell him nothing.
    // THROUGH sql(), which strips `--`. `code()` does not, and these
    // migrations carry headers that quote the very clauses a test looks
    // for — the hiding place rule 8 is about, in a file type the
    // default helper does not cover.
    const sql = sqlOf("supabase/migrations/218_notification_kind_autonomy_lowered.sql");
    expect(sql).toMatch(/notifications_kind_check/);
    expect(sql).toMatch(/'autonomy_lowered'/);
    // AND IT KEEPS EVERY KIND THAT WAS ALREADY THERE. The pattern is
    // drop-and-recreate, so an omission here silently stops an existing
    // notification from being written at all.
    for (const kind of ["competitor_alert", "goal_completed", "email_delivery_problem", "platform_ai_unavailable"]) {
      expect(sql, `${kind} would stop being writable`).toContain(`'${kind}'`);
    }
    // AND THE HEADER STILL CARRIES THE REASON, a separate assertion
    // because it is about the comment on purpose.
    expect(sourceWithComments("supabase/migrations/218_notification_kind_autonomy_lowered.sql")).toMatch(/rule 6/);
  });

  it("and the type and the constraint cannot drift apart", () => {
    // The same invariant tests/autonomyLevels.test.ts holds for levels.
    // BOTH SIDES SCOPED TO THE DECLARATION THEY ARE ABOUT.
    //
    // My first version read every quoted word in each file and failed
    // on `supabase.from("notifications")`. Worse, the SQL side was
    // generous in the dangerous direction: `code()` strips // and /* */
    // and NOT SQL's `--`, so a kind named only in a comment would have
    // counted as present in the constraint. Both now read the
    // declaration itself.
    const emit = code("src/lib/notifications/emit.ts");
    const union = emit.slice(emit.indexOf("NotificationKind ="), emit.indexOf(";", emit.indexOf("NotificationKind =")));
    const declared = (union.match(/"([a-z_]+)"/g) ?? []).map((m) => m.replace(/"/g, ""));
    expect(declared.length, "the NotificationKind union was not found").toBeGreaterThan(15);

    // THE NEWEST MIGRATION THAT TOUCHES THE CONSTRAINT, found rather
    // than named. Naming 218 broke the moment 219 added a kind: the
    // constraint is drop-and-recreate, so only the highest-numbered one
    // describes what the database actually accepts. Six migrations have
    // rewritten it so far, and there will be a seventh.
    const dir = "supabase/migrations";
    const latest = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && sqlOf(`${dir}/${f}`).includes("notifications_kind_check"))
      .sort()
      .pop();
    expect(latest, "no migration defines notifications_kind_check").toBeTruthy();
    const sql = sqlOf(`${dir}/${latest}`);
    const clause = sql.slice(sql.indexOf("check (kind in ("), sql.indexOf("));", sql.indexOf("check (kind in (")));
    const inSql = (clause.match(/'([a-z_]+)'/g) ?? []).map((m) => m.replace(/'/g, ""));
    expect(inSql.length, "the CHECK clause was not found").toBeGreaterThan(15);
    for (const kind of declared) {
      expect(inSql, `${kind} is a declared kind the database would refuse`).toContain(kind);
    }
  });
});
