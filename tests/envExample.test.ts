// .env.example completeness — R8.
//
// The audit found 9 of 55 variables documented, so provisioning an
// environment meant reading the source. This test is what stops that
// drifting back: a new process.env reference with no documentation
// fails here rather than being discovered when a deploy comes up
// half-working.
//
// It also guards the other direction — a documented variable nothing
// reads is a stale instruction that sends someone hunting for a key
// they do not need.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/** Every process.env.X referenced under a directory, recursively. */
function referencedVars(dirs: string[]): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        for (const m of fs.readFileSync(full, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
          found.add(m[1]);
        }
      }
    }
  };
  for (const dir of dirs) walk(dir);
  return found;
}

/** Variables assigned in .env.example, including empty assignments. */
function documentedVars(): Set<string> {
  const documented = new Set<string>();
  for (const line of fs.readFileSync(".env.example", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m) documented.add(m[1]);
  }
  return documented;
}

// Provided by the runtime or the CI platform, not by an operator.
const PLATFORM_PROVIDED = new Set(["NODE_ENV", "CI", "NEXT_PUBLIC_"]);

describe(".env.example", () => {
  const referenced = referencedVars(["src", "scripts"]);
  const documented = documentedVars();

  it("documents every variable the code reads", () => {
    const missing = [...referenced].filter((v) => !documented.has(v) && !PLATFORM_PROVIDED.has(v)).sort();
    // Named in the failure so the fix is obvious rather than a hunt.
    expect(missing, `Undocumented in .env.example: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents nothing the code no longer reads", () => {
    const stale = [...documented].filter((v) => !referenced.has(v)).sort();
    expect(stale, `Documented but unused — stale instructions: ${stale.join(", ")}`).toEqual([]);
  });

  it("contains no real-looking values", () => {
    const contents = fs.readFileSync(".env.example", "utf8");
    // This file is committed. A pasted key here is a leaked key.
    expect(contents).not.toMatch(/=\s*eyJ[A-Za-z0-9._-]{20,}/); // JWT
    expect(contents).not.toMatch(/=\s*sk-[A-Za-z0-9-]{20,}/); // API key
    expect(contents).not.toMatch(/=\s*[0-9a-f]{64}\s*$/m); // 32-byte hex key
    expect(contents).not.toMatch(/=\s*https:\/\/[a-z0-9]{15,}\.supabase\.co/); // real project ref
  });

  it("marks the kill switches as disabled by default", () => {
    const contents = fs.readFileSync(".env.example", "utf8");
    // A copied example that silently enables a retired feature would
    // defeat the fail-closed design of the flags themselves.
    expect(contents).toMatch(/NEXT_PUBLIC_VIDEO_GENERATION_ENABLED=false/);
    expect(contents).toMatch(/NEXT_PUBLIC_STUDIO_3D_ENABLED=false/);
  });
});
