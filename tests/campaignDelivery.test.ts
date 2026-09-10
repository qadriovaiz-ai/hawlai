// The Status column in Campaign Performance History.
//
// The table outlives campaigns — it "survives even if paused, deleted on
// Meta" — so it will routinely show campaigns Meta no longer has, or
// can't be reached for. The rule pinned here: a plain "Active" appears
// ONLY when Meta has just confirmed every level is delivering.
// Everything else is labelled for what it is.

import { describe, it, expect } from "vitest";
import { describeDelivery } from "@/lib/ads/campaignDelivery";
import { statusCell, DELIVERY_LABELS, type DeliveryState, type LiveDelivery } from "@/lib/ads/campaignDeliveryDisplay";
import { resolveVisibleColumns, serializeColumns, ALL_COLUMN_KEYS } from "@/lib/analytics/campaignColumns";
import type { CampaignState, LevelState } from "@/lib/ads/campaignStatus";

const lvl = (level: LevelState["level"], status: string, effective: string): LevelState => ({ level, id: level, status, effective });
const state = (campaign: [string, string], adset: [string, string], ad: [string, string]): CampaignState => {
  const levels = [lvl("campaign", ...campaign), lvl("adset", ...adset), lvl("ad", ...ad)];
  return { ok: true, levels, ad: levels[2], running: levels.every((l) => l.effective === "ACTIVE") };
};

describe("Meta's three-level state → one status", () => {
  it("all three delivering → Active", () => {
    expect(describeDelivery(state(["ACTIVE", "ACTIVE"], ["ACTIVE", "ACTIVE"], ["ACTIVE", "ACTIVE"])).state).toBe("active");
  });

  it("campaign switched off → Paused (the Ads Manager 'Off' toggle)", () => {
    expect(describeDelivery(state(["PAUSED", "PAUSED"], ["ACTIVE", "CAMPAIGN_PAUSED"], ["ACTIVE", "CAMPAIGN_PAUSED"])).state).toBe("paused");
  });

  it("switched on but in review → Not delivering, with Meta's reason in words", () => {
    const d = describeDelivery(state(["ACTIVE", "ACTIVE"], ["ACTIVE", "ACTIVE"], ["ACTIVE", "PENDING_REVIEW"]));
    expect(d.state).toBe("not_delivering");
    expect(d.detail).toMatch(/reviewing/i);
  });

  it("DELETED at any level → Deleted on Meta; ARCHIVED → Archived on Meta", () => {
    expect(describeDelivery(state(["DELETED", "DELETED"], ["ACTIVE", "CAMPAIGN_DELETED"], ["ACTIVE", "DELETED"])).state).toBe("deleted");
    expect(describeDelivery(state(["ARCHIVED", "ARCHIVED"], ["PAUSED", "PAUSED"], ["PAUSED", "ARCHIVED"])).state).toBe("archived");
  });

  it("Graph says the object doesn't exist (100/33) → Not found on Meta, not 'couldn't check'", () => {
    const gone: CampaignState = { ok: false, reason: "x", problem: "unreadable", error: { http: 400, code: 100, subcode: 33, message: "Object does not exist", userMessage: null, transient: false } };
    expect(describeDelivery(gone).state).toBe("not_found");
  });

  it("Meta unreachable → unknown, carrying Meta's own words", () => {
    const down: CampaignState = { ok: false, reason: "x", problem: "unreadable", error: { http: 500, code: 2, subcode: null, message: "An unexpected error has occurred", userMessage: null, transient: true } };
    const d = describeDelivery(down);
    expect(d.state).toBe("unknown");
    expect(d.detail).toMatch(/unexpected error/);
  });

  it("ids on file don't match Meta → says so; no ad on Meta → Not on Meta", () => {
    expect(describeDelivery({ ok: false, reason: "x", problem: "mismatch" }).state).toBe("mismatch");
    expect(describeDelivery({ ok: false, reason: "x", problem: "missing" }).state).toBe("not_on_meta");
  });
});

describe("the Status cell never shows an unconfirmed 'Active'", () => {
  const live = (s: DeliveryState, detail: string | null = null): LiveDelivery => ({ state: s, label: DELIVERY_LABELS[s], detail, checkedAt: s === "unknown" ? null : "2026-09-11T10:00:00Z" });
  const lives: (LiveDelivery | "loading" | null)[] = ["loading", null, ...(Object.keys(DELIVERY_LABELS) as DeliveryState[]).map((s) => live(s))];
  const recordeds = [null, { state: "active", date: "2026-09-09" }, { state: "paused", date: "2026-09-09" }, { state: "unknown", date: "2026-09-10" }];
  const locals = [null, "ACTIVE", "PAUSED"];

  it("across every combination, plain 'Active' in the confident style ONLY when Meta just said active", () => {
    for (const l of lives) for (const r of recordeds) for (const loc of locals) {
      const cell = statusCell(l, r, loc);
      const confirmedActive = typeof l === "object" && l !== null && l.state === "active";
      if (cell.text === "Active" || cell.tone === "good") {
        expect(confirmedActive, JSON.stringify({ l, r, loc, cell })).toBe(true);
      }
      if (!confirmedActive && /active/i.test(cell.text)) {
        expect(cell.stale || cell.text.startsWith("Checking"), JSON.stringify({ l, r, loc, cell })).toBe(true);
      }
    }
  });

  it("Meta unreachable → the last RECORDED status, with its date, marked as not confirmed", () => {
    const cell = statusCell(live("unknown", "Meta: An unexpected error has occurred"), { state: "paused", date: "2026-09-09" }, "ACTIVE");
    expect(cell.text).toBe("Last recorded: Paused");
    expect(cell.sub).toMatch(/9 Sep/);
    expect(cell.sub).toMatch(/couldn't confirm with Meta now/);
    expect(cell.stale).toBe(true);
  });

  it("no snapshot status yet → Hawlai's own record, explicitly not confirmed", () => {
    const cell = statusCell(null, null, "ACTIVE");
    expect(cell.text).toBe("Hawlai's record: Active");
    expect(cell.sub).toMatch(/Not confirmed with Meta/);
    expect(cell.tone).toBe("muted");
  });

  it("a day whose own check failed ('unknown') never hides an earlier real answer", () => {
    // page.tsx skips unknown snapshots; this pins that the cell ignores one too.
    const cell = statusCell(null, { state: "unknown", date: "2026-09-10" }, "PAUSED");
    expect(cell.text).toBe("Hawlai's record: Paused");
  });

  it("deleted on Meta → says so, and what it was when last seen", () => {
    const cell = statusCell(live("deleted"), { state: "active", date: "2026-09-09" }, "ACTIVE");
    expect(cell.text).toBe("Deleted on Meta");
    expect(cell.sub).toBe("Last seen active on 9 Sep");
    expect(cell.tone).toBe("muted");
  });

  it("while checking → 'Checking…', with the last recorded status underneath", () => {
    const cell = statusCell("loading", { state: "paused", date: "2026-09-09" }, null);
    expect(cell.text).toBe("Checking…");
    expect(cell.sub).toMatch(/Last recorded: Paused · 9 Sep/);
  });

  it("confirmed live → says it was checked with Meta", () => {
    const cell = statusCell(live("active"), null, "PAUSED");
    expect(cell).toMatchObject({ text: "Active", tone: "good", stale: false });
    expect(cell.sub).toMatch(/Checked with Meta/);
  });
});

describe("new columns appear even for people who customised the table before", () => {
  it("no saved preference → everything, Status and Campaign ID included", () => {
    expect(resolveVisibleColumns(null)).toEqual([...ALL_COLUMN_KEYS]);
  });

  it("an OLD saved array (from before these columns existed) → its choices kept, new columns shown", () => {
    // The trap: read naively, ["spend","leads"] would hide Status and
    // Campaign ID forever for anyone who ever touched the picker.
    const cols = resolveVisibleColumns(["spend", "leads"]);
    expect(cols).toContain("status");
    expect(cols).toContain("campaignId");
    expect(cols).toContain("spend");
    expect(cols).not.toContain("roas");
  });

  it("a NEW saved preference that hid Status keeps it hidden", () => {
    const saved = serializeColumns(["spend", "leads"]);
    const cols = resolveVisibleColumns(JSON.parse(JSON.stringify(saved)));
    expect(cols).not.toContain("status");
    expect(cols).not.toContain("campaignId");
  });

  it("garbage or unknown keys → defaults / dropped", () => {
    expect(resolveVisibleColumns("nonsense")).toEqual([...ALL_COLUMN_KEYS]);
    expect(resolveVisibleColumns({ visible: ["bogus"], known: [...ALL_COLUMN_KEYS] })).toEqual([...ALL_COLUMN_KEYS]);
  });
});
