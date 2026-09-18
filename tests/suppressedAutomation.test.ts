// Automated email never writes an email for an unsubscribed address.
//
// THE LIVE CASE (16-18 Sept 2026): email_automation_log showed the same
// recipient three mornings running — "Not sent: … has unsubscribed from
// this business's emails". Nothing was sent (the refusal worked), but every
// morning an AI-written welcome email was generated and thrown away, a
// failure row was logged, and the lead was left un-welcomed to be picked
// up again the next day. An unsubscribe is permanent until the person opts
// back in, so it is now checked BEFORE writing, and isn't an attempt at all.
//
// A real send failure (a bad address, a provider error) still retries — that
// may be temporary. Custom workflows had the same loop; their non-email
// steps still run for an unsubscribed lead.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; op: string; values: any }[];
let failing: Set<string>;

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (failing.has(`${table}:${op}`)) return { data: null, error: { message: "timeout" } };
      if (op !== "select") {
        writes.push({ table, op, values: payload });
        if (op === "insert") (tables[table] ??= []).push({ ...payload });
        if (op === "update") for (const r of rows()) Object.assign(r, payload);
        return { data: null, error: null };
      }
      const found = rows();
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      lt: () => api,
      is: (k: string, v: any) => (filters.push((r) => (r[k] ?? null) === v), api),
      not: (k: string, operator: string, v: any) => (operator === "is" ? filters.push((r) => (r[k] ?? null) !== v) : undefined, api),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), api),
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      update: (v: any) => ((op = "update"), (payload = v), api),
      upsert: (v: any) => ((op = "upsert"), (payload = v), api),
      maybeSingle: async () => run(true),
      single: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from };
}

// The AI writer and the sender are counted, not exercised: this is about
// whether an email is written at all.
const generateEmailContent = vi.fn(async (..._a: any[]) => ({ output: { subject: "Welcome", headline: "Welcome", intro: "Hi", body: "Hi there" }, claimsRemoved: [] as string[] }));
vi.mock("@/lib/agents/emailMarketingAgent", () => ({ generateEmailContent: (...a: any[]) => generateEmailContent(...a) }));
const sendMarketingEmail = vi.fn(async (..._a: any[]): Promise<any> => ({ success: true, via: "resend", resendMessageId: "re_1" }));
vi.mock("@/lib/email/sendMarketingEmail", () => ({ sendMarketingEmail: (...a: any[]) => sendMarketingEmail(...a) }));
vi.mock("@/lib/claims/businessFacts", async (orig) => ({ ...(await orig<typeof import("@/lib/claims/businessFacts")>()), gatherBusinessFactsSafely: async () => ({ products: [] }) }));

import { runEmailAutomation } from "@/lib/automation/emailAutomation";
import { runWorkflows } from "@/lib/automation/workflowEngine";
import { suppressedAmong } from "@/lib/email/consent";

const UNSUB = "qadriovaiz@gmail.com";

beforeEach(() => {
  tables = {
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", welcome_email_auto_enabled: true, follow_up_email_auto_enabled: false, gmail_email: "shop@gmail.com" }],
    brand_profiles: [],
    leads: [
      // Stored with different capitals from the suppression row, as real data is.
      { id: "L1", dealership_id: "d1", name: "Ovaiz Test", email: "Qadriovaiz@Gmail.com", dnd_opt_out: false, welcome_email_sent_at: null, created_at: "2026-09-01T00:00:00Z" },
      { id: "L2", dealership_id: "d1", name: "Asha", email: "asha@example.com", dnd_opt_out: false, welcome_email_sent_at: null, created_at: "2026-09-01T00:00:00Z" },
    ],
    email_suppressions: [
      { dealership_id: "d1", email: UNSUB, reason: "unsubscribed" },
      // Another business's list never blocks this one.
      { dealership_id: "d2", email: "asha@example.com", reason: "unsubscribed" },
    ],
    email_automation_log: [],
  };
  writes = [];
  failing = new Set();
  generateEmailContent.mockClear();
  sendMarketingEmail.mockClear();
  sendMarketingEmail.mockImplementation(async () => ({ success: true, via: "resend", resendMessageId: "re_1" }));
});

const writtenFor = () => generateEmailContent.mock.calls.length;
const sentTo = () => sendMarketingEmail.mock.calls.map((c: any[]) => c[2]);
const logRows = () => writes.filter((w) => w.table === "email_automation_log");

describe("welcome emails: an unsubscribed address is never written to", () => {
  it("the live case: no email is written, sent or logged for them; the other lead is welcomed", async () => {
    const r = await runEmailAutomation(db(), "d1");
    expect(r.welcomesSent).toBe(1);
    expect(writtenFor()).toBe(1);
    expect(sentTo()).toEqual(["asha@example.com"]);
    expect(logRows().map((w) => w.values.recipient)).toEqual(["asha@example.com"]);
  });

  it("three mornings in a row: still nothing written for them — the loop is gone", async () => {
    for (let day = 0; day < 3; day++) await runEmailAutomation(db(), "d1");
    // Asha once (then marked welcomed); the unsubscribed address never.
    expect(writtenFor()).toBe(1);
    expect(sentTo()).not.toContain("Qadriovaiz@Gmail.com");
    expect(logRows().some((w) => String(w.values.recipient).toLowerCase() === UNSUB)).toBe(false);
  });

  it("an unreadable unsubscribe list stops the run before anything is written", async () => {
    failing.add("email_suppressions:select");
    const r = await runEmailAutomation(db(), "d1");
    expect(r).toMatchObject({ welcomesSent: 0, skipped: expect.stringContaining("unsubscribe list unreadable") });
    expect(writtenFor()).toBe(0);
    expect(sendMarketingEmail).not.toHaveBeenCalled();
  });

  it("a real send failure is still retried the next morning — it may be temporary", async () => {
    tables.email_suppressions = [];
    tables.leads = [tables.leads[1]];
    sendMarketingEmail.mockImplementationOnce(async () => ({ success: false, error: "Resend: temporarily unavailable" }));
    await runEmailAutomation(db(), "d1");
    expect(tables.leads[0].welcome_email_sent_at).toBeNull();
    await runEmailAutomation(db(), "d1");
    expect(writtenFor()).toBe(2);
    expect(tables.leads[0].welcome_email_sent_at).not.toBeNull();
  });

  it("opting back in (off the list) means they're welcomed again", async () => {
    tables.email_suppressions = [];
    await runEmailAutomation(db(), "d1");
    expect(sentTo()).toContain("Qadriovaiz@Gmail.com");
  });
});

describe("follow-up emails get the same check", () => {
  it("no follow-up is written for an unsubscribed address", async () => {
    tables.dealerships[0].welcome_email_auto_enabled = false;
    tables.dealerships[0].follow_up_email_auto_enabled = true;
    tables.leads = tables.leads.map((l) => ({ ...l, follow_up_email_sent_at: null, status: "new" }));
    await runEmailAutomation(db(), "d1");
    expect(sentTo()).toEqual(["asha@example.com"]);
    expect(writtenFor()).toBe(1);
  });
});

describe("custom workflows: no email step for an unsubscribed lead, other steps still run", () => {
  beforeEach(() => {
    tables.workflows = [
      {
        id: "wf1", dealership_id: "d1", enabled: true, trigger_type: "new_lead", name: "Welcome flow",
        workflow_steps: [
          { id: "s1", step_order: 0, delay_days: 0, action_type: "email", email_task_type: "welcome_email" },
          { id: "s2", step_order: 1, delay_days: 0, action_type: "queue_content", content_type: "instagram_post", content_topic: "new arrivals" },
        ],
      },
    ];
    tables.workflow_step_runs = [];
    tables.agent_tasks = [];
  });

  it("the unsubscribed lead's email step writes nothing and records nothing; its content step still queues", async () => {
    await runWorkflows(db(), "d1");
    expect(sentTo()).toEqual(["asha@example.com"]);
    expect(writtenFor()).toBe(1);
    const stepRuns = writes.filter((w) => w.table === "workflow_step_runs").map((w) => [w.values.step_id, w.values.lead_id]);
    expect(stepRuns).not.toContainEqual(["s1", "L1"]);
    expect(stepRuns).toContainEqual(["s2", "L1"]);
  });

  it("an unreadable unsubscribe list writes nothing and says why", async () => {
    failing.add("email_suppressions:select");
    const r = await runWorkflows(db(), "d1");
    expect(r).toMatchObject({ stepsSent: 0, skipped: expect.stringContaining("unsubscribe list unreadable") });
    expect(writtenFor()).toBe(0);
  });
});

describe("the list check itself", () => {
  it("matches regardless of capitals, only for this business, and reads once", async () => {
    const got = await suppressedAmong(db(), "d1", ["QADRIOVAIZ@gmail.com", "asha@example.com", null]);
    expect([...got]).toEqual([UNSUB]);
  });

  it("an empty list of addresses needs no read", async () => {
    failing.add("email_suppressions:select");
    expect([...(await suppressedAmong(db(), "d1", []))]).toEqual([]);
  });

  it("an unreadable list throws — never 'nobody unsubscribed'", async () => {
    failing.add("email_suppressions:select");
    await expect(suppressedAmong(db(), "d1", ["a@b.co"])).rejects.toThrow(/unsubscribe list/);
  });
});
