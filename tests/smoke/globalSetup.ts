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
import { mintSmokeSession, hasSmokeCredentials } from "./session";

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

/**
 * Where the minted session cookie is handed to the test file.
 *
 * A FILE, not process.env. globalSetup runs in the main process while
 * tests run in workers, so an env var set here is not reliably visible
 * there — and the failure mode is silent: part 2 would skip, print
 * "not configured", and look exactly like a correct opt-out while
 * credentials were sitting right there.
 */
export const SESSION_FILE = path.join(process.cwd(), ".next", "cache", "smoke-session");

export async function setup() {
  const buildId = path.join(process.cwd(), ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) {
    // Fail loudly rather than building here. A build hidden inside a
    // test run is slow, surprising, and makes a failure look like a
    // test failure when it is a build failure.
    throw new Error("No production build found. Run `npm run build` first (npm run test:smoke does this for you).");
  }

  // Supabase config is REQUIRED for the app to boot at all — without
  // it every request 500s with "Your project's URL and Key are
  // required to create a Supabase client", which would make the whole
  // suite fail for a reason that has nothing to do with the routes.
  //
  // Placeholders are enough, and that is what makes this runnable in
  // CI with no secrets. Verified: with dummy values the marketing home
  // renders 200, /dashboard correctly 307s to /auth/login, and
  // /api/events/dispatch answers 405 rather than being redirected —
  // every classification part 1 asserts still holds. getUser() simply
  // fails against a host that isn't there, which reads as "logged
  // out", which is exactly the state these tests exercise.
  //
  // ?? so a real configuration is never overridden — someone running
  // this against a real project should get that project.
  const smokeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production" as const,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://smoke.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.smoke",
  };

  server = spawn("npx", ["next", "start", "--port", String(SMOKE_PORT)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: smokeEnv,
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

  // Part 2's session, minted fresh each run rather than read from a
  // stored secret.
  //
  // A failed sign-in does NOT stop the run: parts 1 and 3 are still
  // worth having, and a bad credential should cost one third of the
  // coverage, not all of it. But when credentials were SUPPLIED and
  // did not work, that is shouted about — CI would otherwise believe
  // it has part 2 coverage while having none, which is the precise
  // failure this whole effort exists to prevent.
  try { fs.rmSync(SESSION_FILE, { force: true }); } catch { /* first run */ }

  const session = await mintSmokeSession();
  if (session.ok) {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, session.cookie, "utf8");
    console.log(`  [smoke] signed in as CI test user ${session.userId} — part 2 will run`);
  } else if (hasSmokeCredentials()) {
    console.error(`  [smoke] PART 2 CREDENTIALS SUPPLIED BUT FAILED: ${session.reason}`);
  }
}

export async function teardown() {
  // The cookie is a live credential; it does not outlive the run.
  try { fs.rmSync(SESSION_FILE, { force: true }); } catch { /* nothing to remove */ }
  if (!server) return;
  // Windows needs the tree killed; a bare kill leaves next's child.
  if (process.platform === "win32" && server.pid) {
    spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
  server = null;
}
