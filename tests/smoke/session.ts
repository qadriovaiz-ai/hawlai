// A real session for the smoke tests, minted at run time.
//
// NOT A STORED COOKIE. Storing a signed session as a CI secret was the
// obvious idea and it does not work: a Supabase access token lives
// about an hour, so the secret would be stale before most CI runs and
// somebody would be re-pasting it by hand every morning — which is
// exactly the "manual step each time" this is meant to avoid.
//
// Credentials are the durable thing. Two secrets (email, password),
// and each run signs in and gets a fresh session. Nothing expires,
// nothing is ever re-pasted.
//
// THE COOKIE IS ENCODED BY @supabase/ssr ITSELF, not by hand. Its
// cookie format is an internal detail — base64-prefixed JSON, chunked
// across `.0`/`.1` suffixes past a size threshold, and it has changed
// between minor versions. Hand-rolling it would produce a cookie the
// app rejects, which would look exactly like "the pages are broken"
// and send someone chasing a bug that does not exist. Signing in
// through a client whose cookie adapter simply RECORDS what the
// library writes means the format matches the app by construction.

import { createServerClient } from "@supabase/ssr";

export type SessionResult =
  | { ok: true; cookie: string; userId: string }
  | { ok: false; reason: string };

/** Whether CI has been given what it needs to run part 2. */
export function hasSmokeCredentials(): boolean {
  return Boolean(
    process.env.SMOKE_USER_EMAIL &&
      process.env.SMOKE_USER_PASSWORD &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Sign the CI test user in and return a Cookie header the app accepts.
 *
 * Uses the ANON key, never the service role: the point is to exercise
 * the app as a real logged-in user, through the same RLS every real
 * user is subject to. A service-role session would bypass exactly the
 * policies these pages depend on and could render pages green that
 * are broken for everyone else.
 */
export async function mintSmokeSession(): Promise<SessionResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.SMOKE_USER_EMAIL;
  const password = process.env.SMOKE_USER_PASSWORD;

  if (!url || !anonKey || !email || !password) {
    return { ok: false, reason: "SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD / Supabase env not set" };
  }
  if (url.includes("placeholder") || url.includes("smoke.supabase.co")) {
    // Signing in against a host that does not exist would fail with a
    // network error and read as "bad credentials", which is a
    // needlessly confusing way to say "you pointed this at nothing".
    return { ok: false, reason: `NEXT_PUBLIC_SUPABASE_URL is a placeholder (${url}) — part 2 needs a real project` };
  }

  const captured: { name: string; value: string }[] = [];

  try {
    // WEBSOCKET SHIM, and it is required — this crashed CI.
    //
    // createServerClient builds a full SupabaseClient, whose
    // constructor EAGERLY constructs a RealtimeClient, which throws on
    // Node < 22:
    //
    //   Error: Node.js 20 detected without native WebSocket support
    //
    // The runner is Node 20; this machine is Node 24, which has
    // WebSocket natively — so the failure existed only in CI and was
    // invisible locally. Exactly the "works on my machine" gap this
    // whole suite exists to close, arriving in the suite's own setup.
    //
    // A stub is honest here rather than a cop-out: nothing in these
    // tests uses realtime. The constructor only needs a reference to
    // hold; no connection is attempted unless .channel() is called,
    // and it never is. Shimming beats bumping the runner's Node,
    // which would change the version the production build is verified
    // against in order to fix a test helper.
    if (typeof (globalThis as any).WebSocket === "undefined") {
      (globalThis as any).WebSocket = class SmokeWebSocketStub {
        constructor() {
          throw new Error("[smoke] realtime is not used by the smoke tests and must not be opened");
        }
      };
    }

    const client = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => [],
        setAll: (list: { name: string; value: string }[]) => {
          for (const { name, value } of list) captured.push({ name, value });
        },
      },
    });

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, reason: `sign-in failed: ${error.message}` };
    if (!data.session) return { ok: false, reason: "sign-in returned no session" };
    if (captured.length === 0) {
      return { ok: false, reason: "@supabase/ssr wrote no cookies — its cookie contract may have changed" };
    }

    // Chunked cookies must ALL be sent; dropping `.1` yields a cookie
    // the app cannot decode, which presents as a logged-out session.
    const cookie = captured.map((c) => `${c.name}=${c.value}`).join("; ");

    // NAMES ONLY, never values — a value here is a live session.
    //
    // Added because sign-in SUCCEEDED and all 77 dashboard pages still
    // redirected to login, which means the cookie was minted and then
    // not accepted. The two candidate explanations — wrong cookie
    // name, or capturing only the PKCE code-verifier instead of the
    // auth token — are distinguishable by the names alone, and
    // guessing between them without looking is how the Shopify
    // diagnosis went wrong three times.
    console.log(`  [smoke] cookies captured: ${captured.map((c) => c.name).join(", ") || "(none)"}`);

    return { ok: true, cookie, userId: data.session.user.id };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "could not reach Supabase" };
  }
}
