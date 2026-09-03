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
// These tests are static analysis over the source, which is the only
// way to catch it short of rendering every route.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const FILES = walk("src");
const isClientModule = (file: string) => /^["']use client["']/.test(fs.readFileSync(file, "utf8").trimStart());

describe("buttonClasses is callable from the server", () => {
  it("lives in a module with no 'use client' directive", () => {
    expect(isClientModule("src/components/ui/buttonClasses.ts")).toBe(false);
  });

  it("is NOT re-exported through the client Button module", () => {
    // Re-exporting it from Button.tsx would put it straight back
    // behind the boundary and reintroduce the 500.
    const button = fs.readFileSync("src/components/ui/Button.tsx", "utf8");
    expect(button).not.toMatch(/export\s+(function\s+buttonClasses|\{[^}]*\bbuttonClasses\b)/);
  });

  it("is re-exported by the barrel from the non-client module", () => {
    const barrel = fs.readFileSync("src/components/ui/index.ts", "utf8");
    expect(barrel).toMatch(/export \{[^}]*buttonClasses[^}]*\} from "\.\/buttonClasses"/);
  });

  it("no file imports buttonClasses from the client Button module", () => {
    const offenders = FILES.filter((f) => {
      const src = fs.readFileSync(f, "utf8");
      return /import[^;]*\bbuttonClasses\b[^;]*from\s+["'][^"']*\/ui\/Button["']/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

describe("no server component calls a client-only export", () => {
  it("every caller of buttonClasses resolves to the shared module", () => {
    // The regression this guards: someone re-adds buttonClasses to
    // Button.tsx for convenience, and a dozen server-rendered pages
    // start throwing again with a green build.
    const callers = FILES.filter((f) => /\bbuttonClasses\s*\(/.test(fs.readFileSync(f, "utf8")));
    expect(callers.length).toBeGreaterThan(5);

    for (const file of callers) {
      const src = fs.readFileSync(file, "utf8");
      const importsIt = /import[^;]*\bbuttonClasses\b[^;]*from\s+["']([^"']+)["']/.exec(src);
      // The definition site itself has no import.
      if (file.endsWith(path.join("ui", "buttonClasses.ts"))) continue;
      expect(importsIt, `${file} calls buttonClasses without importing it`).not.toBeNull();
      const from = importsIt![1];
      expect(
        from === "@/components/ui" || from.endsWith("/ui/buttonClasses") || from === "./buttonClasses",
        `${file} imports buttonClasses from ${from}`
      ).toBe(true);
    }
  });
});
