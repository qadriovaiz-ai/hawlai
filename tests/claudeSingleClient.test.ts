// One door to Anthropic.
//
// WHY (2026-09-18): 48 hand-rolled calls in 40 files each threw away why a
// call failed, so when the credits ran out every department failed with a
// different generic message and nobody at Hawlai was told. All of them now
// go through src/lib/ai/claude.ts, which classifies the failure, retries
// only what can recover, says it to the owner in approved words and alerts
// the operator. A new direct call would quietly bring the old problem back
// for that feature — this fails first.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const THE_CLIENT = ["src", "lib", "ai", "claude.ts"].join(sep);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

describe("every Anthropic call goes through lib/ai/claude.ts", () => {
  const files = sourceFiles(join(ROOT, "src")).map((f) => ({ rel: relative(ROOT, f), text: readFileSync(f, "utf8") }));

  it("no other file calls the Messages API", () => {
    const direct = files.filter((f) => f.rel !== THE_CLIENT && f.text.includes("api.anthropic.com")).map((f) => f.rel);
    expect(direct).toEqual([]);
  });

  it("no other file reads the Anthropic key", () => {
    const readers = files.filter((f) => f.rel !== THE_CLIENT && f.text.includes("ANTHROPIC_API_KEY")).map((f) => f.rel);
    expect(readers).toEqual([]);
  });

  it("the check is looking at the real tree", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.rel === THE_CLIENT && f.text.includes("api.anthropic.com"))).toBe(true);
  });
});
