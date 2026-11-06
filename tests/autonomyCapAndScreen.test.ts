// THE CAP, THE MORNING THAT ASKS, AND THE SCREEN — S7/P6.
//
// THREE SMALL THINGS, each with one way of being wrong that matters:
//
//   THE CAP must ASK when it is reached, not fail — the work still
//   happens on the owner's word and only the autonomy is lost. And an
//   unreadable count must mean no room left, because a cap that opens
//   when the database hiccups is not a cap.
//
//   THE MORNING THAT ASKS must say WHY it did not ask. "Not approved
//   often enough yet" is every morning for weeks; "the record could not
//   be read" is a fault, and a subsystem reporting `asked: 0` for both
//   would hide the second for weeks.
//
//   THE SCREEN must never fold "not checked yet" into a clean count.
//   The monitor runs the morning after, so today's work has no verdict,
//   and showing that as nothing-wrong is the confusion S7/P2 exists to
//   prevent — on a screen instead of in a table.

import { describe, it, expect, vi, afterEach } from "vitest";
import { L2_ALLOWLIST, L2_DAILY_CAP } from "@/lib/autonomy/policy";
import { actedAloneToday, autonomyOverview, capRemaining, startOfTodayIst } from "@/lib/autonomy/overview";
import { reviewAutonomy } from "@/lib/autonomy/review";
import { GROUPS } from "@/lib/automation/cronGroups";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";
import { code, sourceWithComments } from "./helpers/source";

const TODAY = "2026-11-06";
const KEY = "update_page_meta";

afterEach(() => vi.restoreAllMocks());

/** The tables the overview reads, in the shapes it reads them. */
function db(opts: {
  actions?: any[];
  actionsError?: string;
  level?: string | null;
  checks?: any[];
  askedCards?: any[];
} = {}) {
  const seen: Record<string, any> = {};
  const client = {
    from(table: string) {
      const chain: any = {
        _filters: {} as Record<string, any>,
        select: () => chain,
        eq(c: string, v: any) {
          chain._filters[c] = v;
          return chain;
        },
        is(c: string, _v: any) {
          chain._filters[`is:${c}`] = true;
          return chain;
        },
        gte(c: string, v: any) {
          seen[`gte:${c}`] = v;
          return chain;
        },
        order: () => chain,
        limit: () => chain._resolve(),
        maybeSingle: () =>
          Promise.resolve({
            data: table === "action_levels" && opts.level ? { level: opts.level } : null,
            error: null,
          }),
        _resolve() {
          // THE FILTERS ARE HONOURED, AND THE FIRST VERSION IGNORED
          // THEM. Two mutations survived because of it: dropping
          // `.is("approval_id", null)` from the cap's count and
          // dropping `.eq("published", true)` from the screen's both
          // changed nothing any test could see. A double that returns
          // the same rows whatever it is asked is not testing a query.
          const keep = (row: any) =>
            Object.entries(chain._filters).every(([k, v]) => {
              if (k.startsWith("is:")) return row[k.slice(3)] === null || row[k.slice(3)] === undefined;
              return !(k in row) || row[k] === v;
            });
          if (table === "publish_actions") {
            return opts.actionsError
              ? Promise.resolve({ data: null, error: { message: opts.actionsError } })
              : Promise.resolve({ data: (opts.actions ?? []).filter(keep), error: null });
          }
          if (table === "claim_checks") return Promise.resolve({ data: (opts.checks ?? []).filter(keep), error: null });
          if (table === "pending_approvals") return Promise.resolve({ data: opts.askedCards ?? [], error: null });
          return Promise.resolve({ data: [], error: null });
        },
        then: (resolve: any) => chain._resolve().then(resolve),
      };
      return chain;
    },
  };
  return { client, seen };
}

describe("1. THE CAP IS THE FOUNDER'S NUMBER, AND IT CLOSES RATHER THAN OPENS", () => {
  it("THREE A DAY, for the first action and the first month", () => {
    expect(L2_DAILY_CAP).toBe(3);
  });

  it("COUNTS ONLY WHAT RAN WITH NOBODY WATCHING, AND ONLY TODAY", async () => {
    // An action with no approval row is one nobody was asked about:
    // publish/create.ts writes status 'approved' with no approval_id
    // exactly when the level let it skip the question.
    const d = db({
      actions: [
        { id: "p1", approval_id: null },
        { id: "p2", approval_id: null },
        // ASKED ABOUT, so not unattended. Without this row the filter
        // that excludes it is invisible, and a mutation dropping it
        // survived exactly that way.
        { id: "p3", approval_id: "app-1" },
      ],
    });
    expect(await actedAloneToday(d.client, "d1", KEY, TODAY)).toBe(2);
    // MIDNIGHT IST, not UTC. A cap that resets at 5:30am local is a cap
    // the owner would see break at breakfast.
    expect(d.seen["gte:created_at"]).toBe(startOfTodayIst(TODAY));
    expect(startOfTodayIst(TODAY)).toBe("2026-11-05T18:30:00.000Z");
  });

  it("AN UNREADABLE COUNT MEANS NO ROOM LEFT, NOT ALL OF IT", async () => {
    // THE DIRECTION THAT MATTERS. Zero reads as "there is room left
    // today", which is what lets something run unattended on a morning
    // nobody could check.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = db({ actionsError: "boom" });
    expect(await actedAloneToday(d.client, "d1", KEY, TODAY)).toBeNull();
    expect(await capRemaining(d.client, "d1", TODAY)).toBe(0);
  });

  it("AND THE REMAINDER IS THE CAP MINUS WHAT IS USED, never negative", async () => {
    expect(await capRemaining(db({ actions: [] }).client, "d1", TODAY)).toBe(L2_DAILY_CAP);
    expect(await capRemaining(db({ actions: [{ id: "a", approval_id: null }] }).client, "d1", TODAY)).toBe(L2_DAILY_CAP - 1);
    const many = Array.from({ length: L2_DAILY_CAP + 4 }, (_, i) => ({ id: `a${i}`, approval_id: null }));
    expect(await capRemaining(db({ actions: many }).client, "d1", TODAY)).toBe(0);
  });

  it("THE DOOR ASKS WHEN THE CAP IS REACHED — it does not fail", () => {
    // Nothing is lost but the autonomy: the owner gets the ordinary
    // card and the work still happens on his word. A cap that threw
    // would turn a safety limit into an outage.
    // SCOPED TO THE CAP BRANCH. My first version sliced to the end of
    // the file and matched a `return` three functions later — an
    // assertion that read as "the cap does not return" while actually
    // reading the whole file.
    const create = code("src/lib/publish/create.ts");
    const from = create.indexOf('storedLevel === "L2"');
    const branch = create.slice(from, create.indexOf("}", create.indexOf("publishLog(\"create.cap_reached", from)));
    expect(branch.length, "the cap branch was not found").toBeGreaterThan(80);
    expect(branch).toMatch(/needsApproval = true/);
    expect(branch, "the cap throws or returns instead of asking").not.toMatch(/\b(throw|return)\b/);
    // AND IT IS CHECKED AT THE DOOR, where the level is read — a cap
    // checked elsewhere is one something could get around by calling a
    // different function.
    expect(create).toMatch(/capRemaining/);
    expect(create.indexOf("readStoredLevel")).toBeLessThan(create.indexOf("capRemaining"));
  });

  it("and it is only consulted for an action that is actually at L2", () => {
    // An L1 action skips the question too, and it skips it on the
    // owner's own instruction — capping that would be rationing what he
    // asked for.
    const create = code("src/lib/publish/create.ts");
    expect(create).toMatch(/if \(!needsApproval && storedLevel === "L2"\)/);
  });
});

describe("2. THE MORNING THAT ASKS", () => {
  function reviewDb(result: { proposed: boolean; why?: string; approvalId?: string }) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
              order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
              then: (r: any) => r({ data: [], error: null }),
            }),
          }),
        }),
      }),
      _result: result,
    } as any;
  }

  it("ASKS ONCE WHEN THE EVIDENCE IS THERE, and says so loudly", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const promotion = await import("@/lib/autonomy/promotion");
    vi.spyOn(promotion, "proposePromotion").mockResolvedValue({
      proposed: true,
      approvalId: "ap-1",
      evidence: {} as any,
    });
    const out = await reviewAutonomy(reviewDb({ proposed: true }), "d1", TODAY);
    expect(out.asked).toBe(1);
    expect(out.skipped).toEqual([]);
    // The one card in the product whose subject is a permission. He
    // should be able to find the morning it was raised.
    expect(errors.join("\n")).toMatch(/may run unattended/);
  });

  it("AND SAYS WHY IT DID NOT ASK, which is what makes a quiet morning readable", async () => {
    const promotion = await import("@/lib/autonomy/promotion");
    vi.spyOn(promotion, "proposePromotion").mockResolvedValue({
      proposed: false,
      why: "you have not approved this often enough yet for me to be sure",
    });
    const out = await reviewAutonomy(reviewDb({ proposed: false }), "d1", TODAY);
    expect(out.asked).toBe(0);
    expect(out.skipped).toEqual([{ actionKey: KEY, why: "you have not approved this often enough yet for me to be sure" }]);
  });

  it("AND AN UNREADABLE RECORD IS SAID OUT LOUD, WHILE AN ORDINARY MORNING IS NOT", async () => {
    // Every morning for weeks says "not enough approvals yet"; a log
    // line for each would bury the one morning that says the record
    // could not be read.
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const promotion = await import("@/lib/autonomy/promotion");

    vi.spyOn(promotion, "proposePromotion").mockResolvedValue({ proposed: false, why: "you have not approved this often enough yet" });
    await reviewAutonomy(reviewDb({ proposed: false }), "d1", TODAY);
    expect(errors).toEqual([]);

    vi.spyOn(promotion, "proposePromotion").mockResolvedValue({ proposed: false, why: "the record could not be read, so nothing was proposed" });
    await reviewAutonomy(reviewDb({ proposed: false }), "d1", TODAY);
    expect(errors.join("\n")).toMatch(/could not decide/);
  });

  it("IS A signals SUBSYSTEM — database-only, and it calls no model", () => {
    // cronGroups.ts's own rule. The monitor pays the extractor per row
    // and lives in `heavy`; this one reads rows and writes a card.
    expect(GROUPS.signals).toContain("autonomy_review");
    expect(GROUPS.heavy).not.toContain("autonomy_review");
    expect(typeof DAILY_RUNNERS.autonomy_review).toBe("function");
    const src = code("src/lib/autonomy/review.ts");
    expect(src, "the morning that asks calls a model").not.toMatch(/callClaude|extractClaims|generateCopy/);
  });

  it("and it raises a card and nothing else — no level is written here", () => {
    const src = code("src/lib/autonomy/review.ts");
    expect(src).not.toMatch(/action_levels/);
  });
});

describe("3. THE SCREEN, AND THE WORD IT MUST NOT FOLD AWAY", () => {
  it("'NOT CHECKED YET' IS ITS OWN COUNT, NEVER PART OF THE CLEAN ONE", async () => {
    // The monitor runs the morning after something is published, so
    // today's work has no verdict. Reading that as nothing-wrong is the
    // confusion S7/P2 exists to prevent.
    const d = db({
      level: "L2",
      checks: [
        { monitor_verdict: "clean", published: true },
        { monitor_verdict: null, published: true },
        { monitor_verdict: "could_not_check", published: true },
        { monitor_verdict: "unsupported", published: true },
        // CAUGHT AND NEVER PUBLISHED. The system working, and it must
        // not appear on a screen about what went out — a mutation
        // dropping the `published` filter survived until this row
        // existed.
        { monitor_verdict: "unsupported", published: false },
      ],
    });
    const { rows } = await autonomyOverview(d.client, "d1", TODAY);
    expect(rows[0].published.checked).toBe(1);
    // NULL AND 'could_not_check' BOTH COUNT HERE. Neither is a clean
    // bill of health, and the second is the monitor saying so.
    expect(rows[0].published.notCheckedYet).toBe(2);
    expect(rows[0].published.failed).toBe(1);
  });

  it("SAYS WHAT LEVEL EACH ACTION IS AT, AND WHY IT IS NOT HIGHER", async () => {
    const atL0 = await autonomyOverview(db({ level: null }).client, "d1", TODAY);
    expect(atL0.rows[0].level).toBe("L0");
    expect(String(atL0.rows[0].why)).toMatch(/still asking you each time/);

    const atL2 = await autonomyOverview(db({ level: "L2" }).client, "d1", TODAY);
    expect(atL2.rows[0].level).toBe("L2");
    // AT L2 THERE IS NOTHING TO EXPLAIN, and a sentence there would be
    // a reason for a thing that is not happening.
    expect(atL2.rows[0].why).toBeNull();
  });

  it("AND NEVER SAYS A LEVEL NAME TO HIM", async () => {
    // He did not choose a letter. The card and the screen both say what
    // happens, not what it is called.
    const { rows } = await autonomyOverview(db({ level: null }).client, "d1", TODAY);
    for (const row of rows) {
      expect(String(row.why ?? ""), String(row.why)).not.toMatch(/\bL[012]\b|action_levels/);
      expect(row.label).not.toMatch(/\bL[012]\b/);
    }
    const ui = code("src/components/autopilot/AutonomyLevelsCard.tsx");
    expect(ui).toMatch(/Runs on its own/);
    expect(ui).toMatch(/Asks you first/);
    expect(ui, "the screen shows a level name").not.toMatch(/>L[012]</);
  });

  it("SHOWS A WAITING QUESTION, so the card and the screen agree", async () => {
    const d = db({ askedCards: [{ action_details: { action_key: KEY } }] });
    const { rows } = await autonomyOverview(d.client, "d1", TODAY);
    expect(rows[0].asked).toBe(true);
    // And somebody else's pending card is not his question.
    const other = db({ askedCards: [{ action_details: { action_key: "update_post" } }] });
    expect((await autonomyOverview(other.client, "d1", TODAY)).rows[0].asked).toBe(false);
  });

  it("AND THE READ ROUTE CANNOT CHANGE A PERMISSION", () => {
    // A level is raised in exactly one place and lowered without asking
    // anyone. A PATCH here would be a third way to change a permission,
    // which is the shape every bypass in this codebase has had.
    const route = code("src/app/api/autonomy/route.ts");
    expect(route).toMatch(/export async function GET/);
    expect(route).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
    expect(route, "the read route writes a level").not.toMatch(/from\("action_levels"\)[\s\S]{0,40}\.(insert|update|upsert)/);
    // THE OWNER'S OWN CLIENT, not the service role: RLS is the second
    // gate on whose levels these are.
    expect(route).toMatch(/createClient/);
    expect(route).not.toMatch(/createServiceClient/);
  });

  it("THE CARD USES THE SHARED CHROME, so its background cannot be got wrong", () => {
    // THE ACTUAL FIX FOR 6 NOVEMBER'S BUG, not the symptom. The title
    // came out invisible because the card's background was written by
    // hand as `bg-slate-900` — which in this repo's inverted scale is
    // near-WHITE — under `text-slate-900` text.
    //
    // tests/invertedSlateScale.test.ts catches that exact pair anywhere
    // in src/. This catches the thing that let it happen: a component
    // declaring its own card surface instead of using `.card`, which is
    // `bg-slate-100` and cannot be got wrong.
    const ui = code("src/components/autopilot/AutonomyLevelsCard.tsx");
    const containers = [...ui.matchAll(/className="([^"]*p-5[^"]*)"/g)].map((m) => m[1]);
    expect(containers.length, "the card's containers were not found").toBeGreaterThan(2);
    for (const list of containers) {
      expect(list, `"${list}" hand-rolls a surface`).toMatch(/\bcard\b/);
      expect(list, `"${list}" declares its own background`).not.toMatch(/\bbg-/);
    }
  });

  it("and it lives on the page that calls itself the one automation surface", () => {
    // CLAUDE.md rule 5: depth over breadth. No new page.
    // THE JSX, NOT THE IMPORT. The first version matched
    // "AutonomyLevelsCard" anywhere in the file, so deleting the card
    // from the page left the import standing and the test green — an
    // assertion satisfiable by any occurrence, which is the shape this
    // session has now hit five times.
    const page = sourceWithComments("src/app/dashboard/autopilot/page.tsx");
    expect(page).toMatch(/<AutonomyLevelsCard \/>/);
    expect(page).toMatch(/import AutonomyLevelsCard/);
    expect(page).toMatch(/rule 5/);
    expect(L2_ALLOWLIST.length).toBeGreaterThan(0);
  });
});
