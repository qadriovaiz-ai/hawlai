// The helper that stops comments lying to a test.
//
// It needs its own tests for a reason that is slightly uncomfortable: a
// mutation check on tests/helpers/source.ts found that removing the
// BLOCK-comment strip broke nothing, because the incident that prompted
// the helper involved `//` lines only. A helper every source-grep test
// now depends on had half of its behaviour unproven.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { code, sourceWithComments } from "./helpers/source";

let dir: string;
const file = (name: string, body: string) => {
  const p = join(dir, name);
  writeFileSync(p, body, "utf8");
  return p;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "hawlai-source-helper-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("comments cannot fool a test that uses code()", () => {
  it("A WHOLE-LINE // COMMENT MENTIONING THE GUARD IS NOT THE GUARD", () => {
    // The exact shape of the 2026-10-09 incident.
    const p = file("line.ts", [
      "// NO revise: true HERE, deliberately.",
      "const x = 1;",
    ].join("\n"));
    expect(code(p)).not.toMatch(/revise:\s*true/);
    expect(code(p)).toMatch(/const x = 1;/);
  });

  it("AN INDENTED // COMMENT IS STRIPPED TOO", () => {
    // Nearly every comment in this codebase is indented inside a
    // function, so a strip that only handled column zero would be
    // useless here.
    const p = file("indented.ts", ["function f() {", "      // revise: true", "  return 1;", "}"].join("\n"));
    expect(code(p)).not.toMatch(/revise:\s*true/);
  });

  it("A BLOCK COMMENT MENTIONING THE GUARD IS STRIPPED", () => {
    // The case a mutation proved was unproven.
    const p = file("block.ts", ["/* revise: true is deliberately not passed */", "const x = 1;"].join("\n"));
    expect(code(p)).not.toMatch(/revise:\s*true/);
    expect(code(p)).toMatch(/const x = 1;/);
  });

  it("A MULTI-LINE JSDOC BLOCK IS STRIPPED WHOLE", () => {
    const p = file("jsdoc.ts", [
      "/**",
      " * This does NOT pass revise: true, and never calls",
      " * sendDealerEmail either.",
      " */",
      "export const y = 2;",
    ].join("\n"));
    const stripped = code(p);
    expect(stripped).not.toMatch(/revise:\s*true/);
    expect(stripped).not.toMatch(/sendDealerEmail/);
    expect(stripped).toMatch(/export const y = 2;/);
  });

  it("two separate blocks are both stripped, and the code between them survives", () => {
    // A greedy match would swallow the code between them, which would
    // hide a real guard rather than a comment — the dangerous direction.
    const p = file("two.ts", ["/* a */", "const keep = 1;", "/* b */", "const alsoKeep = 2;"].join("\n"));
    const stripped = code(p);
    expect(stripped).toMatch(/const keep = 1;/);
    expect(stripped).toMatch(/const alsoKeep = 2;/);
  });

  it("REAL CODE IS NEVER REMOVED", () => {
    // The whole helper is worthless if it can cut the line under test.
    const p = file("real.ts", [
      "const url = \"https://example.com/a//b\";",
      "const re = /https?:\\/\\//;",
      "const division = 10 / 2;",
    ].join("\n"));
    const stripped = code(p);
    expect(stripped).toMatch(/https:\/\/example\.com/);
    expect(stripped).toMatch(/const re = /);
    expect(stripped).toMatch(/const division = 10 \/ 2;/);
  });
});

describe("the limitation, stated rather than hidden", () => {
  it("A TRAILING // COMMENT ON A CODE LINE IS *NOT* STRIPPED", () => {
    // Deliberate. Removing those needs real string and regex-literal
    // awareness, and a naive version would cut the `//` inside a URL or
    // inside /https?:\/\// — mangling the very line under test. A
    // trailing comment is a far smaller hiding place than a block above
    // the code, and a wrong strip is worse than an unstripped tail.
    //
    // Pinned as a test so the limit is known rather than discovered.
    const p = file("trailing.ts", ["const x = 1; // revise: true"].join("\n"));
    expect(code(p)).toMatch(/revise:\s*true/);
  });
});

describe("sourceWithComments keeps them, on purpose", () => {
  it("THE DATED INCIDENT RECORD SURVIVES, so a test can require it", () => {
    // This codebase records why each guard exists. That record is worth
    // protecting, and a test that protects it needs the raw file.
    const p = file("raw.ts", ["// THE LIVE INCIDENT (8 Oct 2026).", "const x = 1;"].join("\n"));
    expect(sourceWithComments(p)).toMatch(/THE LIVE INCIDENT \(8 Oct 2026\)/);
    expect(code(p)).not.toMatch(/THE LIVE INCIDENT/);
  });
});
