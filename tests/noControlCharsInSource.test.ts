// A regex that matches nothing, silently.
//
// THREE TIMES IN ONE DAY, 2026-10-09 and 2026-10-10. A `\b` written
// through a script that processed escape sequences became a literal
// BACKSPACE character (0x08) in the source. The file still parses. The
// regex still compiles. It just contains an unprintable character
// instead of a word boundary, so it matches nothing — and a guard that
// matches nothing looks exactly like a guard with nothing to catch.
//
//   1. claimCheck's termAppears: every claim term stopped matching and
//      thirteen tests went red at once. That one announced itself.
//   2. antiGeneric's Devanagari comment: harmless, in prose.
//   3. narrativeProvenance's new habit patterns: FIVE patterns, all
//      dead, and the only reason it was caught is that the cases they
//      were written for failed immediately.
//
// The third is the dangerous shape. A guard added for a case nobody
// tests the same day is a guard that is silently off, and nothing in the
// suite would have said so.
//
// So: no source file may contain a control character. There is no
// legitimate use for one in this codebase, and the check costs
// milliseconds.

import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every source and test file, by extension. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx|mts|mjs|js|jsx|sql|md)$/.test(entry)) out.push(path.split("\\").join("/"));
  }
  return out;
}

/**
 * The characters that have no business being here.
 *
 * Tab, newline and carriage return are excluded: they are ordinary
 * whitespace. Everything else below 0x20, plus 0x7F, is either an escape
 * sequence that got processed when it should not have been, or a paste
 * accident.
 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const NAMES: Record<string, string> = {
  "\u0000": "NUL (\\0)",
  "\u0007": "BEL (\\a)",
  "\u0008": "BACKSPACE (\\b — a word boundary that got eaten)",
  "\u000B": "VERTICAL TAB (\\v)",
  "\u000C": "FORM FEED (\\f)",
  "\u001B": "ESCAPE",
  "\u007F": "DELETE",
};

describe("no source file contains a control character", () => {
  const files = sourceFiles("src").concat(sourceFiles("tests"), sourceFiles("scripts"), sourceFiles("supabase"));

  it("scans a real number of files", () => {
    // A path mistake that silently scanned nothing would make the
    // assertion below pass — the same failure mode this whole file is
    // about.
    expect(files.length).toBeGreaterThan(400);
  });

  it("NOT ONE, and a \\b eaten by a script is the reason", () => {
    const found: string[] = [];
    for (const path of files) {
      const src = readFileSync(path, "utf8");
      if (!CONTROL.test(src)) continue;
      // Report the line and the character by name, because "there is a
      // control character somewhere in this file" is not actionable.
      src.split("\n").forEach((line, i) => {
        const hit = line.match(CONTROL);
        if (hit) found.push(`${path}:${i + 1} contains ${NAMES[hit[0]] ?? `U+${hit[0].charCodeAt(0).toString(16).padStart(4, "0")}`}`);
      });
    }
    expect(
      found,
      `A control character in source. If this is a regex, it almost certainly should be \\b, \\s or \\d and a script ate the backslash:\n${found.join("\n")}`
    ).toEqual([]);
  });

  it("and the check itself works — it finds one when there is one", () => {
    // Otherwise a broken pattern here would make every file look clean,
    // which is the failure this file exists to prevent, one level up.
    expect(CONTROL.test(`a${String.fromCharCode(8)}b`)).toBe(true);
    expect(CONTROL.test("\\b")).toBe(false);
    // Ordinary whitespace is fine.
    expect(CONTROL.test("a\tb\nc\r\n")).toBe(false);
  });
});
