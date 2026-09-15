// "Send me my leads CSV every week" — safely, and honestly reported.
//
// APPROVED 2026-09-16: a sign-in download link in the email (never the
// file, never lead data in the inbox); the full list every time with how
// many are new; to the owner's login email only; set by the owner or an
// admin. These run the real export step, settings route and chat tool;
// only the database and Resend are faked.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; op: string; values: Row }[];
let failing: Set<string>;
let signedIn: string | null;
let ownerLookupFails: boolean;

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: ((r: Row) => boolean)[] = [];
    let orderBy: { key: string; asc: boolean } | null = null;
    let range: [number, number] | null = null;
    let limit: number | null = null;
    const rows = () => {
      let m = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (orderBy) m = [...m].sort((a, b) => (String(a[orderBy!.key]) < String(b[orderBy!.key]) ? -1 : 1) * (orderBy!.asc ? 1 : -1));
      if (range) m = m.slice(range[0], range[1] + 1);
      if (limit !== null) m = m.slice(0, limit);
      return m;
    };
    const finish = () => {
      if (failing.has(`${table}:${op}`)) return { data: null, error: { message: `${table} ${op} failed` } };
      if (op === "select") return { data: rows(), error: null };
      writes.push({ table, op, values });
      if (op === "update") for (const r of rows()) Object.assign(r, values);
      if (op === "insert") (tables[table] ??= []).push({ ...values, created_at: values.created_at ?? new Date().toISOString() });
      return { data: op === "update" ? rows() : [], error: null };
    };
    const api: any = {
      select: () => api, not: () => api, is: () => api, lt: () => api, lte: () => api, neq: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] === v), api),
      gte: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] >= v), api),
      in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), api),
      order: (k: string, o?: any) => ((orderBy = { key: k, asc: o?.ascending !== false }), api),
      range: (a: number, b: number) => ((range = [a, b]), api),
      limit: (n: number) => ((limit = n), api),
      insert: (v: Row) => ((op = "insert"), (values = v), api),
      update: (v: Row) => ((op = "update"), (values = v), api),
      maybeSingle: async () => {
        const r = finish();
        return r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null };
      },
      single: async () => {
        const r = finish();
        return r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null };
      },
      then: (res: any, rej: any) => Promise.resolve(finish()).then(res, rej),
    };
    return api;
  };
  return {
    from,
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { id: signedIn } : null } }),
      admin: {
        getUserById: async (id: string) =>
          ownerLookupFails ? { data: { user: null }, error: { message: "auth down" } } : { data: { user: id === "owner-1" ? { email: "owner@candle.example" } : null }, error: null },
      },
    },
  };
}

const sent: Row[] = [];
let resendFails = false;
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (p: Row) => (sent.push(p), resendFails ? { data: null, error: { message: "Resend is down" } } : { data: { id: "re_export" }, error: null }) };
  },
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));

import { isExportDue, nextExportDay, runScheduledLeadExport, buildExportHealth } from "@/lib/leads/scheduledExport";
import { GET as getSettings, PATCH as patchSettings } from "@/app/api/autopilot/settings/route";
import { executeTool, extractArtifact } from "@/lib/agents/masterBrainV2";

const STORE = (): Record<string, Row[]> => ({
  profiles: [{ id: "owner-1", dealership_id: "d1" }, { id: "mm-1", dealership_id: "d1" }, { id: "admin-1", dealership_id: "d1" }],
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", owner_id: "owner-1", lead_export_frequency: "weekly", lead_export_last_sent_at: "2026-09-14T03:00:00Z" }],
  team_members: [
    { dealership_id: "d1", user_id: "admin-1", role: "admin", status: "active" },
    { dealership_id: "d1", user_id: "mm-1", role: "marketing_manager", status: "active" },
  ],
  leads: [
    { dealership_id: "d1", name: "Asha", phone: "+91 98765 43210", email: "asha@example.com", created_at: "2026-09-01T10:00:00Z" },
    { dealership_id: "d1", name: "Ravi", phone: "9876500000", email: "ravi@example.com", created_at: "2026-09-16T10:00:00Z" },
    { dealership_id: "d1", name: "Meera", phone: "9876511111", email: null, created_at: "2026-09-20T10:00:00Z" },
  ],
  lead_export_log: [],
  workflows: [], auto_reply_log: [], email_automation_log: [], content_autopilot_log: [], automation_run_log: [], event_queue: [], agent_tasks: [], email_sends: [],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-21T03:00:00Z")); // Monday 21 Sep, 8:30 AM IST
  tables = STORE();
  writes = [];
  failing = new Set();
  signedIn = "owner-1";
  ownerLookupFails = false;
  resendFails = false;
  sent.length = 0;
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.NEXT_PUBLIC_SITE_URL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("when an export is due (India dates)", () => {
  it.each([
    ["weekly", null, "2026-09-21", true, "Monday, never sent"],
    ["weekly", null, "2026-09-16", false, "switched on mid-week — waits for Monday"],
    ["weekly", "2026-09-14T03:00:00Z", "2026-09-21", true, "the next Monday"],
    ["weekly", "2026-09-21T02:00:00Z", "2026-09-21", false, "already sent today (7:30 AM IST)"],
    ["weekly", "2026-09-20T20:00:00Z", "2026-09-21", false, "sent at 1:30 AM IST today — still 20 Sep in UTC"],
    ["weekly", "2026-09-14T03:00:00Z", "2026-09-22", true, "Monday was missed — caught up Tuesday"],
    ["weekly", "2026-09-21T03:00:00Z", "2026-09-23", false, "a Wednesday after a sent Monday"],
    ["monthly", null, "2026-10-01", true, "the 1st"],
    ["monthly", "2026-09-01T03:00:00Z", "2026-09-21", false, "mid-month"],
    ["monthly", "2026-08-01T03:00:00Z", "2026-09-03", true, "the 1st was missed — caught up"],
    ["off", null, "2026-09-21", false, "off"],
  ] as [string, string | null, string, boolean, string][])("%s, last sent %s, on %s → %s (%s)", (frequency, last, today, due) => {
    expect(isExportDue(frequency as any, last as any, today)).toBe(due);
  });

  it("the next export day", () => {
    expect(nextExportDay("weekly", "2026-09-16")).toBe("2026-09-21");
    expect(nextExportDay("monthly", "2026-09-16")).toBe("2026-10-01");
    expect(nextExportDay("off", "2026-09-16")).toBeNull();
  });
});

describe("the weekly export email", () => {
  it("goes to the owner with counts and a sign-in link — no lead data, no attachment", async () => {
    const r = await runScheduledLeadExport(db(), "d1");
    expect(r).toEqual({ sent: true, rows: 3, newRows: 2 });

    expect(sent).toHaveLength(1);
    const email = sent[0];
    expect(email.to).toBe("owner@candle.example");
    expect(email.from).toBe("Hawlai <hello@mail.hawlai.online>");
    expect(email.subject).toBe("Your weekly leads export — 3 leads, 2 new");
    expect(email.text).toContain("3 leads in total, 2 new since your last export.");
    expect(email.text).toContain("https://hawlai.online/api/leads/export");
    expect(email.attachments).toBeUndefined();
    for (const personal of ["Asha", "Ravi", "Meera", "98765", "asha@example.com", "ravi@example.com"]) {
      expect(`${email.subject}\n${email.text}\n${email.html}`).not.toContain(personal);
    }
  });

  it("is logged and recorded as sent, so it isn't sent twice today", async () => {
    await runScheduledLeadExport(db(), "d1");
    expect(tables.lead_export_log[0]).toMatchObject({ dealership_id: "d1", frequency: "weekly", recipient: "owner@candle.example", row_count: 3, new_count: 2, success: true, error: null, resend_message_id: "re_export" });
    expect(tables.dealerships[0].lead_export_last_sent_at).toBe("2026-09-21T03:00:00.000Z");
    expect(await runScheduledLeadExport(db(), "d1")).toEqual({ skipped: "not due" });
    expect(sent).toHaveLength(1);
  });

  it("off, or not the day: nothing is sent", async () => {
    vi.setSystemTime(new Date("2026-09-23T03:00:00Z"));
    tables.dealerships[0].lead_export_last_sent_at = "2026-09-21T03:00:00Z";
    expect(await runScheduledLeadExport(db(), "d1")).toEqual({ skipped: "not due" });
    tables.dealerships[0].lead_export_frequency = "off";
    expect(await runScheduledLeadExport(db(), "d1")).toEqual({ skipped: "export off" });
    expect(sent).toEqual([]);
  });

  it("if sending fails it's logged as a failure and tried again tomorrow", async () => {
    resendFails = true;
    expect(await runScheduledLeadExport(db(), "d1")).toEqual({ error: "Resend is down" });
    expect(tables.lead_export_log[0]).toMatchObject({ success: false, error: "Resend is down" });
    expect(tables.dealerships[0].lead_export_last_sent_at).toBe("2026-09-14T03:00:00Z");
  });

  it("if the owner's email can't be read, nothing goes to anyone else", async () => {
    ownerLookupFails = true;
    expect(await runScheduledLeadExport(db(), "d1")).toEqual({ error: "the owner's email couldn't be read" });
    expect(sent).toEqual([]);
    expect(tables.lead_export_log[0]).toMatchObject({ success: false });
  });

  it("if leads can't be read, it's a logged failure — not an email saying 0 leads", async () => {
    failing.add("leads:select");
    expect(await runScheduledLeadExport(db(), "d1")).toMatchObject({ error: expect.stringContaining("couldn't read leads") });
    expect(sent).toEqual([]);
  });

  it("'new' means since the last export, not a fixed week", async () => {
    tables.dealerships[0].lead_export_last_sent_at = "2026-09-17T03:00:00Z"; // a catch-up run last Thursday
    vi.setSystemTime(new Date("2026-09-21T03:00:00Z"));
    await runScheduledLeadExport(db(), "d1");
    expect(sent[0].text).toContain("3 leads in total, 1 new since your last export.");
  });

  it("the first export counts 'new' over the period, and says so", async () => {
    tables.dealerships[0].lead_export_last_sent_at = null;
    await runScheduledLeadExport(db(), "d1");
    expect(sent[0].text).toContain("3 leads in total, 2 new this week.");
  });
});

describe("the setting", () => {
  const patch = (body: Row) => patchSettings(new Request("https://hawlai.online/api/autopilot/settings", { method: "PATCH", body: JSON.stringify(body) }));

  it("the owner and admins can change it", async () => {
    expect((await patch({ lead_export_frequency: "monthly" })).status).toBe(200);
    signedIn = "admin-1";
    expect((await patch({ lead_export_frequency: "off" })).status).toBe(200);
    expect(writes.filter((w) => w.table === "dealerships").map((w) => w.values)).toEqual([{ lead_export_frequency: "monthly" }, { lead_export_frequency: "off" }]);
  });

  it("a marketing manager can't, and nothing is saved", async () => {
    signedIn = "mm-1";
    const res = await patch({ lead_export_frequency: "weekly" });
    expect(res.status).toBe(403);
    expect(writes.filter((w) => w.table === "dealerships")).toEqual([]);
  });

  it("only off, weekly or monthly", async () => {
    expect((await patch({ lead_export_frequency: "daily" })).status).toBe(400);
  });

  it("the page knows whether this person can change it", async () => {
    expect((await (await getSettings()).json()).canExport).toBe(true);
    signedIn = "mm-1";
    expect((await (await getSettings()).json()).canExport).toBe(false);
  });
});

describe("the health row", () => {
  const row = async () => (await (await getSettings()).json()).automationHealth.find((h: any) => h.subsystem === "lead_export");

  it("off says off", async () => {
    tables.dealerships[0].lead_export_frequency = "off";
    expect(await row()).toMatchObject({ kind: "export", state: "off", note: "Off — no scheduled leads export" });
  });

  it("after a send: when, how many, how many new", async () => {
    await runScheduledLeadExport(db(), "d1");
    expect(await row()).toMatchObject({ state: "ok", note: "Last sent Mon, 21 Sept · 3 leads, 2 new (weekly)", lastSuccess: true });
  });

  it("a failed export is shown with its reason", async () => {
    resendFails = true;
    await runScheduledLeadExport(db(), "d1");
    expect(await row()).toMatchObject({ state: "failing", note: "The last export failed: Resend is down" });
  });

  it("THE LIVE CASE: switched to weekly after the daily run had logged skipped exports — the row shows the schedule, not '100% success'", async () => {
    vi.setSystemTime(new Date("2026-09-16T06:00:00Z"));
    tables.automation_run_log = [
      { dealership_id: "d1", subsystem: "lead_export", success: true, detail: JSON.stringify({ skipped: "export off" }), created_at: "2026-09-16T03:00:10Z" },
    ];
    tables.dealerships[0].lead_export_last_sent_at = null;
    const rows = (await (await getSettings()).json()).automationHealth.filter((h: any) => h.subsystem === "lead_export");
    expect(rows).toEqual([expect.objectContaining({ kind: "export", state: "idle", note: "On (weekly) — first export Mon, 21 Sept" })]);
    expect(rows[0].successRatePct).toBeUndefined();
  });

  it("switched on but not sent yet: when the first one comes", () => {
    expect(buildExportHealth({ frequency: "weekly", latest: null, lastRun: null, today: "2026-09-16" })).toMatchObject({ state: "idle", note: "On (weekly) — first export Mon, 21 Sept" });
  });
});

describe("from chat", () => {
  const CTX: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [] };

  it("'every week' turns it on and says when, and to the owner's email — whatever address is asked for", async () => {
    vi.setSystemTime(new Date("2026-09-16T06:00:00Z"));
    const r = await executeTool(db(), CTX, "schedule_lead_export", { frequency: "weekly", recipient: "someone@elsewhere.example" }, "");
    expect(r.recipient).toBe("owner@candle.example");
    expect(r.note).toBe(
      "Scheduled leads export is on — every Monday at 8:30 AM IST, to owner@candle.example. The email has a sign-in download link for the full lead list and how many are new; the file isn't attached. First one: 2026-09-21."
    );
    expect(tables.dealerships[0].lead_export_frequency).toBe("weekly");
    expect(extractArtifact("schedule_lead_export", {}, r)).toMatchObject({ kind: "record", label: "Leads export scheduled" });
  });

  it("'stop' turns it off", async () => {
    const r = await executeTool(db(), CTX, "schedule_lead_export", { frequency: "off" }, "");
    expect(r.note).toBe("Scheduled leads export turned off. No more export emails will be sent.");
    expect(tables.dealerships[0].lead_export_frequency).toBe("off");
  });

  it("a marketing manager can't schedule it", async () => {
    signedIn = "mm-1";
    expect(await executeTool(db(), CTX, "schedule_lead_export", { frequency: "weekly" }, "")).toEqual({ error: "Only the business owner or an admin can export leads." });
    expect(tables.dealerships[0].lead_export_frequency).toBe("weekly");
    expect(writes.filter((w) => w.table === "dealerships")).toEqual([]);
  });
});

describe("wired into the daily run", () => {
  it("the signals run calls it for every business", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync(`${__dirname}/../src/app/api/autopilot/daily-run/route.ts`, "utf-8");
    expect(route).toContain('if (only("lead_export")) results[id].leadExport = await run(id, "lead_export", () => runScheduledLeadExport(supabase, id));');
  });
});
