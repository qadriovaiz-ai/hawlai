// EARNING THE RIGHT TO ACT ALONE — S7/P5.
//
// The founder's decision 2 of 5 November 2026: promotion ASKS ONCE,
// with the numbers on the card. The product gathers the evidence and
// writes the question; the owner's click writes the permission.
//
// FOUR READINGS WOULD EACH BE WRONG IN THE SAME DIRECTION, and each has
// its own test below:
//
//   a modification is not agreement. Migration 127 exists because he
//   sometimes approves Rs 3,000 where we asked for Rs 5,000, and
//   counting that as a yes is promoting on evidence of our own
//   inaccuracy.
//
//   an ignored card is not consent. A row nobody touched is him not
//   looking, and it is the most dangerous reading available here.
//
//   not_measurable is not a pass. S5 made it a first-class verdict so
//   "we could not tell" would stop being filed as "it was fine".
//
//   and evidence from before a demotion does not count, or an action
//   taken away for a real escape is re-promoted the same week on the
//   approvals that preceded it.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  IGNORED_AFTER_DAYS,
  confirmFor,
  earnsL2,
  gatherEvidence,
  proposePromotion,
  undoExistsFor,
  type PromotionEvidence,
} from "@/lib/autonomy/promotion";
import { PROMOTION_EVIDENCE } from "@/lib/autonomy/policy";
import { code } from "./helpers/source";

const TODAY = "2026-11-06";

/**
 * Take `undo()` away from every platform, for the one case that needs
 * it.
 *
 * The only allowlisted action's platform implements undo, so the undo
 * refusal inside proposePromotion is unreachable through real data.
 * Mocking the registry is the only honest way to exercise it — and
 * without it a mutation deleting that check survived.
 */
let noUndo = false;
vi.mock("@/lib/publish/registry", async (orig) => ({
  ...(await orig<any>()),
  createPlatformRegistry: (supabase: any) => {
    const real = (orig as any);
    void real;
    const built = realRegistry(supabase);
    if (!noUndo) return built;
    return Object.fromEntries(
      Object.entries(built).map(([id, p]: [string, any]) => [id, p ? { ...p, undo: undefined } : p])
    );
  },
}));
const { createPlatformRegistry: realRegistry } = await vi.importActual<any>("@/lib/publish/registry");

afterEach(() => {
  noUndo = false;
  vi.restoreAllMocks();
});

/** Evidence that earns it, so each test can break one thing. */
function clean(over: Partial<PromotionEvidence> = {}): PromotionEvidence {
  return {
    approvalsAsRequested: 10,
    modifications: 0,
    rejections: 0,
    ignored: 0,
    firstApprovalDaysAgo: 40,
    measuredOutcomes: 1,
    worsened: 0,
    notMeasurable: 0,
    ...over,
  };
}

const KEY = "update_page_meta";

describe("1. THE EVIDENCE RULE, AND THE FOUR WRONG READINGS", () => {
  it("CLEAN EVIDENCE EARNS IT", () => {
    const out = earnsL2(KEY, clean());
    expect(out.ok, String(out.why)).toBe(true);
    expect(out.why).toBeNull();
  });

  it("A MODIFIED APPROVAL IS NOT AGREEMENT", () => {
    // Migration 127 exists because the owner sometimes approves a
    // smaller number than we asked for. That is us being wrong.
    const out = earnsL2(KEY, clean({ modifications: 1 }));
    expect(out.ok).toBe(false);
    expect(String(out.why)).toMatch(/changed what I asked for/);
  });

  it("AND AN IGNORED CARD IS NOT CONSENT — one is enough", () => {
    // Not a threshold. One card he never looked at means the approvals
    // this rests on are not a record of him reading them.
    expect(earnsL2(KEY, clean({ ignored: 1 })).ok).toBe(false);
    expect(String(earnsL2(KEY, clean({ ignored: 1 })).why)).toMatch(/still waiting for you/);
  });

  it("A REJECTION DISQUALIFIES", () => {
    expect(earnsL2(KEY, clean({ rejections: 1 })).ok).toBe(false);
  });

  it("not_measurable IS NOT A PASS, AND SAYS SO IN THOSE TERMS", () => {
    const out = earnsL2(KEY, clean({ measuredOutcomes: 0, notMeasurable: 3 }));
    expect(out.ok).toBe(false);
    expect(String(out.why)).toMatch(/could not measure/);
    // AND THE TWO EMPTY CASES ARE TOLD APART. "Nothing was measured" and
    // "we tried and could not tell" are different things to hear.
    const nothing = earnsL2(KEY, clean({ measuredOutcomes: 0, notMeasurable: 0 }));
    expect(String(nothing.why)).toMatch(/nothing has been measured/);
    expect(String(nothing.why)).not.toMatch(/could not measure/);
  });

  it("AND A WORSENED OUTCOME DISQUALIFIES, whatever else is true", () => {
    expect(earnsL2(KEY, clean({ worsened: 1, measuredOutcomes: 9 })).ok).toBe(false);
    expect(String(earnsL2(KEY, clean({ worsened: 1 })).why)).toMatch(/made things worse/);
  });

  it("VOLUME CANNOT BUY TIME", () => {
    // Forty approvals in three days is one afternoon's enthusiasm, not
    // a month of this working.
    expect(earnsL2(KEY, clean({ approvalsAsRequested: 40, firstApprovalDaysAgo: 3 })).ok).toBe(false);
    expect(earnsL2(KEY, clean({ firstApprovalDaysAgo: null })).ok).toBe(false);
  });

  it("AND THE THRESHOLD IS THE FOUNDER'S, READ FROM THE ONE FILE", () => {
    // The numbers are not repeated here: the boundary is tested against
    // the policy constant, so changing the policy changes the test's
    // meaning rather than leaving two numbers to disagree.
    expect(PROMOTION_EVIDENCE).toEqual({
      approvalsAsRequested: 10,
      rejections: 0,
      modifications: 0,
      days: 30,
      measuredOutcomes: 1,
    });
    expect(earnsL2(KEY, clean({ approvalsAsRequested: PROMOTION_EVIDENCE.approvalsAsRequested })).ok).toBe(true);
    expect(earnsL2(KEY, clean({ approvalsAsRequested: PROMOTION_EVIDENCE.approvalsAsRequested - 1 })).ok).toBe(false);
    expect(earnsL2(KEY, clean({ firstApprovalDaysAgo: PROMOTION_EVIDENCE.days })).ok).toBe(true);
    expect(earnsL2(KEY, clean({ firstApprovalDaysAgo: PROMOTION_EVIDENCE.days - 1 })).ok).toBe(false);
  });

  it("EVERY REFUSAL IS A SENTENCE HE COULD READ, and never mentions a level", () => {
    for (const broken of [
      clean({ modifications: 1 }),
      clean({ rejections: 1 }),
      clean({ ignored: 2 }),
      clean({ approvalsAsRequested: 1 }),
      clean({ firstApprovalDaysAgo: 2 }),
      clean({ worsened: 1 }),
      clean({ measuredOutcomes: 0 }),
    ]) {
      const why = String(earnsL2(KEY, broken).why);
      expect(why.length).toBeGreaterThan(25);
      expect(why, why).not.toMatch(/L[012]|action_levels|pending_approvals/);
    }
  });
});

describe("2. NO AMOUNT OF EVIDENCE PROMOTES WHAT CAN NEVER RUN ALONE", () => {
  it("AN ACTION THAT SPENDS IS REFUSED, AND FOR THE SPECIFIC REASON", () => {
    // Eligibility before evidence, so the reason is the most specific
    // true one: "it spends money" rather than "not enough approvals".
    const out = earnsL2("activate_ad_campaign", clean({ approvalsAsRequested: 500, firstApprovalDaysAgo: 900 }));
    expect(out.ok).toBe(false);
    expect(String(out.why)).toMatch(/money is always a human decision/);
  });

  it("AND SO IS ONE NOBODY HAS EARNED, AND ONE NOBODY HAS CLASSIFIED", () => {
    expect(earnsL2("update_post", clean()).ok).toBe(false);
    expect(String(earnsL2("update_post", clean()).why)).toMatch(/may ever run unattended/);
    expect(earnsL2("something_nobody_wrote_down", clean()).ok).toBe(false);
    expect(String(earnsL2("something_nobody_wrote_down", clean()).why)).toMatch(/no one has classified/);
  });

  it("and the action that switches on an unattended automation is refused too", () => {
    // S7/P4 pinned it: an action whose effect is to start a critical
    // automation cannot be less gated than the thing it starts.
    expect(earnsL2("set_automation_toggle", clean()).ok).toBe(false);
  });
});

describe("3. READING THE EVIDENCE OUT OF THE ROWS", () => {
  /** The three tables this reads, in the shapes it reads them. */
  function db(opts: {
    approvals?: any[];
    demotionAt?: string | null;
    decisions?: any[];
    outcomes?: any[];
    errorOn?: "approvals" | "demotions" | "decisions" | "outcomes";
  }) {
    const seen: Record<string, any> = {};
    const client = {
      from(table: string) {
        const chain: any = {
          _filters: {} as Record<string, any>,
          select: () => chain,
          eq(col: string, value: any) {
            chain._filters[col] = value;
            return chain;
          },
          gte(col: string, value: any) {
            chain._filters[`gte:${col}`] = value;
            seen.gte = value;
            return chain;
          },
          in(col: string, values: any[]) {
            // WHICH DECISIONS WERE ASKED FOR. A mutation that dropped
            // the "is this decision about MY approvals" filter survived
            // because this was a no-op: every call got the same
            // outcomes back, so the filter's effect was invisible. The
            // outcomes are keyed by decision now.
            chain._filters[`in:${col}`] = values;
            return chain;
          },
          order: () => chain,
          limit: () => chain._resolve(),
          _resolve() {
            if (table === "decisions" && chain._filters.kind === "automation_switched") {
              if (opts.errorOn === "demotions") return Promise.resolve({ data: null, error: { message: "boom" } });
              return Promise.resolve({ data: opts.demotionAt ? [{ created_at: opts.demotionAt }] : [], error: null });
            }
            if (table === "decisions") {
              if (opts.errorOn === "decisions") return Promise.resolve({ data: null, error: { message: "boom" } });
              return Promise.resolve({ data: opts.decisions ?? [], error: null });
            }
            if (table === "outcomes") {
              if (opts.errorOn === "outcomes") return Promise.resolve({ data: null, error: { message: "boom" } });
              const asked: string[] = chain._filters["in:decision_id"] ?? [];
              const mine = (opts.outcomes ?? []).filter((o: any) => asked.includes(String(o.decision_id)));
              return Promise.resolve({ data: mine, error: null });
            }
            if (opts.errorOn === "approvals") return Promise.resolve({ data: null, error: { message: "boom" } });
            return Promise.resolve({ data: opts.approvals ?? [], error: null });
          },
          then: (resolve: any) => chain._resolve().then(resolve),
        };
        return chain;
      },
    };
    return { client, seen };
  }

  const approved = (id: string, daysAgo: number, over: any = {}) => ({
    id,
    status: "approved",
    modified_details: null,
    created_at: new Date(Date.parse(`${TODAY}T00:00:00Z`) - daysAgo * 86_400_000).toISOString(),
    ...over,
  });

  it("COUNTS AS-REQUESTED APPROVALS APART FROM MODIFIED ONES", async () => {
    const d = db({
      approvals: [
        approved("a1", 40),
        approved("a2", 20),
        approved("a3", 10, { modified_details: { new_budget: 3000 } }),
        { id: "a4", status: "rejected", modified_details: null, created_at: approved("x", 5).created_at },
      ],
    });
    const e = await gatherEvidence(d.client, "d1", KEY, TODAY);
    expect(e).toBeTruthy();
    expect(e!.approvalsAsRequested).toBe(2);
    expect(e!.modifications).toBe(1);
    expect(e!.rejections).toBe(1);
    // THE OLDEST AS-REQUESTED ONE, not the newest: "how long has this
    // been going on" is the question.
    expect(e!.firstApprovalDaysAgo).toBe(40);
  });

  it("A CARD STILL WAITING PAST A WEEK IS IGNORED, AND ONE FROM THIS MORNING IS NOT", async () => {
    // A card from today is not a card he is refusing to look at.
    const d = db({
      approvals: [
        { id: "p1", status: "pending", modified_details: null, created_at: approved("x", IGNORED_AFTER_DAYS + 1).created_at },
        { id: "p2", status: "pending", modified_details: null, created_at: approved("x", 0).created_at },
      ],
    });
    const e = await gatherEvidence(d.client, "d1", KEY, TODAY);
    expect(e!.ignored).toBe(1);
  });

  it("EVIDENCE FROM BEFORE A DEMOTION DOES NOT COUNT", async () => {
    // §9's rule: the counter restarts. Without this, an action taken
    // away for a real escape is re-promoted the same week on the
    // approvals that preceded it.
    const d = db({ demotionAt: "2026-10-20T00:00:00.000Z", approvals: [approved("a1", 3)] });
    await gatherEvidence(d.client, "d1", KEY, TODAY);
    expect(d.seen.gte, "the approval history was not bounded by the last demotion").toBe("2026-10-20T00:00:00.000Z");
  });

  it("AND WITH NO DEMOTION ON RECORD, THE WHOLE HISTORY COUNTS", async () => {
    const d = db({ demotionAt: null, approvals: [approved("a1", 3)] });
    await gatherEvidence(d.client, "d1", KEY, TODAY);
    expect(d.seen.gte).toBeUndefined();
  });

  it("COUNTS OUTCOMES BY VERDICT, THROUGH THE DECISIONS THAT POINT AT THESE APPROVALS", async () => {
    const d = db({
      approvals: [approved("a1", 40)],
      decisions: [
        { id: "dec1", why: [{ kind: "approval", id: "a1" }] },
        { id: "dec2", why: [{ kind: "approval", id: "somebody-elses" }] },
      ],
      outcomes: [
        { decision_id: "dec1", verdict: "improved" },
        { decision_id: "dec1", verdict: "unchanged" },
        { decision_id: "dec1", verdict: "worsened" },
        { decision_id: "dec1", verdict: "not_measurable" },
        // SOMEBODY ELSE'S. dec2 points at an approval that is not in
        // this action's history, so its outcome must not be counted —
        // and with the mock returning everything regardless, a mutation
        // dropping that filter survived.
        { decision_id: "dec2", verdict: "improved" },
      ],
    });
    const e = await gatherEvidence(d.client, "d1", KEY, TODAY);
    expect(e!.measuredOutcomes).toBe(2);
    expect(e!.worsened).toBe(1);
    expect(e!.notMeasurable).toBe(1);
  });

  it("AN UNREADABLE ROW IS null, NOT A ZEROED OBJECT", async () => {
    // Zeroes read as "not enough evidence", which is the safe direction
    // for promotion — but saying "I read the rows and there were none"
    // when nothing could be read is the instrument telling a false
    // story, and this project has paid for that more than once.
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const errorOn of ["approvals", "demotions", "decisions", "outcomes"] as const) {
      const d = db({
        approvals: [approved("a1", 40)],
        decisions: [{ id: "dec1", why: [{ kind: "approval", id: "a1" }] }],
        errorOn,
      });
      expect(await gatherEvidence(d.client, "d1", KEY, TODAY), errorOn).toBeNull();
    }
  });
});

describe("4. THE CARD: ASKED ONCE, WITH THE NUMBERS ON IT", () => {
  it("THE SENTENCE CARRIES HIS OWN COUNTS AND NEVER SAYS L2", () => {
    const line = confirmFor(KEY, clean({ approvalsAsRequested: 14, firstApprovalDaysAgo: 46, measuredOutcomes: 2 }));
    expect(line).toContain("14 times");
    expect(line).toContain("46 days");
    expect(line).toContain("2 times");
    expect(line).toMatch(/search title and description/);
    // It asks, rather than announcing.
    expect(line).toMatch(/Shall I/);
    // AND IT PROMISES THE TWO THINGS THAT MAKE THE ANSWER SAFE: he will
    // be told each time, and it stops by itself if anything published
    // does not match his records (S7/P3).
    expect(line).toMatch(/tell you every time/);
    expect(line).toMatch(/stop and ask again/);
    expect(line).not.toMatch(/L[012]|action_levels|unattended/);
  });

  it("and one measured result reads as one, not as 'the 1 times'", () => {
    expect(confirmFor(KEY, clean({ measuredOutcomes: 1 }))).toMatch(/the one time I could measure/);
    expect(confirmFor(KEY, clean({ measuredOutcomes: 1 }))).not.toMatch(/the 1 times/);
  });

  it("NOTHING HERE WRITES A LEVEL — the owner's click does", () => {
    // The founder's decision 2, as a property of the file. A promotion
    // that wrote action_levels itself would be the product widening its
    // own permissions because a counter moved.
    const src = code("src/lib/autonomy/promotion.ts");
    expect(src).not.toMatch(/from\("action_levels"\)[\s\S]{0,40}\.(insert|update|upsert)/);
    expect(src).toMatch(/requestApproval/);
    expect(src).toMatch(/grant_autonomy/);
  });

  it("AND THE EVIDENCE GOES ON THE ROW, so the card cannot show numbers it did not store", () => {
    // sitePublishGuard's invariant: a card that shows words it did not
    // store leaves "who approved this and what did it say" answerable
    // only from a client string.
    const src = code("src/lib/autonomy/promotion.ts");
    const call = src.slice(src.indexOf("requestApproval(supabase"));
    expect(call).toMatch(/details: \{ action_key: actionKey, evidence \}/);
    expect(call).toMatch(/confirm: confirmFor\(actionKey, evidence\)/);
  });
});

describe("5. IT DOES NOT ASK TWICE, AND DOES NOT ASK FOR THE IMPOSSIBLE", () => {
  function proposeDb(opts: { pendingCards?: any[]; storedLevel?: string | null; evidence?: any[] } = {}) {
    const inserted: any[] = [];
    const client = {
      from(table: string) {
        const chain: any = {
          _filters: {} as Record<string, any>,
          _insert: null as any,
          select: () => chain,
          eq(c: string, v: any) {
            chain._filters[c] = v;
            return chain;
          },
          gte: () => chain,
          in: () => chain,
          order: () => chain,
          insert(values: any) {
            chain._insert = values;
            return chain;
          },
          single: () => {
            inserted.push(chain._insert);
            return Promise.resolve({ data: { id: "approval-new" }, error: null });
          },
          maybeSingle: () =>
            Promise.resolve({
              data: table === "action_levels" && opts.storedLevel ? { level: opts.storedLevel } : null,
              error: null,
            }),
          limit: () => chain._resolve(),
          _resolve() {
            // THE DEMOTION READ AND THE OUTCOME READ BOTH HIT
            // `decisions`, and they are told apart by `kind` — as the
            // code tells them apart. My first fixture returned [] for
            // both, so the evidence came back with no measured outcome
            // and `earnsL2` refused BEFORE the already-asked check
            // these two tests are about. The tests passed on the wrong
            // refusal.
            if (table === "decisions" && chain._filters.kind === "automation_switched") {
              return Promise.resolve({ data: [], error: null });
            }
            if (table === "decisions") {
              return Promise.resolve({ data: (opts.evidence ?? []).map((a: any) => ({ id: `dec-${a.id}`, why: [{ kind: "approval", id: a.id }] })), error: null });
            }
            if (table === "outcomes") return Promise.resolve({ data: [{ verdict: "improved" }], error: null });
            if (table === "pending_approvals" && chain._filters.action_type === "grant_autonomy") {
              return Promise.resolve({ data: opts.pendingCards ?? [], error: null });
            }
            return Promise.resolve({ data: opts.evidence ?? [], error: null });
          },
          then: (resolve: any) => chain._resolve().then(resolve),
        };
        return chain;
      },
    };
    return { client, inserted };
  }

  const enough = Array.from({ length: 10 }, (_, i) => ({
    id: `a${i}`,
    status: "approved",
    modified_details: null,
    created_at: new Date(Date.parse(`${TODAY}T00:00:00Z`) - (40 + i) * 86_400_000).toISOString(),
  }));

  it("REFUSES AN ACTION WHOSE PLATFORM CANNOT PUT IT BACK", async () => {
    // ISOLATED BY TAKING THE undo AWAY, and the first version was not.
    // It used `update_product_name`, which is also not allowlisted — so
    // the refusal came from the EVIDENCE rule and the undo check was
    // never reached. A mutation deleting that check survived.
    //
    // The only allowlisted action is update_page_meta and its platform
    // DOES implement undo, so the only way to exercise this is to make
    // the registry say otherwise.
    vi.spyOn(console, "error").mockImplementation(() => {});
    noUndo = true;
    const d = proposeDb({ evidence: enough });
    const out = await proposePromotion(d.client, "d1", KEY, TODAY);
    expect(out.proposed).toBe(false);
    expect(String((out as any).why)).toMatch(/nothing can put this back/);
    expect(d.inserted.filter((i) => i?.action_type === "grant_autonomy")).toEqual([]);
  });

  it("and an action nobody earned is refused by the evidence rule, which is a different reason", async () => {
    // Kept as its own case, because the two refusals are told apart in
    // the sentence the owner would read.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = proposeDb({ evidence: enough });
    const out = await proposePromotion(d.client, "d1", "update_product_name", TODAY);
    expect(out.proposed).toBe(false);
    expect(d.inserted.filter((i) => i?.action_type === "grant_autonomy")).toEqual([]);
  });

  it("AND DOES NOT ASK AGAIN WHILE THE QUESTION IS STILL WAITING", async () => {
    const d = proposeDb({ pendingCards: [{ id: "already" }], evidence: enough });
    const out = await proposePromotion(d.client, "d1", KEY, TODAY);
    expect(out.proposed).toBe(false);
    expect(String((out as any).why)).toMatch(/already have this question waiting/);
    expect(d.inserted).toEqual([]);
  });

  it("AND DOES NOT ASK FOR SOMETHING ALREADY GRANTED", async () => {
    const d = proposeDb({ storedLevel: "L2", evidence: enough });
    const out = await proposePromotion(d.client, "d1", KEY, TODAY);
    expect(out.proposed).toBe(false);
    expect(String((out as any).why)).toMatch(/already runs on its own/);
    expect(d.inserted).toEqual([]);
  });

  it("AND WITH THE EVIDENCE IN PLACE IT ASKS, ONCE, WITH THE NUMBERS ON THE ROW", async () => {
    // THE POSITIVE CASE, and the one the whole phase is for. Without it
    // every assertion here is about refusals, and a function that
    // always refused would pass all of them.
    const d = proposeDb({ evidence: enough });
    const out = await proposePromotion(d.client, "d1", KEY, TODAY);
    expect(out.proposed, String((out as any).why)).toBe(true);

    const row = d.inserted.find((i) => i?.action_type === "grant_autonomy");
    expect(row, "no card was raised").toBeTruthy();
    expect(row.dealership_id).toBe("d1");
    expect(row.requested_by_agent).toBe("system:autonomy");
    expect(row.action_details.action_key).toBe(KEY);
    // THE EVIDENCE IS ON THE ROW, not only in the sentence — so "what
    // did this card claim" is answerable from the record.
    expect(row.action_details.evidence.approvalsAsRequested).toBe(10);
    expect(String(row.action_details.confirm)).toContain("10 times");
    // AND NO LEVEL WAS WRITTEN. The card is the question.
    expect(d.inserted.filter((i) => i?.level)).toEqual([]);
  });

  it("and with no evidence it says why rather than asking", async () => {
    const d = proposeDb({ evidence: [] });
    const out = await proposePromotion(d.client, "d1", KEY, TODAY);
    expect(out.proposed).toBe(false);
    expect(String((out as any).why)).toMatch(/not approved this often enough/);
    expect(d.inserted).toEqual([]);
  });
});

describe("6. the undo question is asked of the registry", () => {
  it("TRUE ONLY FOR A PLATFORM THAT CLAIMS THE KEY AND IMPLEMENTS undo", async () => {
    // hawlaiSite is the only platform implementing undo(), and it is
    // the one that claims update_page_meta — which is exactly why that
    // key is the first and only allowlisted one.
    expect(await undoExistsFor({}, KEY)).toBe(true);
    // A key no platform claims cannot be put back by anything.
    expect(await undoExistsFor({}, "send_email")).toBe(false);
    expect(await undoExistsFor({}, "something_nobody_wrote_down")).toBe(false);
  });

  it("AND A PLATFORM THAT CLAIMS THE KEY WITHOUT AN undo READS AS false", async () => {
    // update_product_price is claimed by shopify and hawlai_shop,
    // neither of which implements undo(). The answer must be false
    // rather than "some platform somewhere can".
    expect(await undoExistsFor({}, "update_product_price")).toBe(false);
  });
});
