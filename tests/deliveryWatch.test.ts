// Active, and reaching nobody — 19 November 2026.
//
// A campaign launched on 10 September read Active in Hawlai and in Ads
// Manager, at all three levels, with zero impressions and zero spend,
// for about seventy days. Nobody was told.
//
// The sentence already existed: `notDeliveringNote` says exactly this
// and names that campaign in its comment. But it is a DISPLAY function
// in a client component — it fires when somebody opens Analytics and
// looks at the row. Nobody opened it.
//
// And nothing in the daily run could have caught it. `budget_alerts`
// compares spend against the daily budget, so a campaign spending zero
// is comfortably under budget: the one state that means broken was
// indistinguishable from the thriftiest campaign on the account.
//
// SUCCESS IS THE FIRST IMPRESSION, NOT THE LAUNCH. "Launched" is a
// thing Hawlai did; an impression is a thing that happened to a
// customer.

import { describe, it, expect } from "vitest";
import {
  assessSilence,
  diagnose,
  couldNotDiagnose,
  silenceAlert,
  describeHours,
  SILENT_HOURS,
  type Snapshot,
} from "@/lib/ads/deliveryWatch";
import { GROUPS, ALL } from "@/lib/automation/cronGroups";
import { code } from "./helpers/source";

const NOW = new Date("2026-11-19T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  snapshot_date: day(0),
  impressions: 0,
  spend: 0,
  delivery_status: "active",
  ...over,
});

describe("1. WHEN IT SPEAKS, AND WHEN IT STAYS QUIET", () => {
  it("THE LOAD-BEARING ONE: active for days with zero impressions is worth saying", () => {
    const s = assessSilence([snap({ snapshot_date: day(5) }), snap({ snapshot_date: day(0) })], NOW);
    expect(s.silent).toBe(true);
    expect(s.silent && s.hours).toBeGreaterThanOrEqual(SILENT_HOURS);
    expect(s.silent && s.activeSince).toBe(day(5));
  });

  it("UNDER THE FLOOR IT SAYS NOTHING — an alarm at 45 minutes is one nobody reads", () => {
    // Meta routinely takes hours to start a new ad set, and longer
    // after a billing change. The founder's campaign at 3:11pm, 45
    // minutes in, must not alert — and it does not.
    const s = assessSilence([snap({ snapshot_date: day(0) })], NOW);
    expect(s).toEqual({ silent: false, why: "too_soon" });
  });

  it("EXACTLY AT THE FLOOR IT DOES SPEAK", () => {
    const s = assessSilence([snap({ snapshot_date: day(1) })], NOW);
    expect(s.silent).toBe(true);
  });

  it("ONE IMPRESSION IS ENOUGH TO BE QUIET FOREVER", () => {
    // The thing being detected is "has never reached anybody". Once it
    // has, this is somebody else's alert.
    const s = assessSilence([snap({ snapshot_date: day(10) }), snap({ snapshot_date: day(0), impressions: 1 })], NOW);
    expect(s).toEqual({ silent: false, why: "delivering" });
  });

  it("A CAMPAIGN META NEVER CALLED ACTIVE IS NOT THIS ALERT", () => {
    // Paused, in review, not on Meta — all already visible on the
    // Status column, and none of them is a silent failure.
    const s = assessSilence([snap({ snapshot_date: day(5), delivery_status: "paused" })], NOW);
    expect(s).toEqual({ silent: false, why: "never_active" });
  });
});

describe("2. AN UNREADABLE NUMBER IS NOT ZERO", () => {
  it("THE LOAD-BEARING ONE: null impressions never raise an alarm", () => {
    // snapshotCampaignPerformance writes NULL when Meta's insights
    // could not be read. "We could not count" is not "nobody saw it",
    // and alarming on it would fire for every business the morning
    // Meta's API is slow.
    const s = assessSilence([snap({ snapshot_date: day(5), impressions: null })], NOW);
    expect(s).toEqual({ silent: false, why: "unknown" });
  });

  it("AND A READABLE ZERO AMONG UNREADABLE DAYS STILL COUNTS", () => {
    // The latest READABLE figure is the answer — Meta's insights are
    // lifetime totals, so one good reading is the whole story.
    const s = assessSilence(
      [snap({ snapshot_date: day(5), impressions: 0 }), snap({ snapshot_date: day(0), impressions: null })],
      NOW
    );
    expect(s.silent).toBe(true);
  });

  it("no snapshots at all is unknown, not silent", () => {
    expect(assessSilence([], NOW)).toEqual({ silent: false, why: "never_active" });
  });
});

describe("3. ONE CAUSE, THE FIRST ONE, IN THE FOUNDER'S ORDER", () => {
  const healthy = { usable: true, reason: "Active." };
  const connected = { pageId: "P1", token: "T" };
  const live = { ok: true as const, levels: [{ level: "ad" as const, id: "a", status: "ACTIVE", effective: "ACTIVE" }], ad: { level: "ad" as const, id: "a", status: "ACTIVE", effective: "ACTIVE" }, running: true, account: healthy, delivering: true };

  it("1. THE ACCOUNT COMES FIRST — the seventy days' own answer", () => {
    const c = diagnose({
      account: { usable: false, reason: "This ad account has no payment method attached." },
      connection: connected,
      state: live,
      now: NOW,
    });
    expect(c?.key).toBe("account");
    expect(c?.message).toMatch(/payment method/);
  });

  it("2. THEN THE CONNECTION, and a revoked one looks like nothing", () => {
    const c = diagnose({ account: healthy, connection: { pageId: "P1", token: null }, state: live, now: NOW });
    expect(c?.key).toBe("connection");
  });

  it("3. THEN WHAT META SAYS ABOUT THE THREE LEVELS", () => {
    const paused = {
      ...live,
      levels: [
        { level: "campaign" as const, id: "c", status: "PAUSED", effective: "PAUSED" },
        { level: "ad" as const, id: "a", status: "ACTIVE", effective: "CAMPAIGN_PAUSED" },
      ],
    };
    const c = diagnose({ account: healthy, connection: connected, state: paused as any, now: NOW });
    expect(c?.key).toBe("level_campaign");
    expect(c?.message).toMatch(/campaign/);
  });

  it("4. THEN THE SCHEDULE — and a future start is NOT a fault", () => {
    // Telling someone their ad is broken when they scheduled it for
    // next week is its own failure.
    const c = diagnose({
      account: healthy,
      connection: connected,
      state: live,
      scheduledStart: new Date(NOW.getTime() + 7 * 86_400_000).toISOString(),
      now: NOW,
    });
    expect(c?.key).toBe("scheduled");
    expect(c?.message).toMatch(/Nothing is wrong/);
  });

  it("a start date already passed is not a cause", () => {
    const c = diagnose({
      account: healthy,
      connection: connected,
      state: live,
      scheduledStart: new Date(NOW.getTime() - 86_400_000).toISOString(),
      now: NOW,
    });
    expect(c).toBeNull();
  });

  it("5. THEN THE BUDGET, against the account's OWN floor", () => {
    const c = diagnose({
      account: healthy,
      connection: connected,
      state: live,
      budget: { minor: 1000, minimumMinor: 4000, currency: "INR" },
      now: NOW,
    });
    expect(c?.key).toBe("budget_below_minimum");
    expect(c?.message).toMatch(/₹10/);
    expect(c?.message).toMatch(/₹40/);
  });

  it("a budget at or above the floor is not a cause", () => {
    expect(
      diagnose({ account: healthy, connection: connected, state: live, budget: { minor: 4000, minimumMinor: 4000, currency: "INR" }, now: NOW })
    ).toBeNull();
  });

  it("THE LOAD-BEARING ONE: IT STOPS AT THE FIRST, and reports nothing beyond it", () => {
    // Four things wrong at once. The owner gets ONE thing to fix, and
    // it is the one furthest up the chain of blame — fixing the budget
    // on a dead account achieves nothing.
    const c = diagnose({
      account: { usable: false, reason: "This ad account has an unsettled balance." },
      connection: { pageId: null, token: null },
      state: { ok: true, levels: [{ level: "ad", id: "a", status: "PAUSED", effective: "PAUSED" }], ad: { level: "ad", id: "a", status: "PAUSED", effective: "PAUSED" }, running: false, account: null, delivering: false } as any,
      budget: { minor: 1, minimumMinor: 4000, currency: "INR" },
      now: NOW,
    });
    expect(c?.key).toBe("account");
  });
});

describe("4. WHEN IT CANNOT FIND THE CAUSE IT SAYS SO", () => {
  it("NOTHING EXPLAINS IT means null, not a guess", () => {
    expect(
      diagnose({ account: { usable: true, reason: "Active." }, connection: { pageId: "P1", token: "T" }, state: null, now: NOW })
    ).toBeNull();
  });

  it("THE LOAD-BEARING ONE: the fallback reports the FACT and points at Ads Manager", () => {
    // Steps 6-8 — audience size, learning stage, creative — are not
    // built. "It is probably your audience" would send the owner to fix
    // something that may be perfectly fine. The missing thing for
    // seventy days was the fact, not the diagnosis.
    const c = couldNotDiagnose(72);
    expect(c.key).toBe("unknown");
    expect(c.message).toMatch(/shown nobody anything for 3 days/);
    expect(c.message).toMatch(/none of them explains it/);
    expect(c.message).toMatch(/Ads Manager/);
    // And it says what Active actually means, which is the heart of it.
    expect(c.message).toMatch(/means you haven't paused it, not that it's running/);
  });

  it("hours read as days once past two of them", () => {
    expect(describeHours(25)).toBe("25 hours");
    expect(describeHours(72)).toBe("3 days");
  });
});

describe("5. THE ALERT ITSELF", () => {
  const silence = { silent: true as const, hours: 72, activeSince: "2026-09-10" };

  it("THE CAUSE LEADS — a title that buries it is the Status column again", () => {
    const a = silenceAlert("Ghar ko do lavender ki shanti", silence, { key: "account", message: "No payment method." });
    expect(a.title).toMatch(/Active but reaching nobody/);
    expect(a.body.startsWith("No payment method.")).toBe(true);
    expect(a.body).toMatch(/3 days/);
  });

  it("IT FIRES ONCE PER CAUSE, NOT EVERY MORNING", () => {
    // "A product that re-asks is one the owner stops reading" — the
    // same rule the rejection cooldown states. No date in the key.
    const a = silenceAlert("x", silence, { key: "account", message: "m" });
    expect(a.dedupeKey).toBe("delivery_silent:account");
    expect(a.dedupeKey).not.toMatch(/2026/);
  });

  it("AND A DIFFERENT CAUSE IS A DIFFERENT ALERT, because that is new information", () => {
    const a = silenceAlert("x", silence, { key: "account", message: "m" });
    const b = silenceAlert("x", silence, { key: "budget_below_minimum", message: "m" });
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
  });

  it("the undiagnosed message is not padded with a second duration", () => {
    // couldNotDiagnose already says how long. Appending it again would
    // read as a stutter.
    const a = silenceAlert("x", silence, couldNotDiagnose(72));
    expect(a.body.match(/3 days/g) ?? []).toHaveLength(1);
  });
});

describe("6. IT RUNS DAILY WITHOUT A THIRD CRON ENTRY", () => {
  it("IT IS A SUBSYSTEM, and Vercel Hobby still has exactly two crons", () => {
    expect(ALL).toContain("delivery_watch");
    const vercel = JSON.parse(code("vercel.json"));
    expect(vercel.crons).toHaveLength(2);
  });

  it("IN heavy, because signals is database-only and this reads Meta", () => {
    expect(GROUPS.heavy).toContain("delivery_watch");
    expect(GROUPS.signals).not.toContain("delivery_watch");
  });

  it("AND BEFORE daily_autopilot, whose AI work is what runs out the clock", () => {
    expect(GROUPS.heavy.indexOf("delivery_watch")).toBeLessThan(GROUPS.heavy.indexOf("daily_autopilot"));
  });

  it("THE RUNNER IS WIRED, or the subsystem key is a name nothing runs", () => {
    const src = code("src/lib/automation/dailyRunners.ts");
    expect(src).toMatch(/delivery_watch: \(s, id\) => runDeliveryWatch\(s, id\)/);
  });
});

describe("7. IT COSTS NOTHING WHEN NOTHING IS WRONG", () => {
  const src = () => code("src/lib/automation/deliveryWatch.ts");

  it("THE LOAD-BEARING ONE: no silent campaign means no Graph call at all", () => {
    // The sweep runs for every business every day. Reading Meta for
    // each one would be the kind of cost that gets a feature switched
    // off. The snapshots answer it; Meta is only asked to diagnose.
    const s = src();
    const early = s.indexOf("if (silent.length === 0) return 0;");
    const token = s.indexOf("adsTokenFor(");
    const state = s.indexOf("readCampaignState(");
    expect(early).toBeGreaterThan(-1);
    expect(token).toBeGreaterThan(early);
    expect(state).toBeGreaterThan(early);
  });

  it("A FAILED HISTORY READ IS NOT AN EMPTY HISTORY", () => {
    // Treating it as one would make every campaign look like it had
    // never delivered, and alarm the owner about all of them at once.
    expect(src()).toMatch(/if \(error \|\| !Array\.isArray\(history\)\) return 0;/);
  });

  it("and the live work per business is bounded", () => {
    // A business with more silent campaigns than this has one problem,
    // not twelve.
    expect(src()).toMatch(/slice\(0, MAX_DIAGNOSED\)/);
  });
});
