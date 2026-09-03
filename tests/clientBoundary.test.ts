// Server/client boundary — from a production 500.
//
// buttonClasses is a pure string helper, but it lived inside
// Button.tsx, which is "use client". A function exported from a client
// module is a CLIENT export, so every server component calling it
// threw at render:
//
//   Attempted to call buttonClasses() from the server but
//   buttonClasses is on the client.
//
// Thirteen server components did exactly that. The build passed the
// entire time — this is a runtime boundary error, invisible to tsc and
// to `next build`, and it only surfaced when someone opened one of the
// affected pages.
//
// THESE READ THE COMMITTED TREE, NOT THE WORKING TREE — deliberately,
// and the reason is the first version of this file. It read from disk,
// passed locally because the fix was present there, and the push still
// broke the build: one of the thirteen files had been fixed but never
// staged. A test that validates work you have not committed says
// nothing about what you shipped. Reading through git closes that gap.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

/** Files in HEAD matching a pattern. One git process, not one per file. */
function grepCommitted(pattern: string): string[] {
  try {
    const out = execFileSync("git", ["grep", "-l", "-E", pattern, "HEAD", "--", "src"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").filter(Boolean).map((line) => line.replace(/^HEAD:/, ""));
  } catch {
    // git grep exits non-zero when nothing matches.
    return [];
  }
}

/** One file's contents as committed. Falls back to disk if HEAD is unreadable. */
function committed(file: string): string {
  const gitPath = file.split(path.sep).join("/");
  try {
    return execFileSync("git", ["show", `HEAD:${gitPath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return fs.readFileSync(file, "utf8");
  }
}

describe("buttonClasses is callable from the server", () => {
  it("lives in a module with no 'use client' directive", () => {
    expect(committed("src/components/ui/buttonClasses.ts").trimStart()).not.toMatch(/^["']use client["']/);
  });

  it("is NOT re-exported through the client Button module", () => {
    // Re-exporting it from Button.tsx would put it straight back
    // behind the boundary and reintroduce the 500.
    const button = committed("src/components/ui/Button.tsx");
    expect(button).not.toMatch(/export\s+function\s+buttonClasses/);
    expect(button).not.toMatch(/export\s*\{[^}]*\bbuttonClasses\b/);
  });

  it("is re-exported by the barrel from the non-client module", () => {
    expect(committed("src/components/ui/index.ts")).toMatch(
      /export \{[^}]*buttonClasses[^}]*\} from "\.\/buttonClasses"/
    );
  });

  it("no committed file imports buttonClasses from the client Button module", () => {
    // THE LOAD-BEARING ONE. It fails the moment someone moves
    // buttonClasses back into Button.tsx for convenience, or adds a
    // new page importing it from there — which is how this returns.
    const offenders = grepCommitted('import.*buttonClasses.*from "@/components/ui/Button"');
    expect(offenders).toEqual([]);
  });

  it("still has real callers, so the checks above are not passing vacuously", () => {
    const callers = grepCommitted("buttonClasses\\(").filter((f) => !f.endsWith("ui/buttonClasses.ts"));
    expect(callers.length).toBeGreaterThan(5);
  });
});
