// Reading source code in a test, without the comments lying to you.
//
// THE INCIDENT (2026-10-09). Two tests asserting that
// src/lib/tasks/taskExecutors.ts does NOT pass `revise: true` failed —
// because the comment directly above that call says the words `revise:
// true` while explaining that it is deliberately not passed. A
// source-grep test is defeated by a comment ABOUT the thing it looks
// for.
//
// That failure was in the harmless direction: a guard that is present
// looked absent, and the test went red. THE REVERSE IS THE REASON THIS
// FILE EXISTS. A test asserting a guard IS present passes on a comment
// that merely mentions it, so a guard deleted from the code but still
// described in a comment above it reads as protected. Eighty-six test
// files in this suite read source from disk, and most of them assert
// presence.
//
// So: every test that greps source goes through `code()`, and nothing
// keeps its own copy of the stripping logic.

import { readFileSync } from "node:fs";

/**
 * A source file with its comments removed.
 *
 * Strips `/* … *\/` blocks (including JSDoc) and whole-line `//`
 * comments. Deliberately NOT trailing `//` comments on a line of code:
 * removing those needs real string and regex-literal awareness, and a
 * naive version would cut a `//` inside a URL or inside a regex like
 * `/https?:\/\//`, silently mangling the very line under test. A
 * trailing comment is a much smaller hiding place than a block above
 * the code, and a wrong strip is worse than an unstripped tail.
 */
export function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

/**
 * The raw file, comments and all.
 *
 * For the cases where the comment IS the thing being asserted — this
 * codebase deliberately records the dated incident that caused each
 * guard, and a test may reasonably require that record to survive.
 * Named so that using it is a visible choice rather than the default.
 */
export function sourceWithComments(path: string): string {
  return readFileSync(path, "utf8");
}
