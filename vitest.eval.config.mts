import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// A SEPARATE CONFIG FOR THE EVAL, AND THAT IS THE POINT.
//
// The eval calls a real paid model. It must never be picked up by
// `npx vitest run`, which is run dozens of times a day and on every
// commit — so the eval lives outside the main config's
// `include: ["tests/**/*.test.ts"]` and needs this file named
// explicitly to run at all:
//
//   npx vitest run --config vitest.eval.config.mts
//
// WHY VITEST AND NOT tsx. The agents import `server-only`, a marker
// package whose non-server build is a bare `throw` — correct in a
// browser bundle, pure noise here. The main config already resolves it
// to the empty build, and the same alias is repeated below rather than
// risking a second, divergent answer. Running the eval under tsx failed
// all 30 cases on that throw, which a free stub run found before a
// rupee was spent.

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["scripts/eval/**/*.eval.ts"],
    // A real model call, 30 cases, up to three calls each. The default
    // 5s timeout would fail the run rather than the model.
    testTimeout: 30 * 60 * 1000,
    hookTimeout: 60 * 1000,
    // One file, in order, so the spend ledger is written once and the
    // progress log reads top to bottom.
    fileParallelism: false,
  },
});
