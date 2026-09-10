// The On/Off switch in Campaign Performance History, and what the
// Status column says when the connection itself can't read status.
//
// THE RULE for the switch: only a status Meta has just confirmed can be
// acted on. A switch drawn from a stale record is how someone "starts" a
// campaign that was already running, or thinks they paused one that is
// gone.

import { describe, it, expect } from "vitest";
import { toggleState, statusCell, DELIVERY_LABELS, type DeliveryState, type LiveDelivery } from "@/lib/ads/campaignDeliveryDisplay";
import { describeDelivery } from "@/lib/ads/campaignDelivery";

const live = (state: DeliveryState, extra: Partial<LiveDelivery> = {}): LiveDelivery => ({
  state, label: DELIVERY_LABELS[state], detail: null, checkedAt: state === "unknown" ? null : "2026-09-11T10:00:00Z", ...extra,
});

describe("which way the switch points, and whether it works", () => {
  it("Active → on, and usable (to pause)", () => {
    expect(toggleState(live("active"), false)).toEqual({ on: true, enabled: true, reason: null });
  });

  it("Paused → off, and usable (to start)", () => {
    expect(toggleState(live("paused"), false)).toEqual({ on: false, enabled: true, reason: null });
  });

  it("switched on but not delivering (e.g. in review) → on, usable, so it can still be paused", () => {
    expect(toggleState(live("not_delivering"), false)).toMatchObject({ on: true, enabled: true });
  });

  it("while an action is in flight → locked", () => {
    expect(toggleState(live("active"), true).enabled).toBe(false);
  });

  it.each([
    ["still checking", "loading" as const],
    ["Meta couldn't be read", live("unknown")],
    ["no live answer at all", null],
    ["deleted on Meta", live("deleted")],
    ["not found on Meta", live("not_found")],
    ["archived", live("archived")],
    ["ids don't match Meta", live("mismatch")],
    ["never launched", live("not_on_meta")],
  ])("%s → locked, with a reason", (_name, input) => {
    const t = toggleState(input as any, false);
    expect(t.enabled).toBe(false);
    expect(t.reason).toBeTruthy();
  });

  it("can't read status because of the connection → the lock says reconnect Facebook", () => {
    const t = toggleState(live("unknown", { action: "reconnect_facebook" }), false);
    expect(t.enabled).toBe(false);
    expect(t.reason).toMatch(/Reconnect Facebook/);
  });
});

describe("a connection that can't read status says so — and what fixes it", () => {
  const graphError = (code: number, message: string, subcode: number | null = null) => ({
    ok: false as const, reason: "x", problem: "unreadable" as const,
    error: { http: 400, code, subcode, message, userMessage: null, transient: false },
  });

  it("the exact production error → reconnect Facebook, not 'couldn't confirm now'", () => {
    const d = describeDelivery(graphError(100, "(#100) Missing Ads or Marketing Messages permission"));
    expect(d.state).toBe("unknown");
    expect(d.action).toBe("reconnect_facebook");
    const cell = statusCell({ ...d, checkedAt: null }, { state: "active", date: "2026-09-10" }, "ACTIVE");
    expect(cell.text).toBe("Reconnect Facebook");
    expect(cell.sub).toMatch(/Settings → Integrations → Facebook/);
    expect(cell.sub).toMatch(/Last recorded: Active · 10 Sep/);
    expect(cell.tone).toBe("warn");
    expect(cell.stale).toBe(true);
  });

  it("an expired or revoked token (190) → reconnect too", () => {
    expect(describeDelivery(graphError(190, "Error validating access token")).action).toBe("reconnect_facebook");
  });

  it("gone from Meta (100/33) is NOT a permission problem — it's 'Not found on Meta'", () => {
    const d = describeDelivery(graphError(100, "Object does not exist, cannot be loaded due to missing permissions", 33));
    expect(d.state).toBe("not_found");
    expect(d.action).toBeUndefined();
  });

  it("a transient hiccup is NOT a permission problem", () => {
    const d = describeDelivery({ ok: false, reason: "x", problem: "unreadable", error: { http: 500, code: 2, subcode: null, message: "An unexpected error has occurred", userMessage: null, transient: true } });
    expect(d.action).toBeUndefined();
  });
});
