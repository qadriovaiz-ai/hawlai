// Automation health for things that send is judged by what was sent.
//
// THE LIVE CASE (2026-09-15): the Automation Health card showed "Welcome &
// Follow-up Emails · 100% success (7d)". Every run in automation_run_log
// said {"skipped":"automation off"} and email_automation_log had 0 rows —
// no email had ever been sent. The run log counts any run that doesn't
// crash as a success. Custom Workflows had the same hollow row, and a
// worse bug underneath: a failed workflow email was recorded against its
// step and never retried, and the lead moved on to the next step.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; op: string; values: Row; opts?: any }[];

function db() {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op = "select";
    let values: Row = {};
    let opts: any;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const finish = () => {
      if (op !== "select") writes.push({ table, op, values, opts });
      return { data: op === "select" ? rows() : [], error: null };
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, lt: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] === v), api),
      gte: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] >= v), api),
      in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), api),
      insert: (v: Row) => ((op = "insert"), (values = v), api),
      upsert: (v: Row, o: any) => ((op = "upsert"), (values = v), (opts = o), api),
      update: (v: Row) => ((op = "update"), (values = v), api),
      maybeSingle: async () => ({ data: finish().data[0] ?? null, error: null }),
      single: async () => ({ data: finish().data[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(finish()).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
const sendMarketingEmail = vi.fn(async (..._a: any[]): Promise<any> => ({ success: true, via: "resend", resendMessageId: "re_wf" }));
vi.mock("@/lib/email/sendMarketingEmail", () => ({ sendMarketingEmail: (...a: any[]) => sendMarketingEmail(...a) }));

import { buildSendHealth, skipReason } from "@/lib/automation/sendHealth";
import { GET as getSettings } from "@/app/api/autopilot/settings/route";
import { runWorkflows } from "@/lib/automation/workflowEngine";
import { runEmailAutomation } from "@/lib/automation/emailAutomation";
vi.mock("@/lib/claims/businessFacts", async (orig) => ({ ...(await orig<typeof import("@/lib/claims/businessFacts")>()), gatherBusinessFactsSafely: async () => ({ products: [] }) }));
// The generator is covered elsewhere; here it only has to produce a clean draft.
vi.mock("@/lib/agents/emailMarketingAgent", () => ({ generateEmailContent: async () => ({ output: { subject: "Welcome", headline: "Welcome", intro: "Hi", body: "Hi Asha" }, claimsRemoved: [] }) }));

const recent = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
const run = (detail: Row, hoursAgo = 1, success = true) => ({ dealership_id: "d1", subsystem: "email_automation", success, detail: JSON.stringify(detail), created_at: recent(hoursAgo) });

const BASE = (): Record<string, Row[]> => ({
  profiles: [{ id: "owner-1", dealership_id: "d1" }],
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", gmail_email: "shop@gmail.com", content_autopilot_enabled: false }],
  workflows: [],
  auto_reply_log: [],
  email_automation_log: [],
  content_autopilot_log: [],
  automation_run_log: [],
  event_queue: [],
  agent_tasks: [],
  email_sends: [],
});

const health = async (subsystem: string) => {
  const res = await getSettings();
  const body = await res.json();
  return body.automationHealth.find((h: any) => h.subsystem === subsystem);
};

beforeEach(() => {
  tables = BASE();
  writes = [];
  sendMarketingEmail.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("the live case: seven runs, all 'automation off', no email ever sent", () => {
  it("is shown as Off with no success rate — not 100%", async () => {
    tables.automation_run_log = [1, 25, 49, 73, 97, 121, 145].map((h) => run({ welcomesSent: 0, followUpsSent: 0, skipped: "automation off" }, h));
    const row = await health("email_automation");
    expect(row).toMatchObject({
      kind: "sends",
      state: "off",
      note: "Off — welcome and follow-up emails aren't switched on",
      attempted: 0,
      successRatePct: null,
      lastSuccess: null,
    });
  });
});

describe("the emails row counts real sends and what happened to them", () => {
  beforeEach(() => {
    tables.automation_run_log = [run({ welcomesSent: 2, followUpsSent: 1 })];
  });

  it("sent, delivered, and bounced are counted; a bounce isn't a success", async () => {
    tables.email_automation_log = [
      { dealership_id: "d1", success: true, error: null, resend_message_id: "re_3", created_at: recent(2) },
      { dealership_id: "d1", success: true, error: null, resend_message_id: "re_2", created_at: recent(3) },
      { dealership_id: "d1", success: true, error: null, resend_message_id: "re_1", created_at: recent(4) },
      { dealership_id: "d1", success: false, error: "Not sent: asha@example.com has unsubscribed from this business's emails.", resend_message_id: null, created_at: recent(5) },
    ];
    tables.email_sends = [
      { resend_message_id: "re_3", delivery_status: "delivered" },
      { resend_message_id: "re_2", delivery_status: "delivered" },
      { resend_message_id: "re_1", delivery_status: "bounced" },
    ];
    expect(await health("email_automation")).toMatchObject({ state: "ok", attempted: 4, succeeded: 3, delivered: 2, problems: 1, successRatePct: 50, lastSuccess: true });
  });

  it("the latest email bouncing makes the row failing, with the reason", async () => {
    tables.email_automation_log = [{ dealership_id: "d1", success: true, error: null, resend_message_id: "re_9", created_at: recent(2) }];
    tables.email_sends = [{ resend_message_id: "re_9", delivery_status: "bounced" }];
    expect(await health("email_automation")).toMatchObject({ state: "failing", lastSuccess: false, lastError: "email bounced", successRatePct: 0 });
  });

  it("on, but nothing to send this week: idle, no rate", async () => {
    expect(await health("email_automation")).toMatchObject({ state: "idle", note: "Nothing sent in the last 7 days", successRatePct: null });
  });

  it("paused because the business address is missing says so", async () => {
    tables.automation_run_log = [run({ welcomesSent: 0, followUpsSent: 0, skipped: "business address missing" })];
    expect(await health("email_automation")).toMatchObject({ state: "paused", note: "Paused — add your business address in Settings → Brand Voice" });
  });

  it("a crashed run is failing, whatever was sent before", async () => {
    tables.automation_run_log = [{ ...run({}), success: false, detail: "leads table timeout" }];
    tables.email_automation_log = [{ dealership_id: "d1", success: true, error: null, resend_message_id: null, created_at: recent(30) }];
    expect(await health("email_automation")).toMatchObject({ state: "failing", note: "The last run failed: leads table timeout" });
  });

  it("other subsystems keep their run-based row", async () => {
    tables.automation_run_log.push({ dealership_id: "d1", subsystem: "lead_scoring", success: true, detail: "{}", created_at: recent(1) });
    expect(await health("lead_scoring")).toMatchObject({ successRatePct: 100, lastSuccess: true });
  });
});

describe("the workflows row", () => {
  it("'no enabled workflows' is Off, not 100%", async () => {
    tables.automation_run_log = [{ dealership_id: "d1", subsystem: "workflows", success: true, detail: JSON.stringify({ stepsSent: 0, skipped: "no enabled workflows" }), created_at: recent(1) }];
    expect(await health("workflows")).toMatchObject({ state: "off", note: "Off — no workflow is switched on", successRatePct: null });
  });

  it("counts step runs of this business's workflows", async () => {
    tables.workflows = [{ id: "wf1", dealership_id: "d1", name: "Welcome", enabled: true }];
    tables.automation_run_log = [{ dealership_id: "d1", subsystem: "workflows", success: true, detail: JSON.stringify({ stepsSent: 1 }), created_at: recent(1) }];
    tables.workflow_step_runs = [
      { workflow_id: "wf1", success: true, error: null, resend_message_id: "re_w", sent_at: recent(2) },
      { workflow_id: "other", success: false, error: "someone else's", resend_message_id: null, sent_at: recent(2) },
    ];
    tables.email_sends = [{ resend_message_id: "re_w", delivery_status: "delivered" }];
    expect(await health("workflows")).toMatchObject({ state: "ok", unit: "steps", attempted: 1, succeeded: 1, delivered: 1, successRatePct: 100 });
  });
});

describe("today's automation run row", () => {
  it("comes first on the card and shows this business's jobs for today", async () => {
    const { indiaToday } = await import("@/lib/expertise/seasonalCalendar");
    tables.daily_jobs = [
      { dealership_id: "d1", run_date: indiaToday(), subsystem: "email_automation", status: "done", error: null, started_at: recent(1), finished_at: recent(1) },
      { dealership_id: "d1", run_date: indiaToday(), subsystem: "content_autopilot", status: "failed", error: "Facebook token expired", started_at: recent(1), finished_at: recent(1) },
      { dealership_id: "d2", run_date: indiaToday(), subsystem: "workflows", status: "failed", error: "someone else's", started_at: recent(1), finished_at: recent(1) },
      { dealership_id: "d1", run_date: "2020-01-01", subsystem: "workflows", status: "failed", error: "long ago", started_at: recent(1), finished_at: recent(1) },
    ];
    const body = await (await getSettings()).json();
    expect(body.automationHealth[0]).toMatchObject({
      subsystem: "daily_run", kind: "daily", state: "failing", total: 2, done: 1,
      failed: [{ subsystem: "content_autopilot", error: "Facebook token expired" }],
    });
  });
});

describe("skip reasons", () => {
  it("are read from the logged run summary, even when it was cut off at 500 characters", () => {
    expect(skipReason(JSON.stringify({ stepsSent: 0, skipped: "gmail not connected" }))).toBe("gmail not connected");
    expect(skipReason(JSON.stringify({ stepsSent: 2, waiting: "gmail not connected" }))).toBe("gmail not connected");
    expect(skipReason('{"welcomesSent":0,"skipped":"business address missing","extra":"xxxxx')).toBe("business address missing");
    expect(skipReason("leads table timeout")).toBeNull();
  });

  it("an unknown skip reason isn't dressed up as healthy", () => {
    const h = buildSendHealth({ subsystem: "x", unit: "emails", attempts: [], deliveryStatus: {}, lastRun: { created_at: recent(1), success: true, detail: JSON.stringify({ skipped: "something new" }) } });
    expect(h).toMatchObject({ state: "idle", successRatePct: null, lastSuccess: null });
  });
});

describe("workflow sends", () => {
  const WORKFLOW = () => ({
    id: "wf1", dealership_id: "d1", enabled: true, trigger_type: "new_lead", name: "Welcome flow",
    workflow_steps: [
      { id: "s1", step_order: 0, delay_days: 0, action_type: "email", email_task_type: "custom", custom_subject: "Hi", custom_body: "Welcome!" },
      { id: "s2", step_order: 1, delay_days: 0, action_type: "email", email_task_type: "custom", custom_subject: "Still there?", custom_body: "Checking in." },
    ],
  });

  beforeEach(() => {
    tables.workflows = [WORKFLOW()];
    tables.leads = [{ id: "L1", dealership_id: "d1", name: "Asha", email: "asha@example.com", created_at: "2026-01-01T00:00:00Z", dnd_opt_out: false }];
    tables.workflow_step_runs = [];
    tables.brand_profiles = [];
  });

  it("a step that failed is retried next run — the lead doesn't skip ahead to the next email", async () => {
    tables.workflow_step_runs = [{ step_id: "s1", lead_id: "L1", success: false, error: "Resend timeout" }];
    await runWorkflows(db(), "d1");
    expect(sendMarketingEmail.mock.calls[0][3]).toMatchObject({ subject: "Hi" });
    const record = writes.find((w) => w.table === "workflow_step_runs")!;
    expect(record.op).toBe("upsert");
    expect(record.opts).toEqual({ onConflict: "step_id,lead_id" });
    expect(record.values).toMatchObject({ step_id: "s1", lead_id: "L1", success: true, error: null, resend_message_id: "re_wf" });
  });

  it("a step that succeeded is not sent again", async () => {
    tables.workflow_step_runs = [{ step_id: "s1", lead_id: "L1", success: true }];
    await runWorkflows(db(), "d1");
    expect(sendMarketingEmail).toHaveBeenCalledTimes(1);
    expect(sendMarketingEmail.mock.calls[0][3]).toMatchObject({ subject: "Still there?" });
  });

  it("no business address: nothing recorded against the step, and the run says why", async () => {
    sendMarketingEmail.mockImplementationOnce(async () => ({ success: false, refused: "no_address", error: "needs address" }));
    expect(await runWorkflows(db(), "d1")).toEqual({ stepsSent: 0, skipped: "business address missing" });
    expect(writes.filter((w) => w.table === "workflow_step_runs")).toEqual([]);
  });

  it("Gmail not connected: the run says so instead of a bare 0", async () => {
    tables.dealerships[0].gmail_email = null;
    expect(await runWorkflows(db(), "d1")).toEqual({ stepsSent: 0, skipped: "gmail not connected" });
    expect(sendMarketingEmail).not.toHaveBeenCalled();
  });
});

describe("welcome emails record their Resend message id", () => {
  it("so the health row can say whether each one was delivered", async () => {
    tables.dealerships[0].welcome_email_auto_enabled = true;
    tables.leads = [{ id: "L1", dealership_id: "d1", name: "Asha", email: "asha@example.com", dnd_opt_out: false }];
    tables.brand_profiles = [];
    sendMarketingEmail.mockImplementationOnce(async () => ({ success: true, via: "resend", resendMessageId: "re_welcome" }));
    await runEmailAutomation(db(), "d1");
    expect(writes.find((w) => w.table === "email_automation_log")?.values).toMatchObject({ success: true, resend_message_id: "re_welcome" });
  });
});

describe("the card includes email delivery tracking", () => {
  it("a delivery_tracking row, checked live with Resend", async () => {
    tables = BASE();
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const { resetDeliveryTrackingCache } = await import("@/lib/email/resendWebhook");
    resetDeliveryTrackingCache();
    try {
      const row = (await (await getSettings()).json()).automationHealth.find((h: any) => h.subsystem === "delivery_tracking");
      expect(row).toMatchObject({ kind: "delivery", state: "failing", note: expect.stringContaining("RESEND_API_KEY isn't set") });
    } finally {
      if (saved !== undefined) process.env.RESEND_API_KEY = saved;
    }
  });
});
