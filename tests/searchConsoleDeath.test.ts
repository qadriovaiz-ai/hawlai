// A DEAD CONNECTION THAT SAYS SO — 6 November 2026.
//
// candle_by_qaaf's Search Console connection died on 4 November. The
// only trace was an error string on a `daily_jobs` row, and the owner
// found out on the 6th by asking why an email was missing. Search
// Console is the subsystem that measures everything the local-search
// plan is about, so its silent death is the most expensive silence in
// the product.
//
// TWO FAULTS, BOTH SMALL:
//
//   1. The message preferred `error_description`, and for the failure
//      that actually happened that is the LESS useful field. Google
//      answers {"error":"invalid_grant","error_description":"Bad
//      Request"} — so three days of rows read "(Bad Request)", which
//      names no cause and rules nothing out. `invalid_grant` is what
//      says the refresh token is dead at Google's end, and that is what
//      decides whether reconnecting is the whole fix.
//
//   2. Nobody was told. The job went red every morning and that was
//      the end of it.
//
// AND THE TELLING HAS TO BE ONCE. A notification a day about the same
// dead connection is one he learns to ignore, which ends in the same
// place as not telling him.

import { describe, it, expect, vi, afterEach } from "vitest";
import { validAccessToken } from "@/lib/seo/searchConsole";
import { syncSearchQueries } from "@/lib/seo/searchQueries";
import { code, sourceWithComments, sql as sqlOf } from "./helpers/source";

const notes: any[] = [];
let tellingThrows = false;
vi.mock("@/lib/notifications/emit", () => ({
  emitNotification: async (_s: any, input: any) => {
    if (tellingThrows) throw new Error("notifications table is unreachable");
    notes.push(input);
  },
}));

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
  notes.length = 0;
  tellingThrows = false;
  vi.restoreAllMocks();
});

const CONN = {
  accessToken: "stale",
  refreshToken: "dead-at-google",
  tokenExpiry: "2026-11-01T00:00:00.000Z",
  siteUrl: "sc-domain:example.test",
  email: "owner@example.test",
};

/** Google refusing a refresh, in its own shape. */
function googleRefuses(body: Record<string, unknown>) {
  globalThis.fetch = (async () => ({ ok: false, json: async () => body })) as any;
}

describe("1. THE MESSAGE NAMES THE CAUSE, NOT JUST THE STATUS", () => {
  it("SAYS invalid_grant, WHICH IS THE FIELD THAT MEANS SOMETHING", async () => {
    // The exact answer Google gave for three days.
    googleRefuses({ error: "invalid_grant", error_description: "Bad Request" });
    await expect(validAccessToken(CONN as any)).rejects.toThrow(/invalid_grant/);
    await expect(validAccessToken(CONN as any)).rejects.toThrow(/Bad Request/);
  });

  it("AND STILL SAYS WHAT TO DO ABOUT IT", async () => {
    // A cause with no instruction is a log line. The owner needs the
    // next step in the same sentence.
    googleRefuses({ error: "invalid_grant", error_description: "Bad Request" });
    await expect(validAccessToken(CONN as any)).rejects.toThrow(/reconnect it in Integrations/);
  });

  it("and it manages with whichever field Google sends", async () => {
    googleRefuses({ error: "invalid_client" });
    await expect(validAccessToken(CONN as any)).rejects.toThrow(/invalid_client/);
    googleRefuses({ error_description: "something unexpected" });
    await expect(validAccessToken(CONN as any)).rejects.toThrow(/something unexpected/);
    // AND NEVER AN EMPTY BRACKET. A refusal with no body at all still
    // has to read as a sentence.
    googleRefuses({});
    await expect(validAccessToken(CONN as any)).rejects.toThrow(/the refresh was refused/);
  });

  it("a token with time left on it is not refreshed at all", async () => {
    // The guard this whole path sits behind: nothing is asked of Google
    // while the current token is good, so a dead refresh token is
    // invisible until the hour runs out.
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return { ok: true, json: async () => ({}) };
    }) as any;
    const fresh = { ...CONN, tokenExpiry: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
    await expect(validAccessToken(fresh as any)).resolves.toEqual({ accessToken: "stale" });
    expect(called).toBe(false);
  });
});

describe("2. AND THE OWNER IS TOLD, ONCE", () => {
  /**
   * The tables this path reads, in the shapes it reads them.
   *
   * `lastRunSucceeded` is what decides whether the break is NEW:
   * runAndLog writes its row AFTER the runner returns, so the newest
   * row is the previous run.
   */
  function db(opts: { lastRunSucceeded?: boolean | null; historyError?: string } = {}) {
    return {
      from(table: string) {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () =>
            Promise.resolve(
              opts.historyError
                ? { data: null, error: { message: opts.historyError } }
                : { data: opts.lastRunSucceeded === null || opts.lastRunSucceeded === undefined ? [] : [{ success: opts.lastRunSucceeded }], error: null }
            ),
          maybeSingle: () =>
            Promise.resolve({
              data:
                table === "dealerships"
                  ? {
                      search_console_access_token: "stale",
                      search_console_refresh_token: "dead-at-google",
                      search_console_token_expiry: "2026-11-01T00:00:00.000Z",
                      search_console_site_url: "sc-domain:example.test",
                      search_console_email: "owner@example.test",
                    }
                  : table === "websites"
                    ? { slug: "a-business" }
                    : null,
              error: null,
            }),
        };
        return chain;
      },
    };
  }

  it("TELLS HIM ON THE DAY IT BREAKS, WITH GOOGLE'S OWN REASON", async () => {
    googleRefuses({ error: "invalid_grant", error_description: "Bad Request" });
    const client = db({ lastRunSucceeded: true });
    await expect(syncSearchQueries(client, "d1")).rejects.toThrow(/invalid_grant/);

    expect(notes, "nothing told the owner his connection died").toHaveLength(1);
    expect(notes[0].kind).toBe("integration_disconnected");
    expect(notes[0].title).toMatch(/reconnect/i);
    expect(String(notes[0].body)).toMatch(/invalid_grant/);
    // AND IT SAYS WHAT HE LOSES, not just that something failed. "Your
    // real search terms have stopped updating" is the consequence; the
    // error code is the cause.
    expect(String(notes[0].body)).toMatch(/search terms have stopped updating/);
    expect(notes[0].href).toContain("integrations");
  });

  it("AND NOT AGAIN THE NEXT MORNING", async () => {
    // A notification a day about the same dead connection is one he
    // learns to ignore, which ends where not telling him ends.
    googleRefuses({ error: "invalid_grant", error_description: "Bad Request" });
    const client = db({ lastRunSucceeded: false });
    await expect(syncSearchQueries(client, "d1")).rejects.toThrow();
    expect(notes).toEqual([]);
  });

  it("AND THE JOB STILL FAILS, so the health panel does not go green", async () => {
    // If this swallowed the error the subsystem would report a clean
    // run for a morning it read nothing — which is the fault being
    // fixed, wearing the opposite clothes.
    googleRefuses({ error: "invalid_grant" });
    const client = db({ lastRunSucceeded: true });
    await expect(syncSearchQueries(client, "d1")).rejects.toThrow(/Couldn't refresh Search Console access/);
  });

  it("AN UNREADABLE HISTORY TELLS HIM ANYWAY", async () => {
    // With no way to know whether he has been told, one extra
    // notification costs nothing beside the cost of silence.
    vi.spyOn(console, "error").mockImplementation(() => {});
    googleRefuses({ error: "invalid_grant" });
    const client = db({ historyError: "relation does not exist" });
    await expect(syncSearchQueries(client, "d1")).rejects.toThrow();
    expect(notes).toHaveLength(1);
  });

  it("AND A TELLING THAT ITSELF FAILS DOES NOT CHANGE THE JOB'S ERROR", async () => {
    // A MUTATION SURVIVED WITHOUT THIS. If the telling rethrows, the
    // error the job records becomes "notifications table is
    // unreachable" and Google's `invalid_grant` is gone — the failure
    // would hide the thing it is about, which is the exact fault this
    // whole commit is fixing.
    //
    // My other failure cases return an error OBJECT rather than
    // throwing, so the catch inside the telling was never entered and
    // the mutation was invisible.
    vi.spyOn(console, "error").mockImplementation(() => {});
    tellingThrows = true;
    googleRefuses({ error: "invalid_grant", error_description: "Bad Request" });
    const client = db({ lastRunSucceeded: true });
    await expect(syncSearchQueries(client, "d1")).rejects.toThrow(/invalid_grant/);
    expect(notes).toEqual([]);
  });

  it("and a first-ever run that dies also tells him", async () => {
    // No history at all is not "already told".
    googleRefuses({ error: "invalid_grant" });
    const client = db({ lastRunSucceeded: null });
    await expect(syncSearchQueries(client, "d1")).rejects.toThrow();
    expect(notes).toHaveLength(1);
  });
});

describe("3. the kind the database will accept", () => {
  it("IS GENERIC, so the next dead integration needs no migration", () => {
    // Gmail, YouTube and Ads hold refresh tokens from the same Google
    // app and can die the same way. A kind per integration would mean a
    // migration per integration.
    //
    // READ THROUGH sql(), AND THE FIRST VERSION DID NOT — which is the
    // whole point of that helper. The migration's own header explains
    // why the kind is NOT 'search_console_disconnected', naming the
    // string, so the raw file both contains and does not contain it.
    // `code()` strips // and /* */ and leaves every `--` standing.
    const migration = sqlOf("supabase/migrations/219_notification_kind_integration_disconnected.sql");
    expect(migration).toMatch(/'integration_disconnected'/);
    expect(migration).not.toMatch(/'search_console_disconnected'/);
    expect(code("src/lib/notifications/emit.ts")).toMatch(/"integration_disconnected"/);
  });

  it("AND KEEPS EVERY KIND THAT WAS ALREADY THERE", () => {
    // Drop-and-recreate, so an omission silently stops an existing
    // notification from being written at all.
    const migration = sqlOf("supabase/migrations/219_notification_kind_integration_disconnected.sql");
    for (const kind of ["competitor_alert", "goal_completed", "platform_ai_unavailable", "autonomy_lowered"]) {
      expect(migration, `${kind} would stop being writable`).toContain(`'${kind}'`);
    }
  });

  it("and it supersedes 218, so running it alone is enough", () => {
    // He has not run 218 yet. Two pending migrations where the second
    // contains the first is one instruction, not two.
    const sql = sourceWithComments("supabase/migrations/219_notification_kind_integration_disconnected.sql");
    expect(sql).toMatch(/running this one alone is enough/);
    const older = sqlOf("supabase/migrations/218_notification_kind_autonomy_lowered.sql");
    const kinds = (older.match(/'([a-z_]+)'/g) ?? []).map((m) => m.replace(/'/g, ""));
    expect(kinds.length, "218's CHECK clause was not found").toBeGreaterThan(15);
    const newer = sqlOf("supabase/migrations/219_notification_kind_integration_disconnected.sql");
    for (const kind of kinds) expect(newer, `${kind} is in 218 and not in 219`).toContain(`'${kind}'`);
  });
});
