// A1 — the dealer never types a Meta Pixel ID.
//
// Before this, the Pixel ID was a text field in Settings →
// Integrations, and finding it meant digging through Events Manager
// for a 15-digit number. Now the OAuth callback lists the pixels on
// each ad account and finalize resolves one.
//
// Real assertions on the real function, not source-grep: the rules
// here are branchy and one of them is a security guard.

import { describe, it, expect } from "vitest";
import { resolvePixel } from "@/lib/meta/resolvePixel";

const account = (id: string, pixels: { id: string; name: string }[]) => [{ id, pixels }];

describe("resolvePixel", () => {
  it("auto-selects when the ad account has exactly one pixel", () => {
    const accounts = account("act_1", [{ id: "111", name: "Main Pixel" }]);
    expect(resolvePixel(accounts, "act_1")).toEqual({ id: "111", name: "Main Pixel" });
  });

  it("matches the account whether or not the caller sends the act_ prefix", () => {
    // me/adaccounts returns `act_1`; the form has handed back both
    // forms historically, so neither must silently find nothing.
    const accounts = account("act_1", [{ id: "111", name: "Main Pixel" }]);
    expect(resolvePixel(accounts, "1")?.id).toBe("111");
    expect(resolvePixel(accounts, "act_1")?.id).toBe("111");
  });

  it("does NOT guess when the account has several pixels", () => {
    // Picking the first would silently send this dealer's conversions
    // to whichever pixel Meta happened to list first. The UI asks.
    const accounts = account("act_1", [
      { id: "111", name: "Website" },
      { id: "222", name: "Old Pixel" },
    ]);
    expect(resolvePixel(accounts, "act_1")).toBeNull();
  });

  it("honours an explicit choice among several", () => {
    const accounts = account("act_1", [
      { id: "111", name: "Website" },
      { id: "222", name: "Old Pixel" },
    ]);
    expect(resolvePixel(accounts, "act_1", "222")?.name).toBe("Old Pixel");
  });

  it("REJECTS a pixel id the callback never discovered", () => {
    // THE LOAD-BEARING ONE. pixel_id comes from the browser. Trusting
    // it would let a crafted request point this business's conversion
    // tracking at someone else's pixel, while the dealer sees a
    // perfectly normal "connected" screen.
    const accounts = account("act_1", [{ id: "111", name: "Website" }]);
    expect(resolvePixel(accounts, "act_1", "999666333")).toBeNull();
  });

  it("does not leak a pixel across ad accounts", () => {
    const accounts = [
      { id: "act_1", pixels: [{ id: "111", name: "Mine" }] },
      { id: "act_2", pixels: [{ id: "222", name: "Theirs" }] },
    ];
    expect(resolvePixel(accounts, "act_1", "222")).toBeNull();
    expect(resolvePixel(accounts, "act_2", "222")?.name).toBe("Theirs");
  });

  it("returns null rather than throwing when discovery found nothing", () => {
    // finalize treats null as leave-the-existing-value-alone, so a
    // reconnect that lost ads permission must not clobber a working
    // pixel. These are the shapes a failed Graph call produces.
    expect(resolvePixel([], "act_1")).toBeNull();
    expect(resolvePixel(null, "act_1")).toBeNull();
    expect(resolvePixel(undefined, "act_1")).toBeNull();
    expect(resolvePixel([{ id: "act_1" }], "act_1")).toBeNull();
    expect(resolvePixel(account("act_1", []), "act_1")).toBeNull();
    expect(resolvePixel(account("act_9", [{ id: "111", name: "x" }]), "act_1")).toBeNull();
  });
});
