import { defineConfig } from "vitest/config";

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
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Smoke tests need a running production server and live in their
    // own config (vitest.smoke.config.mts). Without this exclusion the
    // `tests/**` glob picks them up and they fail against a port with
    // nothing on it — which would look like a broken app rather than a
    // misconfigured runner.
    exclude: ["node_modules/**", "tests/smoke/**"],
    // A run must never pass because no assertion executed.
    passWithNoTests: false,
    reporters: process.env.CI ? ["dot"] : ["default"],
  },
});
