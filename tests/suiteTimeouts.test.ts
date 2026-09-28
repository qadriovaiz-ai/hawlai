// The suite's own timeout, pinned (2026-09-28).
//
// Three tests timed out during a full run, passed on a re-run, and
// passed in isolation. Nothing was broken: Vitest's default is 5
// seconds, and several tests here dynamically import masterBrainV2 —
// the largest module in the app — or walk src/ from disk. Solo they take
// 1.5-3.4s; when workers contend during a full run they cross 5s.
//
// A gate that fails at random teaches people to re-run it instead of
// reading it, which is worse than a gate that is slow. This pins the
// raise so it doesn't get quietly reverted by someone tidying the config.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const config = readFileSync("vitest.config.mts", "utf8");

describe("the suite gives slow tests room", () => {
  it("has an explicit timeout well above what the slowest test needs", () => {
    const declared = config.match(/testTimeout:\s*([\d_]+)/);
    expect(declared, "testTimeout must be set explicitly, not left at the 5s default").toBeTruthy();
    const ms = Number(declared![1].replace(/_/g, ""));
    // The slowest test measured 2.6s under load; 10s is the floor that
    // leaves real headroom, and a hang still fails quickly.
    expect(ms).toBeGreaterThanOrEqual(10_000);
    expect(ms).toBeLessThanOrEqual(30_000);
  });

  it("hooks get the same room, since setup does the same heavy importing", () => {
    expect(config).toMatch(/hookTimeout:\s*[\d_]+/);
  });

  it("and the reason is written down, so the next person doesn't undo it", () => {
    expect(config).toContain("masterBrainV2");
    expect(config).toContain("flaky gate is worse than a slow one");
  });
});
