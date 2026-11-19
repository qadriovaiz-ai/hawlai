// The columns the ads code reads must exist in a migration — 19 November 2026.
//
// WHAT WAS WRONG. `src/lib/ads/adAccountLimits.ts` SELECTs four columns
// off `dealerships` that NO migration in this repository creates:
// fb_min_daily_budget, fb_currency, fb_account_status and
// fb_limits_checked_at. `/api/ads/preview` and the adlaunch account
// check both read them.
//
// PostgREST rejects an ENTIRE select when one column is missing, so this
// is not a feature that degrades — it is two ad routes that 500. They
// work today only because the columns were added to production by hand.
// A new environment built from this repository would have had both
// routes broken with nothing to explain it, because `supabase/migrations/`
// is supposed to be the source of truth for the schema and for these
// four columns it silently was not.
//
// Migration 233 records what production already has (verified against
// information_schema on 19 November 2026), so it is a no-op there.
//
// THIS TEST IS THE GENERAL GUARD, not a check on 233. It reads the
// column list out of the TypeScript and requires each one to be created
// somewhere in supabase/migrations/. Adding a fifth column to the SELECT
// without a migration fails here, which is the whole point — the next
// instance of this bug is caught at the moment it is written rather than
// in production months later.

import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { LIMITS_SELECT, limitsFromRow, isStale } from "@/lib/ads/adAccountLimits";
import { code, sql, sourceWithComments } from "./helpers/source";

const MIGRATIONS = "supabase/migrations";
const SOURCE = "src/lib/ads/adAccountLimits.ts";
const MIGRATION = `${MIGRATIONS}/233_fb_ad_account_limits.sql`;

/** Every migration, comments stripped, as one string. */
function allMigrations(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => sql(`${MIGRATIONS}/${f}`))
    .join("\n");
}

/**
 * The columns LIMITS_SELECT actually names, read from the source.
 *
 * Sliced to the declaration before anchoring: `LIMITS_SELECT` appears in
 * import lines and in other files, and indexOf on the bare name would
 * land on one of those rather than on the string being asserted.
 */
function selectedColumns(): string[] {
  const src = code(SOURCE);
  const at = src.indexOf("export const LIMITS_SELECT");
  expect(at).toBeGreaterThan(-1);
  const literal = src.slice(at).match(/"([^"]+)"/);
  expect(literal).not.toBeNull();
  return literal![1].split(",").map((c) => c.trim()).filter(Boolean);
}

describe("1. EVERY COLUMN THE CODE READS IS CREATED BY A MIGRATION", () => {
  it("LIMITS_SELECT NAMES THE FOUR COLUMNS, so the list under test is the real one", () => {
    // If this ever reads differently the assertions below are testing
    // something else, so it is pinned rather than assumed.
    expect(selectedColumns()).toEqual([
      "fb_min_daily_budget",
      "fb_currency",
      "fb_account_status",
      "fb_limits_checked_at",
    ]);
  });

  it("THE LOAD-BEARING ONE: each one is added to dealerships somewhere in migrations", () => {
    // THE DEFECT THIS CATCHES. Not "233 is correct" — that would pass on
    // a file nothing reads. This reads the column list out of the
    // TypeScript and requires a migration for each, so a fifth column
    // added to the SELECT with no migration fails here.
    const migrations = allMigrations();
    for (const column of selectedColumns()) {
      expect(
        new RegExp(`add column if not exists\\s+${column}\\b`).test(migrations),
        `${column} is read by ${SOURCE} but no migration creates it`
      ).toBe(true);
    }
  });

  it("and so is fb_ad_account_id, which getAdAccountLimits reads alongside them", () => {
    expect(allMigrations()).toMatch(/add column if not exists\s+fb_ad_account_id\b/);
  });
});

describe("2. THE MIGRATION IS A NO-OP ON PRODUCTION", () => {
  const migration = () => sql(MIGRATION);

  it("EVERY ADD IS GUARDED, because production already has all four", () => {
    // Verified against information_schema on 19 November 2026: the
    // columns exist in production. A bare `add column` would fail the
    // whole migration there.
    const adds = migration().match(/alter table dealerships\s+add column[^;]*/g) ?? [];
    expect(adds).toHaveLength(4);
    for (const add of adds) expect(add).toMatch(/add column if not exists/);
  });

  it("IT CHANGES NO DATA AT ALL — no update, no delete, no default", () => {
    // A migration that backfills would overwrite the cached readings
    // production already holds, and `fb_limits_checked_at` is what
    // staleness is computed from: a default of now() would make every
    // account look freshly checked when none had been.
    const m = migration();
    expect(m).not.toMatch(/\bupdate\s+dealerships/i);
    expect(m).not.toMatch(/\bdelete\s+from/i);
    expect(m).not.toMatch(/\bdefault\b/i);
    expect(m).not.toMatch(/\bdrop\b/i);
  });

  it("THE TYPES ARE THE ONES PRODUCTION REPORTED, not the ones the TypeScript suggests", () => {
    // `minDailyBudget` is a number in TS, which says nothing about
    // whether the column is integer, bigint or numeric. These four were
    // read back from information_schema, and a fresh database has to
    // match production or the same drift starts again in the other
    // direction.
    const m = migration();
    expect(m).toMatch(/add column if not exists fb_min_daily_budget integer/);
    expect(m).toMatch(/add column if not exists fb_currency text/);
    expect(m).toMatch(/add column if not exists fb_account_status integer/);
    expect(m).toMatch(/add column if not exists fb_limits_checked_at timestamptz/);
  });

  it("IT CARRIES A VERIFY QUERY, AND THE QUERY IS COMMENTED OUT", () => {
    // Every migration here ships with the query that proves it worked,
    // because the owner runs all SQL by hand and needs something to read
    // back. It has to stay inside `--`: an executable select at the end
    // of a migration runs on every deploy for no reason, and a verify
    // query is for a person to run and look at, not for the migration to
    // perform on itself.
    expect(sourceWithComments(MIGRATION)).toMatch(/information_schema/);
    expect(sql(MIGRATION)).not.toMatch(/information_schema/);
    expect(sql(MIGRATION)).not.toMatch(/\bselect\b/i);
  });
});

describe("3. THE COLUMNS STILL MEAN WHAT THE CODE THINKS THEY MEAN", () => {
  it("A ROW WITH NOTHING CACHED READS AS STALE, not as fresh", () => {
    // The reason `fb_limits_checked_at` must have no default: null is
    // "never read", and it has to pull a fetch rather than pass as a
    // recent check.
    expect(isStale(null)).toBe(true);
    expect(isStale(undefined)).toBe(true);
  });

  it("and limitsFromRow reads exactly the columns the migration creates", () => {
    const limits = limitsFromRow({
      fb_min_daily_budget: 5000,
      fb_currency: "INR",
      fb_account_status: 1,
      fb_limits_checked_at: "2026-11-19T00:00:00.000Z",
    });
    expect(limits.minDailyBudget).toBe(5000);
    expect(limits.currency).toBe("INR");
    expect(limits.accountStatus).toBe(1);
  });

  it("AN ACCOUNT STATUS OF 0 IS NOT TREATED AS MISSING", () => {
    // `?? null` and `|| null` differ here, and 0 is a status Meta can
    // return. Pinned because the difference is invisible until it is
    // wrong.
    expect(limitsFromRow({ fb_account_status: 0 }).accountStatus).toBe(0);
  });
});
