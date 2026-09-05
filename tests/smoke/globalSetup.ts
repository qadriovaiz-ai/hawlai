// Boots the real production server for the smoke tests.
//
// A REAL SERVER, not a mocked request. That is the entire point: three
// of the four production incidents were invisible to unit tests
// because nothing ever executed a route, and the fourth (buttonClasses
// returning 500 on thirteen pages) needed an actual render — the
// module imports fine, it throws when called during server rendering.
//
// `next start` rather than `next dev`: dev compiles lazily and papers
// over some production-only failures, and the production build is what
// ships.

import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

export const SMOKE_PORT = Number(process.env.SMOKE_PORT ?? 3210);
export const SMOKE_BASE = `http://127.0.0.1:${SMOKE_PORT}`;

let server: ChildProcess | null = null;

async function waitForReady(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Any answer at all means it is listening. A non-200 is fine
      // here — the tests judge status codes, this only waits for the
      // socket.
      await fetch(SMOKE_BASE, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Smoke server did not become ready on ${SMOKE_BASE} within ${timeoutMs}ms`);
}

export async function setup() {
  const buildId = path.join(process.cwd(), ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) {
    // Fail loudly rather than building here. A build hidden inside a
    // test run is slow, surprising, and makes a failure look like a
    // test failure when it is a build failure.
    throw new Error("No production build found. Run `npm run build` first (npm run test:smoke does this for you).");
  }

  server = spawn("npx", ["next", "start", "--port", String(SMOKE_PORT)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: { ...process.env, NODE_ENV: "production" },
  });

  // Server output is captured and surfaced only on failure — a route
  // that 500s prints its stack here, which is the most useful thing
  // in the whole run.
  const log: string[] = [];
  server.stdout?.on("data", (d) => log.push(String(d)));
  server.stderr?.on("data", (d) => log.push(String(d)));
  (globalThis as any).__SMOKE_LOG = log;

  try {
    await waitForReady();
  } catch (err) {
    console.error("--- smoke server output ---\n" + log.join(""));
    throw err;
  }
}

export async function teardown() {
  if (!server) return;
  // Windows needs the tree killed; a bare kill leaves next's child.
  if (process.platform === "win32" && server.pid) {
    spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
  server = null;
}
