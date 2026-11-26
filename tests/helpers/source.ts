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
    // CRLF FILES: the regexes and indexOf searches built through this
    // helper use `\n` (the LF convention) — normalizing to LF makes the
    // helper line-ending agnostic. Verified 2026-11-26 against
    // src/app/api/ads/[id]/status/route.ts and src/lib/approvals/decide.ts.
    .replace(/\r\n/g, "\n")
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
  // NORMALISED LIKE THE OTHER TWO, 26 November 2026. `code()` and
  // `sql()` were given this and this one was not, which left the
  // helper fragile in exactly the place a reader would least expect
  // it: a test that reaches for the comments is already doing the
  // careful thing.
  //
  // THE SAME BUG, NOT A PRECAUTION. `.gitattributes` has `* text=auto`
  // and a Windows checkout has `core.autocrlf=true`, so a fresh clone
  // carries CRLF while files written locally are LF. Any assertion
  // whose pattern or slice contains `\n` then matches on one machine
  // and not the other — which is how seven tests were red on a fresh
  // Windows clone and green here.
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

/**
 * A migration with its SQL comments removed.
 *
 * `code()` strips `//` and `/* … *\/`, which a .sql file does not use,
 * so grepping a migration through it leaves every `--` comment in
 * place — exactly the hiding place the incident above is about. This
 * project's migrations carry long explanatory headers that quote the
 * very clauses a test looks for: 211's header explains why its index is
 * NOT scoped to `status in ('draft','active')`, naming that clause.
 *
 * Here rather than in a test file, because nothing keeps its own copy
 * of the stripping logic.
 */
export function sql(path: string): string {
  return readFileSync(path, "utf8")
    // CRLF FILES: same normalization as code() — migrations such as
    // supabase/migrations/226_webhook_deliveries.sql carry `--` comments
    // whose content the line-ending split must not obscure.
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("--");
      // A `--` inside a quoted string is not a comment. Cutting on one
      // would be a wrong strip, which is worse than an unstripped tail,
      // so an odd number of quotes before it leaves the line alone.
      if (at === -1) return line;
      const before = line.slice(0, at);
      const quotes = (before.match(/'/g) ?? []).length;
      return quotes % 2 === 1 ? line : before;
    })
    .join("\n");
}
