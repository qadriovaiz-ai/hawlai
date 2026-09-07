// Every approval check actually consults the policy.
//
// FROM A REAL GAP. checkApprovalAuthority gained a rule — critical
// actions with no rupee amount need the owner — and it was tested,
// committed, and enforced NOWHERE. All three call sites still passed
// three arguments, so the rule silently fell back to "null amount =
// routine" and a marketing manager could approve a live price change.
//
// approvalGating.test.ts predicted this in its own header:
//
//   "A route that bypasses getActionPolicy entirely would still pass
//    every test here."
//
// It was right, and being right in a comment changed nothing. This is
// that warning as an assertion.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";

function grepCommitted(pattern: string): { file: string; line: string }[] {
  try {
    const out = execFileSync("git", ["grep", "-n", "-E", pattern, "HEAD", "--", "src"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const cleaned = l.replace(/^HEAD:/, "");
        const idx = cleaned.indexOf(":");
        const rest = cleaned.slice(idx + 1);
        return { file: cleaned.slice(0, idx), line: rest.slice(rest.indexOf(":") + 1) };
      });
  } catch {
    return [];
  }
}

describe("checkApprovalAuthority call sites pass an action key", () => {
  // Definition and re-export lines are not call sites.
  const callSites = grepCommitted("checkApprovalAuthority\\(").filter(
    (c) => !c.file.endsWith("lib/approvalAuthority.ts") && !c.line.includes("import")
  );

  it("finds the call sites at all", () => {
    // Vacuity guard. A rename would otherwise empty this list and the
    // assertion below would pass over nothing — the failure mode that
    // let the original gap through.
    expect(callSites.length).toBeGreaterThanOrEqual(3);
  });

  it("EVERY call site passes a fourth argument", () => {
    // THE LOAD-BEARING ONE. Three arguments means the critical
    // no-amount rule cannot fire, and the caller gets the old
    // permissive behaviour with no indication anything is missing.
    //
    // Counts commas at the top level of the call, so a nested call in
    // an argument does not read as an extra parameter.
    const threeArg = callSites.filter((c) => {
      const start = c.line.indexOf("checkApprovalAuthority(");
      if (start === -1) return false;
      let depth = 0;
      let commas = 0;
      for (let i = start + "checkApprovalAuthority(".length; i < c.line.length; i++) {
        const ch = c.line[i];
        if (ch === "(") depth++;
        else if (ch === ")") {
          if (depth === 0) break;
          depth--;
        } else if (ch === "," && depth === 0) commas++;
      }
      return commas < 3;
    });

    expect(
      threeArg.map((c) => c.file),
      `these call checkApprovalAuthority without an action key, so the critical-no-amount rule cannot apply: ${threeArg.map((c) => c.file).join(", ")}`
    ).toEqual([]);
  });
});
