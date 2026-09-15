// What happened to an email after Resend took it — recorded, acted on,
// and told to the owner. Only from events that really came from Resend.
//
// THE LIVE CASE (2026-09-13): a promo chat reported as sent never reached
// the inbox, and Hawlai could say nothing about why — the webhook stored
// only opens and clicks and accepted any request. Resend's dashboard said
// "Delivered" (Gmail filtered it); a bounce or a spam complaint would have
// gone unnoticed, and the next email would have gone to the same address.
//
// Signatures here are real (standardwebhooks, the library Resend's SDK
// verifies with); only Resend's API and the database are faked.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Webhook } from "standardwebhooks";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; op: string; values: Row; filters: [string, any][] }[];
let failingWrite: string | null; // "table:op" whose write fails

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const finish = () => {
      if (op === "select") return { data: rows(), error: null };
      if (failingWrite === `${table}:${op}`) return { data: null, error: { message: "database unavailable" } };
      writes.push({ table, op, values, filters: [...filters] });
      if (op === "update") for (const r of rows()) Object.assign(r, values);
      return { data: [], error: null };
    };
    const api: any = {
      select: () => api, limit: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      ilike: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (v: Row) => ((op = "insert"), (values = v), api),
      upsert: (v: Row) => ((op = "upsert"), (values = v), api),
      update: (v: Row) => ((op = "update"), (values = v), api),
      maybeSingle: async () => {
        const r = finish();
        return { data: (r.data as Row[])[0] ?? null, error: null };
      },
      then: (res: any, rej: any) => Promise.resolve(finish()).then(res, rej),
    };
    return api;
  };
  return { from };
}

const SECRET = "whsec_" + Buffer.from("hawlai-test-signing-secret-32bytes!!").toString("base64");
const ENDPOINT = "https://hawlai.online/api/webhooks/resend";
let hooks: { id: string; endpoint: string; events: string[] | null; signing_secret: string }[];
const api = { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() };

vi.mock("resend", async (orig) => {
  const actual = await orig<typeof import("resend")>();
  class FakeResend extends actual.Resend {
    constructor(key?: string) {
      super(key);
      // The real verify() stays; only the network calls are faked.
      Object.assign(this.webhooks, api);
    }
  }
  return { ...actual, Resend: FakeResend };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { ensureResendWebhook, verifyResendEvent, applyResendEvent, resetWebhookSecretCache, WEBHOOK_EVENTS } from "@/lib/email/resendWebhook";
import { POST } from "@/app/api/webhooks/resend/route";

function signed(event: Row, secret = SECRET) {
  const body = JSON.stringify(event);
  const id = "msg_1";
  const at = new Date();
  const signature = new Webhook(secret).sign(id, at, body);
  const headers = new Headers({ "svix-id": id, "svix-timestamp": String(Math.floor(at.getTime() / 1000)), "svix-signature": signature });
  return { body, headers };
}

const post = (event: Row, secret?: string) => {
  const { body, headers } = signed(event, secret);
  return POST(new Request(ENDPOINT, { method: "POST", body, headers }));
};

const SEND = (): Row => ({ id: "s1", dealership_id: "d1", resend_message_id: "re_1", to_email: "asha@example.com", subject: "Slow evenings", delivery_status: null, open_count: 0, click_count: 0 });
const event = (type: string, extra: Row = {}) => ({ type, created_at: "2026-09-15T10:00:00.000Z", data: { email_id: "re_1", to: ["asha@example.com"], subject: "Slow evenings", ...extra } });
const sendRow = () => tables.email_sends[0];
const notifications = () => writes.filter((w) => w.table === "notifications").map((w) => w.values);

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.NEXT_PUBLIC_SITE_URL;
  resetWebhookSecretCache();
  Object.values(api).forEach((m) => m.mockReset());
  hooks = [{ id: "wh_1", endpoint: ENDPOINT, events: [...WEBHOOK_EVENTS], signing_secret: SECRET }];
  api.list.mockImplementation(async () => ({ data: { object: "list", has_more: false, data: hooks.map(({ signing_secret, ...h }) => h) }, error: null }));
  api.get.mockImplementation(async (id: string) => ({ data: hooks.find((h) => h.id === id), error: null }));
  api.create.mockImplementation(async (opts: any) => (hooks.push({ id: "wh_new", endpoint: opts.endpoint, events: opts.events, signing_secret: SECRET }), { data: { object: "webhook", id: "wh_new", signing_secret: SECRET }, error: null }));
  api.update.mockImplementation(async () => ({ data: { object: "webhook", id: "wh_1" }, error: null }));
  tables = { email_sends: [SEND()], email_suppressions: [], leads: [{ id: "L1", dealership_id: "d1", email: "asha@example.com" }] };
  writes = [];
  failingWrite = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("only events that really came from Resend", () => {
  it("a correctly signed event is accepted", async () => {
    const res = await post(event("email.delivered"));
    expect(res.status).toBe(200);
    expect(sendRow().delivery_status).toBe("delivered");
  });

  it("a forged bounce — wrong secret — is rejected and changes nothing", async () => {
    const forged = "whsec_" + Buffer.from("someone-elses-secret-000000000000").toString("base64");
    const res = await post(event("email.bounced", { bounce: { type: "Permanent", subType: "General", message: "x" } }), forged);
    expect(res.status).toBe(401);
    expect(writes).toEqual([]);
  });

  it("an unsigned request is rejected", async () => {
    const res = await POST(new Request(ENDPOINT, { method: "POST", body: JSON.stringify(event("email.complained")) }));
    expect(res.status).toBe(401);
    expect(writes).toEqual([]);
  });

  it("a rotated secret is picked up: a failed check re-reads it once", async () => {
    const newSecret = "whsec_" + Buffer.from("rotated-secret-000000000000000000").toString("base64");
    await post(event("email.sent")); // caches the old secret
    hooks[0].signing_secret = newSecret;
    const { body, headers } = signed(event("email.delivered"), newSecret);
    expect(await verifyResendEvent(body, headers)).toMatchObject({ type: "email.delivered" });
  });

  it("the secret is read from Resend's API — never from an environment variable someone typed", async () => {
    await post(event("email.delivered"));
    expect(api.get).toHaveBeenCalledWith("wh_1");
    expect(Object.keys(process.env).filter((k) => /RESEND.*(SECRET|SIGNING)/i.test(k))).toEqual([]);
  });
});

describe("recording what happened", () => {
  it("delivered is recorded with its time", async () => {
    await applyResendEvent(db(), event("email.delivered"));
    expect(sendRow()).toMatchObject({ delivery_status: "delivered", delivered_at: "2026-09-15T10:00:00.000Z" });
  });

  it("a late 'sent' never overwrites 'delivered'; a complaint after delivery does", async () => {
    await applyResendEvent(db(), event("email.delivered"));
    await applyResendEvent(db(), event("email.sent"));
    expect(sendRow().delivery_status).toBe("delivered");
    await applyResendEvent(db(), event("email.complained"));
    expect(sendRow().delivery_status).toBe("complained");
  });

  it("opens and clicks are still counted", async () => {
    await applyResendEvent(db(), event("email.opened"));
    await applyResendEvent(db(), event("email.clicked"));
    expect(sendRow()).toMatchObject({ opened: true, open_count: 1, clicked: true, click_count: 1 });
  });

  it("an event for an email Hawlai didn't send is ignored", async () => {
    tables.email_sends = [];
    expect(await applyResendEvent(db(), event("email.bounced"))).toEqual({ handled: false, reason: "not a Hawlai send" });
    expect(writes).toEqual([]);
  });
});

describe("acting on it", () => {
  it("a permanent bounce: recorded with the reason, the address suppressed, the owner told", async () => {
    await applyResendEvent(db(), event("email.bounced", { bounce: { type: "Permanent", subType: "General", message: "Mailbox does not exist" } }));

    expect(sendRow()).toMatchObject({ delivery_status: "bounced", delivery_error: "Mailbox does not exist" });
    expect(writes.find((w) => w.table === "email_suppressions")?.values).toEqual({ dealership_id: "d1", email: "asha@example.com", reason: "bounced", source: "resend:email.bounced" });
    expect(writes.find((w) => w.table === "leads")?.values).toMatchObject({ dnd_opt_out: true, dnd_opt_out_source: "email_bounced" });
    expect(notifications()).toEqual([
      {
        dealership_id: "d1",
        kind: "email_delivery_problem",
        title: 'Your email "Slow evenings" to asha@example.com bounced',
        body: "Mailbox does not exist. Hawlai won't send marketing email to this address again.",
        href: "/dashboard/email",
        dedupe_key: "email_problem:re_1:email.bounced",
      },
    ]);
  });

  it("a temporary bounce is recorded and reported, but the address is kept", async () => {
    await applyResendEvent(db(), event("email.bounced", { bounce: { type: "Transient", subType: "MailboxFull", message: "Mailbox full" } }));
    expect(writes.filter((w) => w.table === "email_suppressions")).toEqual([]);
    expect(notifications()[0].body).toBe("Mailbox full. This looks temporary — it may go through if sent again later.");
  });

  it("a spam complaint suppresses the address as a complaint", async () => {
    await applyResendEvent(db(), event("email.complained"));
    expect(writes.find((w) => w.table === "email_suppressions")?.values).toMatchObject({ reason: "complained" });
    expect(notifications()[0].title).toBe('asha@example.com marked your email "Slow evenings" as spam');
  });

  it("an email Resend refused to send (suppressed) is recorded, suppressed here too, and reported", async () => {
    await applyResendEvent(db(), event("email.suppressed", { suppressed: { type: "OnAccountSuppressionList", message: "Previously bounced" } }));
    expect(sendRow()).toMatchObject({ delivery_status: "suppressed", delivery_error: "Previously bounced" });
    expect(writes.find((w) => w.table === "email_suppressions")).toBeTruthy();
    expect(notifications()[0].title).toBe('Your email "Slow evenings" to asha@example.com wasn\'t sent — the address is blocked');
  });

  it("a failure is reported but doesn't unsubscribe anyone", async () => {
    await applyResendEvent(db(), event("email.failed", { failed: { reason: "Invalid recipient" } }));
    expect(sendRow()).toMatchObject({ delivery_status: "failed", delivery_error: "Invalid recipient" });
    expect(writes.filter((w) => w.table === "email_suppressions")).toEqual([]);
    expect(notifications()[0].title).toBe('Your email "Slow evenings" to asha@example.com failed');
  });

  it("delivered and delayed don't bother the owner", async () => {
    await applyResendEvent(db(), event("email.delivery_delayed"));
    await applyResendEvent(db(), event("email.delivered"));
    expect(notifications()).toEqual([]);
  });
});

describe("when recording fails", () => {
  it("a bounce whose unsubscribe can't be saved returns an error, so Resend sends the event again", async () => {
    failingWrite = "email_suppressions:upsert";
    const res = await post(event("email.bounced", { bounce: { type: "Permanent", subType: "General", message: "Mailbox does not exist" } }));
    expect(res.status).toBe(500);
    expect(notifications()).toEqual([]);
  });
});

describe("the webhook registers itself", () => {
  it("creates Hawlai's webhook with every delivery event when there isn't one", async () => {
    hooks = [];
    expect(await ensureResendWebhook()).toEqual({ status: "created", id: "wh_new" });
    expect(api.create).toHaveBeenCalledWith({ endpoint: ENDPOINT, events: [...WEBHOOK_EVENTS] });
    expect(WEBHOOK_EVENTS).toEqual(expect.arrayContaining(["email.delivered", "email.bounced", "email.complained", "email.failed", "email.suppressed"]));
  });

  it("an older webhook that only sent opens and clicks gets the delivery events added", async () => {
    hooks[0].events = ["email.opened", "email.clicked"];
    expect(await ensureResendWebhook()).toEqual({ status: "updated", id: "wh_1" });
    expect(api.update).toHaveBeenCalledWith("wh_1", { events: [...WEBHOOK_EVENTS], status: "enabled" });
  });

  it("leaves a complete webhook alone, and reports an API failure instead of hiding it", async () => {
    expect(await ensureResendWebhook()).toEqual({ status: "ok", id: "wh_1" });
    expect(api.create).not.toHaveBeenCalled();
    api.list.mockImplementationOnce(async () => ({ data: null, error: { message: "This API key is restricted to sending" } }));
    expect(await ensureResendWebhook()).toEqual({ error: "couldn't read Resend webhooks: This API key is restricted to sending" });
  });

  it("runs once a day with the signals run, before any business's jobs", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync(`${__dirname}/../src/app/api/autopilot/daily-run/route.ts`, "utf-8");
    // platformTasks run before today's job list is worked (tests/dailyJobs.test.ts).
    expect(route).toContain("const resendWebhook = await ensureResendWebhook();");
    expect(route).toContain('if ("error" in resendWebhook) console.error("[autopilot] resend webhook:", resendWebhook.error);');
  });
});
