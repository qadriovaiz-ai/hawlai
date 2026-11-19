// The ad account is a fourth level, and it decides what "Active" means
// — 19 November 2026.
//
// THE DEFECT, AND IT RAN FOR SEVENTY DAYS. A campaign launched on
// 10 September read **Active** in Hawlai and in Ads Manager, at the
// campaign, the ad set and the ad, with zero impressions and zero spend
// the whole time. Nobody was told. Meta's own words were "ad set
// delivering zero impressions due to non-delivery". The ad account had
// no payment method on it.
//
// `readCampaignState` read three levels and stopped. The account sits
// above all three, and `isAccountUsable` — which already had a sentence
// for every status code Meta documents — was called before a LAUNCH,
// which spends nothing because everything is created paused, and never
// on the read that decides what the owner is told. The check was on the
// harmless door and missing from the one that matters.
//
// SO THERE ARE NOW TWO QUESTIONS, not one. `running` is "are the three
// toggles on", which is what "is it already started" means. `delivering`
// is "and can the account actually pay", which is the only one allowed
// to be shown as Active. Conflating them is what let this go unnoticed.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readCampaignState, type AccountHealth } from "@/lib/ads/campaignStatus";
import { describeDelivery } from "@/lib/ads/campaignDelivery";
import { isAccountUsable } from "@/lib/ads/adAccountLimits";
import { code } from "./helpers/source";

const C = "c1", S = "s1", A = "a1";
const OBJECTS = { campaignId: C, adsetId: S, adId: A };
const TOKEN = "T";

const HEALTHY: AccountHealth = { usable: true, reason: "Active." };
const UNSETTLED = isAccountUsable(3);

/** Meta answering ACTIVE at all three levels, every time. */
function allActive() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
    const u = String(url);
    const id = u.includes(C) ? C : u.includes(S) ? S : A;
    const body: Record<string, any> = { id, status: "ACTIVE", effective_status: "ACTIVE" };
    if (id === A) { body.campaign_id = C; body.adset_id = S; }
    return { ok: true, status: 200, json: async () => body } as any;
  });
}

beforeEach(() => { allActive(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("1. EVERY STATUS CODE META DOCUMENTS HAS AN ANSWER", () => {
  // One fixture per code, because "account_status 202" is not something
  // anyone can act on and a generic refusal is not a diagnosis.
  it("1 is usable", () => {
    expect(isAccountUsable(1).usable).toBe(true);
  });

  it("2 (DISABLED) AND 3 (UNSETTLED) ARE NOT, and each says which", () => {
    expect(isAccountUsable(2).usable).toBe(false);
    expect(isAccountUsable(2).reason).toMatch(/disabled/i);
    expect(isAccountUsable(3).usable).toBe(false);
    expect(isAccountUsable(3).reason).toMatch(/unsettled balance/i);
    // Two different problems must not produce one sentence.
    expect(isAccountUsable(2).reason).not.toBe(isAccountUsable(3).reason);
  });

  it("A CODE META HAS NOT DOCUMENTED IS NOT USABLE", () => {
    // The dangerous default is the other one: an unknown code treated as
    // fine is how a new Meta state becomes a silent "Active".
    expect(isAccountUsable(202).usable).toBe(false);
    expect(isAccountUsable(999).usable).toBe(false);
  });

  it("NEVER CHECKED IS NOT BROKEN", () => {
    // Refusing because we have not asked yet would turn a missing cache
    // row into a dead product. Only ever subtractive.
    expect(isAccountUsable(null).usable).toBe(true);
    expect(isAccountUsable(undefined).usable).toBe(true);
  });
});

describe("2. THREE LEVELS ACTIVE IS NOT DELIVERING", () => {
  it("THE LOAD-BEARING ONE: all three ACTIVE on an unsettled account is NOT 'Active'", async () => {
    // THE SEVENTY DAYS, IN ONE ASSERTION. Everything Meta's hierarchy
    // can report is green; the account cannot pay; the owner must not
    // read the word Active.
    const state = await readCampaignState(OBJECTS, TOKEN, UNSETTLED);
    expect(state.ok).toBe(true);
    expect(describeDelivery(state).state).not.toBe("active");
    expect(describeDelivery(state).label).not.toBe("Active");
  });

  it("AND THE ACCOUNT IS WHAT IT SAYS, not the effective status", async () => {
    // Without the account branch this falls through to
    // explainEffective("ACTIVE") — "Meta reports it as ACTIVE" — offered
    // as the explanation for why it is not delivering. True, useless,
    // and leaves the owner with nothing to do.
    const delivery = describeDelivery(await readCampaignState(OBJECTS, TOKEN, UNSETTLED));
    expect(delivery.detail).toBe(UNSETTLED.reason);
    expect(delivery.detail).toMatch(/unsettled balance/i);
    expect(delivery.detail).not.toMatch(/reports it as/i);
  });

  it("RUNNING AND DELIVERING ARE DIFFERENT, and both are true facts", async () => {
    // `running` stays "the three toggles are on" — that is what "is it
    // already started" asks, and a campaign on a dead account IS still
    // switched on. Only `delivering` may become a label.
    const state = await readCampaignState(OBJECTS, TOKEN, UNSETTLED);
    expect(state.ok && state.running).toBe(true);
    expect(state.ok && state.delivering).toBe(false);
  });

  it("a healthy account with all three on IS Active", async () => {
    const state = await readCampaignState(OBJECTS, TOKEN, HEALTHY);
    expect(state.ok && state.delivering).toBe(true);
    expect(describeDelivery(state).state).toBe("active");
  });

  it("AN UNCHECKED ACCOUNT STILL READS ACTIVE — no false alarm", async () => {
    // Passing null is "I did not look", and it must not invent a
    // problem. The same rule isAccountUsable applies to a null status.
    const state = await readCampaignState(OBJECTS, TOKEN, null);
    expect(state.ok && state.delivering).toBe(true);
    expect(describeDelivery(state).state).toBe("active");
  });

  it("the account is carried on the state, so callers can say why", async () => {
    const state = await readCampaignState(OBJECTS, TOKEN, UNSETTLED);
    expect(state.ok && state.account).toEqual(UNSETTLED);
  });
});

describe("3. A DEAD ACCOUNT NEVER BLOCKS SWITCHING OFF", () => {
  it("PAUSING ASKS FOR NO ACCOUNT AT ALL", () => {
    // The safe direction must not be the slow one. A dead account is a
    // reason to pause, never a reason to refuse to — and putting a Graph
    // read in front of stopping spend adds a way for it to fail.
    const src = code("src/lib/agents/masterBrainV2.ts");
    const at = src.indexOf('status: "PAUSED",');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 200)).toMatch(/account: null/);
  });

  it("AND THE DASHBOARD ROUTE ONLY READS IT WHEN STARTING", () => {
    // The route declares `account` as null and fills it only inside the
    // ACTIVE branch, so the pause path reaches setCampaignStatus with
    // null and never touches the Graph. (Commit 2 moved this from an
    // inline ternary on the call to a hoisted variable, because the
    // activation gate needs the same reading — the behaviour is pinned
    // here and in activateChecksAccount.test.ts, which checks the
    // ordering against the authority gate.)
    const src = code("src/app/api/ads/[id]/status/route.ts");
    expect(src).toMatch(/let account: Awaited<ReturnType<typeof accountHealthFor>> \| null = null;/);

    const read = src.indexOf("accountHealthFor(supabase, dealershipId");
    const branch = src.indexOf('if (status === "ACTIVE") {');
    expect(branch).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(branch);
    // Exactly one read in the whole route — the pause path has none.
    expect(src.match(/accountHealthFor\(/g) ?? []).toHaveLength(1);
  });
});

describe("4. THE ACCOUNT IS READ ONCE, AND REFRESHED", () => {
  it("THE STATUS ROUTE READS IT OUTSIDE THE PER-CAMPAIGN LOOP", () => {
    // Fifty campaigns share one account. Inside the worker this would be
    // fifty identical Graph reads on a page that already waits on Meta.
    const src = code("src/app/api/ads/campaign-status/route.ts");
    const read = src.indexOf("const account = await accountHealthFor(");
    const worker = src.indexOf("async function worker()");
    expect(read).toBeGreaterThan(-1);
    expect(worker).toBeGreaterThan(-1);
    expect(read).toBeLessThan(worker);
  });

  it("IT GOES THROUGH getAdAccountLimits, so a stale reading is refreshed", () => {
    // Reading the cached column directly is the version of this bug that
    // hides for another seventy days: the reading is kept for seven
    // days, and a payment method removed last week would still read
    // healthy.
    const src = code("src/lib/ads/adAccountLimits.ts");
    const at = src.indexOf("export async function accountHealthFor");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, at + 400);
    expect(fn).toMatch(/await getAdAccountLimits\(/);
    expect(fn).toMatch(/return isAccountUsable\(limits\.accountStatus\)/);
  });

  it("AND NOTHING READS fb_account_status STRAIGHT OFF THE ROW ANY MORE", () => {
    // Three call sites in the publish path did. Each was whatever was
    // last written to the column, never refreshed.
    expect(code("src/lib/publish/platforms/meta.ts")).not.toMatch(/isAccountUsable\(row\.fb_account_status\)/);
  });
});

describe("5. AN EMPTY ANSWER NEVER OVERWRITES A REAL ONE", () => {
  // Found 19 November 2026, while wiring the above. getAdAccountLimits
  // PERSISTS whatever it fetches, so a 200 carrying none of the three
  // fields used to overwrite a good cached reading with three nulls and
  // stamp it with a fresh checkedAt — current-looking for another seven
  // days. A null account_status reads as "never checked", and never
  // checked reads as usable. The failure mode was exactly the one this
  // change exists to end.
  //
  // Commit 1 is what makes this likely: the refresh now runs on every
  // Analytics page load rather than only at launch.

  it("THE LOAD-BEARING ONE: a 200 with no limits in it is not ok", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "act_1" }),
    } as any);
    const { fetchAdAccountLimits } = await import("@/lib/ads/adAccountLimits");
    const r = await fetchAdAccountLimits("act_1", "T");
    expect(r.ok).toBe(false);
  });

  it("A SINGLE FIELD IS STILL AN ANSWER", async () => {
    // The guard must be "none of them", not "any of them missing" —
    // Meta can legitimately omit min_daily_budget while reporting the
    // status, and refusing that would throw away the field that matters
    // most here.
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ account_status: 3 }),
    } as any);
    const { fetchAdAccountLimits } = await import("@/lib/ads/adAccountLimits");
    const r = await fetchAdAccountLimits("act_1", "T");
    expect(r.ok).toBe(true);
    expect(r.ok && r.limits.accountStatus).toBe(3);
  });

  it("and a normal answer is unaffected", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ min_daily_budget: 5000, currency: "INR", account_status: 1 }),
    } as any);
    const { fetchAdAccountLimits } = await import("@/lib/ads/adAccountLimits");
    const r = await fetchAdAccountLimits("act_1", "T");
    expect(r.ok && r.limits).toMatchObject({ minDailyBudget: 5000, currency: "INR", accountStatus: 1 });
  });
});
