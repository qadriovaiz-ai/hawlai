import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// THE EXIT TEST OF A STAGE THAT IS STILL OPEN.
//
// A stage's exit test states what "done" means. Written at the END of a
// stage it can be shaped — unconsciously — around what was actually
// built; written at the START it fixes the target before the work can
// move it. The founder asked for the second on 5 November 2026, for S7.
//
// WHICH LEAVES ONE PROBLEM. An exit test written first is RED for the
// length of the stage, and CLAUDE.md rule 1 is "real exit codes,
// pasted". A suite with one known-red file means every commit for weeks
// pastes "1 failed" and asks the reader to remember which failure is
// expected. That is how a red suite stops meaning anything.
//
// So an open stage's exit test lives in tests/open/ and runs HERE,
// under its own command, exactly as the smoke tests do and for a
// related reason: it belongs to a different question from "is the build
// sound right now".
//
//   npm run test:open
//
// IT IS NOT ALLOWED TO BE FORGOTTEN. tests/stageOpen.test.ts runs in
// the DEFAULT suite and holds this arrangement down: every file in
// tests/open/ must carry a dated STAGE_OPEN marker naming the phase
// that closes it, this config must exist, and package.json must have
// the script that runs it. When the stage closes, the file moves to
// tests/ and joins the default suite — and the guard fails until the
// marker goes with it.

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)) },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/open/**/*.test.ts"],
    setupFiles: ["tests/setup/metaRetryTiming.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // A run must never pass because no assertion executed — least of
    // all this one, where "nothing ran" and "the stage is finished"
    // would look identical.
    passWithNoTests: false,
    reporters: process.env.CI ? ["dot"] : ["default"],
  },
});
