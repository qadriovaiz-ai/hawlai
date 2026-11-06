import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest rather than Jest.
//
// The deciding factor is the "@/..." path alias this codebase uses
// everywhere: Vite resolves it straight from tsconfig, where Jest
// would need a moduleNameMapper kept manually in sync with a file it
// can't see. Vitest also runs TypeScript and ESM natively, which
// matters because several modules under test mix `import crypto from
// "crypto"` with ESM exports — a combination needing babel config
// under Jest and none here.
//
// .mts so the config itself loads as ESM, and tsconfig paths resolved
// natively rather than via vite-tsconfig-paths, which Vite now
// supersedes.
//
// Deliberately NOT jsdom. Everything covered here is pure logic or a
// server module; a DOM environment would slow every run for component
// tests that don't exist. Set `environment: "jsdom"` per file when the
// first one does.

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` is a marker package: React's bundler picks its empty
    // build through the "react-server" export condition, and everything
    // else gets a module whose only statement is a throw. That throw is
    // the whole point in a browser bundle, and pure noise here — a test
    // importing a server module is exactly the right thing to do. So the
    // runner resolves it to the same empty file the server build gets.
    alias: { "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)) },
  },
  // tsconfig says jsx: "preserve" (Next compiles JSX itself); tests that
  // render a component to HTML need it compiled here.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Smoke tests need a running production server and live in their
    // own config (vitest.smoke.config.mts). Without this exclusion the
    // `tests/**` glob picks them up and they fail against a port with
    // nothing on it — which would look like a broken app rather than a
    // misconfigured runner.
    exclude: ["node_modules/**", "tests/smoke/**"],
    // Zeroes the Meta retry waits (attempts unchanged) so retry tests
    // don't sleep. Not a *.test.ts file, so `include` never runs it as one.
    setupFiles: ["tests/setup/metaRetryTiming.ts"],
    // Vitest's default is 5 seconds, and that is too close to what this
    // suite genuinely needs. Several tests dynamically import
    // masterBrainV2 — the largest module in the app, with a long
    // dependency tree — or walk src/ from disk; solo they take 1.5-3.4s,
    // and when workers contend during a full run they cross 5s and fail.
    // That happened on 2026-09-28: three tests timed out, passed on a
    // re-run, and passed in isolation.
    //
    // Raised rather than sprinkled per-test, because a per-test number
    // only fixes the tests that have already failed — the next slow one
    // fails next week. 15s still catches a genuine hang quickly (the
    // slowest test in the suite is 2.6s, so this is ~6x headroom), and a
    // flaky gate is worse than a slow one: people learn to re-run it
    // instead of reading it.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // A run must never pass because no assertion executed.
    passWithNoTests: false,
    reporters: process.env.CI ? ["dot"] : ["default"],
  },
});
