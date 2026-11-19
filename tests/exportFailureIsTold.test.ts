// A weekly export that fails, fails silently forever — 19 November 2026.
//
// THE FLAG: one business gets the weekly leads email and another never
// does.
//
// WHAT THE CODE SETTLES. The daily run plans jobs for EVERY business
// with no filter (dailyJobs.planDailyJobs), and `lead_export` is the
// first subsystem in the `signals` group, so no business is starved by
// another's work. The export is gated per business on
// `lead_export_frequency`, then on an owner email, then on reading the
// leads, then on the send.
//
// WHAT THE CODE CANNOT SETTLE is which of those a given business is
// failing at — that is production data, and migration 235 carries the
// two read-only queries that answer it.
//
// WHAT IS A DEFECT EITHER WAY: every one of those failures was
// recorded and NONE of them was told to anybody. It went to
// lead_export_log, and buildExportHealth showed "failing" on the
// Autopilot page — a screen somebody has to open. So an export that
// fails every Monday keeps failing every Monday, and the owner's only
// evidence is an email that never arrives, which looks exactly like
// the feature not existing.
//
// That is the same shape as the campaign that read Active for seventy
// days: the truth existed, on a page nobody opened.

import { describe, it, expect } from "vitest";
import { isExportDue, buildExportHealth } from "@/lib/leads/scheduledExport";
import { GROUPS } from "@/lib/automation/cronGroups";
import { code, sql, sourceWithComments } from "./helpers/source";

const EXPORT = "src/lib/leads/scheduledExport.ts";
const MIGRATION = "supabase/migrations/235_notification_kind_export_failed.sql";

describe("1. EVERY FAILURE PATH NOW SAYS SO", () => {
  const src = () => code(EXPORT);

  it("THE LOAD-BEARING ONE: no owner email notifies, and does not just return", () => {
    // The likeliest permanent cause, and the one that produces "this
    // business never gets it": a null owner_id, or an owner whose auth
    // user no longer exists.
    const s = src();
    const at = s.indexOf("const to = await ownerEmail(");
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at, at + 700);
    expect(block).toMatch(/await tellOwner\(/);
    expect(block).toMatch(/couldn't find the owner's email/i);
  });

  it("SO DOES A FAILED LEADS READ", () => {
    const s = src();
    const at = s.indexOf("leads = await fetchLeadsForExport(");
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(at, at + 400)).toMatch(/await tellOwner\(/);
  });

  it("AND SO DOES A FAILED SEND", () => {
    const s = src();
    const at = s.indexOf("const result = await sendViaResend(");
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(at, at + 600)).toMatch(/await tellOwner\(/);
  });

  it("THREE PATHS, THREE CALLS — none left silent", () => {
    // Counted, because a fourth failure path added later without one
    // is this bug coming back.
    expect((src().match(/await tellOwner\(/g) ?? [])).toHaveLength(3);
  });

  it("A SUCCESSFUL EXPORT TELLS NOBODY ANYTHING", () => {
    // It is not news. The owner gets the export itself.
    const s = src();
    const at = s.indexOf("const { error: updateError } = await service");
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(at, at + 400)).not.toMatch(/tellOwner/);
  });
});

describe("2. IT SAYS IT ONCE PER CAUSE, NOT EVERY MONDAY", () => {
  it("THE DEDUPE KEY IS THE CAUSE, with no date in it", () => {
    // The same failure every week is one thing to fix. A weekly repeat
    // of it is what makes an owner stop reading — the same rule the
    // rejection cooldown and the delivery watch both state.
    const s = code(EXPORT);
    expect(s).toMatch(/dedupeKey: `export_failed:\$\{why\.slice\(0, 60\)\}`/);
    expect(s).not.toMatch(/export_failed:\$\{.*toISOString/);
  });

  it("AND THE MESSAGE DOES NOT ALARM ABOUT THE LEADS", () => {
    // Only the email failed. An owner who reads this as "my leads are
    // gone" has been told something false.
    const s = code(EXPORT);
    expect(s).toMatch(/Nothing about your leads has changed — only the email failed\./);
  });

  it("it points at the page that explains more", () => {
    expect(code(EXPORT)).toMatch(/href: "\/dashboard\/autopilot"/);
  });
});

describe("3. WHAT THE CODE ALREADY GUARANTEED, PINNED", () => {
  it("THE EXPORT IS FIRST IN THE FAST GROUP, so no business is starved", () => {
    // cronGroups' own header records the incident where one business's
    // welcome emails went five days without running because other
    // businesses' AI work came first. The export leads the group that
    // runs first, and this keeps it there.
    expect(GROUPS.signals[0]).toBe("lead_export");
  });

  it("A BUSINESS THAT HAS NEVER EXPORTED STILL GETS ITS MONDAY", () => {
    // 2026-11-23 is a Monday. The catch-up clause requires a previous
    // send, so a never-exported business depends entirely on the
    // weekday test — if that were wrong, it would be "never".
    expect(isExportDue("weekly", null, "2026-11-23")).toBe(true);
    expect(isExportDue("weekly", null, "2026-11-24")).toBe(false);
  });

  it("AND A MISSED MONDAY IS CAUGHT UP, not skipped for a week", () => {
    expect(isExportDue("weekly", "2026-11-09T03:00:00.000Z", "2026-11-18")).toBe(true);
  });

  it("off is off", () => {
    expect(isExportDue("off", null, "2026-11-23")).toBe(false);
  });

  it("A FAILING EXPORT ALREADY READ AS FAILING — it was just never sent anywhere", () => {
    // The health card was right all along. This commit does not fix
    // the diagnosis; it fixes who hears it.
    const health = buildExportHealth({
      frequency: "weekly",
      latest: { created_at: "2026-11-17T03:00:00.000Z", success: false, error: "the owner's email couldn't be read", row_count: null, new_count: null },
      lastRun: null,
    });
    expect(health.state).toBe("failing");
    expect(health.note).toMatch(/owner's email/);
  });
});

describe("4. THE MIGRATION, AND THE QUERIES THAT SETTLE THE REST", () => {
  it("IT EXTENDS THE CONSTRAINT RATHER THAN REPLACING THE LIST", () => {
    const m = sql(MIGRATION);
    expect(m).toMatch(/drop constraint if exists notifications_kind_check/);
    expect(m).toMatch(/'scheduled_export_failed'/);
    // 234's value must still be there — the constraint is
    // drop-and-recreate, so an omission silently un-ships commit 7.
    expect(m).toMatch(/'campaign_not_delivering'/);
    expect(m).toMatch(/'integration_disconnected'/);
  });

  it("THE DIAGNOSTIC QUERIES ARE THERE, AND COMMENTED OUT", () => {
    // The root cause is production data. These are what answer it, and
    // they must not run as part of the migration.
    const raw = sourceWithComments(MIGRATION);
    expect(raw).toMatch(/from dealerships d/);
    expect(raw).toMatch(/from lead_export_log l/);
    expect(sql(MIGRATION)).not.toMatch(/\bselect\b/i);
  });
});
