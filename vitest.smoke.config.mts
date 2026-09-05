import { defineConfig } from "vitest/config";

// Smoke tests run SEPARATELY from the unit suite.
//
// They boot a real production server and issue hundreds of HTTP
// requests, so they take minutes where the unit suite takes seconds.
// Folding them into `npm test` would make the fast feedback loop slow
// enough that people stop running it — and a suite nobody runs is the
// problem this whole effort exists to fix (OPEN_ITEMS 0b).
//
// CI runs both. Locally: `npm run test:smoke`.

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/smoke/**/*.test.ts"],
    globalSetup: ["tests/smoke/globalSetup.ts"],
    passWithNoTests: false,
    // One server, shared. Parallel forks would each try to bind the
    // same port.
    fileParallelism: false,
    // Booting Next and walking 350+ routes is minutes, not seconds.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    reporters: process.env.CI ? ["dot"] : ["default"],
  },
});
