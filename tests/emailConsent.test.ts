// Marketing email only to people on record, never to anyone who
// unsubscribed, always with the business's address and a working
// unsubscribe — and uploaded lists only with the owner's consent
// confirmation.
//
// APPROVED 2026-09-14: refuse marketing email without a business
// address; chat emails only leads/customers/team, checked against the
// suppression list; CSV uploads need a consent source. These run the real
// sender, chat tool, routes and page rules; only the database and the
// email provider are faked.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; op: string; values: Row | Row[]; filters: string[] }[];
let failing: Map<string, string>; // "table:op" -> message

/** SQL ILIKE with backslash escapes, so a test proves % and _ in an address are literal. */
function ilikeMatch(value: unknown, pattern: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") re += pattern[++i]?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "";
    else if (c === "%") re += ".*";
    else if (c === "_") re += ".";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i").test(String(value ?? ""));
}

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row | Row[] = {};
    const filters: ((r: Row) => boolean)[] = [];
    const described: string[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const fail = () => failing.get(`${table}:${op}`);
    const finish = () => {
      if (fail()) return { data: null, error: { message: fail() } };
      if (op === "select") return { data: rows(), error: null };
      writes.push({ table, op, values, filters: described });
      if (op === "insert") {
        const list = Array.isArray(values) ? values : [values];
        const inserted = list.map((v, i) => ({ id: `${table}-${i + 1}`, ...v }));
        (tables[table] ??= []).push(...inserted);
        return { data: inserted, error: null };
      }
      return { data: [], error: null };
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, lt: () => api, not: () => api, is: () => api, in: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), described.push(`${k}=${v}`), api),
      neq: () => api,
      ilike: (k: string, p: string) => (filters.push((r) => ilikeMatch(r[k], p)), described.push(`${k}~${p}`), api),
      insert: (v: Row | Row[]) => ((op = "insert"), (values = v), api),
      upsert: (v: Row) => ((op = "upsert"), (values = v), api),
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
  return { from, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) } };
}

const STORE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", business_address: "12 Hazratganj, Lucknow", welcome_email_auto_enabled: true, owner_id: "owner-1" }],
  profiles: [{ id: "owner-1", dealership_id: "d1" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
  website_pages: [],
  products: [{ id: "p1", name: "Lavender candle", price: 550, images: [], is_active: true }],
  discount_codes: [],
  orders: [{ id: "o1", dealership_id: "d1", customer_email: "Buyer@Example.com", status: "delivered" }],
  leads: [
    { id: "L1", dealership_id: "d1", name: "Asha", email: "asha@example.com", dnd_opt_out: false },
    { id: "L2", dealership_id: "d1", name: "Ravi", email: "RAVI@example.com", dnd_opt_out: false },
  ],
  team_members: [
    { id: "t1", dealership_id: "d1", email: "priya@candle.example", status: "active" },
    { id: "t2", dealership_id: "d1", email: "gone@candle.example", status: "removed" },
  ],
  email_suppressions: [],
  email_unsubscribe_tokens: [],
});

const sendDealerEmail = vi.fn(async (..._a: any[]) => ({ success: true, via: "resend" as const, resendMessageId: "re_1" }));
vi.mock("@/lib/email/sendDealerEmail", () => ({ sendDealerEmail: (...a: any[]) => sendDealerEmail(...a) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/agents/touchpointAgent", () => ({ recordFirstTouchpoint: async () => {} }));

import { sendMarketingEmail, NO_ADDRESS_ERROR } from "@/lib/email/sendMarketingEmail";
import { recipientOnRecord, suppressEmail } from "@/lib/email/consent";
import { gatherBusinessFacts } from "@/lib/claims/businessFacts";
import { executeTool } from "@/lib/agents/masterBrainV2";
import { runEmailAutomation } from "@/lib/automation/emailAutomation";
import { buildMimeMessage } from "@/lib/agents/gmailAgent";
import { isPublicPath } from "@/lib/supabase/middleware";
import * as unsubscribeRoute from "@/app/api/public/unsubscribe/[token]/route";
import { POST as postLeads } from "@/app/api/leads/route";
import { PATCH as patchDealership } from "@/app/api/dealership/route";
import { POST as postEmailSend } from "@/app/api/email/send/route";

const CTX: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [] };
const writesTo = (table: string, op?: string) => writes.filter((w) => w.table === table && (!op || w.op === op));

beforeEach(() => {
  tables = STORE();
  writes = [];
  failing = new Map();
  sendDealerEmail.mockClear();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendMarketingEmail — every rule, before anything is sent", () => {
  it("a generated email goes out with the address, a working unsubscribe link, and one-click unsubscribe headers", async () => {
    const facts = await gatherBusinessFacts(db(), "d1");
    const r = await sendMarketingEmail(db(), "d1", "Asha@Example.com", { draft: { subject: "Slow evenings", headline: "Slow evenings", intro: "Hi" }, facts });

    // The Resend id comes back, so the send can be matched to its delivery status.
    expect(r).toEqual({ success: true, via: "resend", resendMessageId: "re_1" });
    const token = tables.email_unsubscribe_tokens[0];
    expect(token).toMatchObject({ dealership_id: "d1", email: "asha@example.com" });
    expect(token.token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const [, , to, subject, text, opts] = sendDealerEmail.mock.calls[0] as any[];
    expect([to, subject]).toEqual(["Asha@Example.com", "Slow evenings"]);
    expect(opts.html).toContain("Candle by Qaaf · 12 Hazratganj, Lucknow");
    expect(opts.html).toContain(`<a href="https://hawlai.online/unsubscribe/${token.token}"`);
    expect(text).toContain(`Unsubscribe: https://hawlai.online/unsubscribe/${token.token}`);
    expect(opts.headers).toEqual({
      "List-Unsubscribe": `<https://hawlai.online/api/public/unsubscribe/${token.token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("words someone wrote go out as written, with the footer added", async () => {
    await sendMarketingEmail(db(), "d1", "asha@example.com", { subject: "Hello", text: "Hi Asha,\nthanks!", businessName: "candle_by_qaaf" });
    const token = tables.email_unsubscribe_tokens[0].token;
    expect((sendDealerEmail.mock.calls[0] as any[])[4]).toBe(`Hi Asha,\nthanks!\n\n—\nCandle by Qaaf · 12 Hazratganj, Lucknow\nUnsubscribe: https://hawlai.online/unsubscribe/${token}`);
  });

  it("no business address: refused with how to fix it — nothing sent, no link made", async () => {
    tables.dealerships[0].business_address = "   ";
    const r = await sendMarketingEmail(db(), "d1", "asha@example.com", { subject: "Hello", text: "Hi", businessName: "x" });
    expect(r).toEqual({ success: false, refused: "no_address", error: NO_ADDRESS_ERROR });
    expect(NO_ADDRESS_ERROR).toContain("Settings → Brand Voice");
    expect(sendDealerEmail).not.toHaveBeenCalled();
    expect(tables.email_unsubscribe_tokens).toEqual([]);
  });

  it("an unsubscribed address is refused, however its capitals are written", async () => {
    tables.email_suppressions = [{ dealership_id: "d1", email: "asha@example.com", reason: "unsubscribed" }];
    const r = await sendMarketingEmail(db(), "d1", " ASHA@example.com ", { subject: "Hello", text: "Hi", businessName: "x" });
    expect(r).toEqual({ success: false, refused: "suppressed", error: "Not sent:  ASHA@example.com  has unsubscribed from this business's emails." });
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });

  it("another business's unsubscribe doesn't block this one", async () => {
    tables.email_suppressions = [{ dealership_id: "d2", email: "asha@example.com", reason: "unsubscribed" }];
    expect((await sendMarketingEmail(db(), "d1", "asha@example.com", { subject: "Hello", text: "Hi", businessName: "x" })).success).toBe(true);
  });

  it("if the unsubscribe list can't be read, nothing is sent — never 'not unsubscribed' by default", async () => {
    failing.set("email_suppressions:select", "timeout");
    const r = await sendMarketingEmail(db(), "d1", "asha@example.com", { subject: "Hello", text: "Hi", businessName: "x" });
    expect(r).toEqual({ success: false, error: "Not sent — couldn't read the unsubscribe list: timeout." });
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });

  it("if the unsubscribe link can't be created, nothing is sent", async () => {
    failing.set("email_unsubscribe_tokens:insert", "disk full");
    const r = await sendMarketingEmail(db(), "d1", "asha@example.com", { subject: "Hello", text: "Hi", businessName: "x" });
    expect(r).toMatchObject({ success: false, refused: "unsubscribe_unavailable" });
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });
});

describe("who is on record", () => {
  it.each([
    ["priya@candle.example", "team"],
    ["asha@example.com", "lead"],
    ["ravi@EXAMPLE.com", "lead"],
    ["buyer@example.com", "customer"],
    ["gone@candle.example", null],
    ["stranger@example.com", null],
    ["not-an-email", null],
  ])("%s → %s", async (email, kind) => {
    expect(await recipientOnRecord(db(), "d1", email)).toBe(kind);
  });

  it("_ and % in an address are literal, not wildcards", async () => {
    tables.leads = [{ id: "L9", dealership_id: "d1", email: "a_b@example.com" }];
    expect(await recipientOnRecord(db(), "d1", "a_b@example.com")).toBe("lead");
    expect(await recipientOnRecord(db(), "d1", "axb@example.com")).toBeNull();
    expect(await recipientOnRecord(db(), "d1", "%@example.com")).toBeNull();
  });

  it("a lookup that fails is an error, not 'not on record'", async () => {
    failing.set("leads:select", "timeout");
    await expect(recipientOnRecord(db(), "d1", "asha@example.com")).rejects.toThrow("couldn't check leads: timeout");
  });
});

describe("chat's send_email", () => {
  it("refuses an address that isn't a lead, customer or team member", async () => {
    const r = await executeTool(db(), CTX, "send_email", { recipient: "stranger@example.com", subject: "Hello", body: "Hi" }, "");
    expect(r.error).toBe("Not sent: stranger@example.com isn't a lead, customer or team member of this business. Hawlai only emails people who gave the business their email.");
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });

  it("a note to a team member is internal mail — no footer, no unsubscribe", async () => {
    const r = await executeTool(db(), CTX, "send_email", { recipient: "priya@candle.example", subject: "Launch", body: "Can you check the Diwali banner?" }, "");
    expect(r.success).toBe(true);
    expect(sendDealerEmail.mock.calls[0].slice(2)).toEqual(["priya@candle.example", "Launch", "Can you check the Diwali banner?"]);
    expect(tables.email_unsubscribe_tokens).toEqual([]);
  });

  it("a lead who unsubscribed is refused", async () => {
    tables.email_suppressions = [{ dealership_id: "d1", email: "asha@example.com", reason: "unsubscribed" }];
    const r = await executeTool(db(), CTX, "send_email", { recipient: "asha@example.com", subject: "Hello", body: "Hi" }, "");
    expect(r.error).toBe("Not sent: asha@example.com has unsubscribed from this business's emails.");
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });

  it("with no business address, a customer email is refused and the owner told where to add it", async () => {
    tables.dealerships[0].business_address = null;
    const r = await executeTool(db(), CTX, "send_email", { recipient: "buyer@example.com", subject: "Hello", body: "Hi" }, "");
    expect(r.error).toBe(NO_ADDRESS_ERROR);
  });
});

describe("sending from a lead's page", () => {
  const send = (body: Row) => postEmailSend(new Request("https://hawlai.online/api/email/send", { method: "POST", body: JSON.stringify(body) }));

  it("refuses an address that isn't on record", async () => {
    const res = await send({ to: "stranger@example.com", subject: "Hi", body: "Hello" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("stranger@example.com isn't a lead, customer or team member of this business, so Hawlai won't email them.");
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });

  it("sends to a lead with the address and unsubscribe footer", async () => {
    const res = await send({ to: "asha@example.com", subject: "Hi", body: "Hello Asha" });
    expect(res.status).toBe(200);
    const text = (sendDealerEmail.mock.calls[0] as any[])[4] as string;
    expect(text.startsWith("Hello Asha\n\n—\nCandle by Qaaf · 12 Hazratganj, Lucknow\nUnsubscribe: https://hawlai.online/unsubscribe/")).toBe(true);
  });
});

describe("automation", () => {
  it("with no business address, no welcome email goes and the run says why — once, not per lead", async () => {
    tables.dealerships[0].business_address = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ subject: "Welcome", headline: "Welcome", intro: "Hi", body: "Hi" }) }] }) }))
    );
    const r = await runEmailAutomation(db(), "d1");
    expect(r).toEqual({ welcomesSent: 0, followUpsSent: 0, skipped: "business address missing" });
    expect(sendDealerEmail).not.toHaveBeenCalled();
    expect(writesTo("leads", "update")).toEqual([]);
  });
});

describe("unsubscribing", () => {
  const token = "tok_abcdefghijklmnopqrstuvwxyz0123";
  beforeEach(() => {
    tables.email_unsubscribe_tokens = [{ token, dealership_id: "d1", email: "ravi@example.com" }];
  });
  const post = (form: Record<string, string> | null) =>
    unsubscribeRoute.POST(
      new Request(`https://hawlai.online/api/public/unsubscribe/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form ?? { "List-Unsubscribe": "One-Click" }).toString(),
      }),
      { params: Promise.resolve({ token }) }
    );

  it("Gmail's one-click POST suppresses the address and marks the matching lead do-not-contact", async () => {
    const res = await post(null);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unsubscribed: true });
    expect(writesTo("email_suppressions", "upsert")[0].values).toEqual({ dealership_id: "d1", email: "ravi@example.com", reason: "unsubscribed", source: "one_click" });
    const leadUpdate = writesTo("leads", "update")[0];
    expect(leadUpdate.values).toMatchObject({ dnd_opt_out: true, dnd_opt_out_source: "email_unsubscribed", consent_status: "withdrawn" });
    expect(leadUpdate.filters).toEqual(["dealership_id=d1", "email~ravi@example.com"]);
  });

  it("the page's confirm button unsubscribes and returns to the page to show it worked", async () => {
    const res = await post({ from: "page" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://hawlai.online/unsubscribe/${token}?done=1`);
    expect(writesTo("email_suppressions", "upsert")[0].values).toMatchObject({ source: "unsubscribe_page" });
  });

  it("an unknown token changes nothing", async () => {
    tables.email_unsubscribe_tokens = [];
    const res = await post(null);
    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
  });

  it("if it can't be recorded, the person is told to try again — not told they're unsubscribed", async () => {
    failing.set("email_suppressions:upsert", "timeout");
    const res = await post({ from: "page" });
    expect(res.headers.get("location")).toBe(`https://hawlai.online/unsubscribe/${token}?error=1`);
  });

  it("merely opening the link (GET) can't unsubscribe anyone, and the page needs no Hawlai login", () => {
    expect((unsubscribeRoute as any).GET).toBeUndefined();
    expect(isPublicPath("/unsubscribe/abc")).toBe(true);
    expect(isPublicPath("/api/public/unsubscribe/abc")).toBe(true);
  });

  it("suppressEmail reports a failure instead of pretending", async () => {
    failing.set("leads:update", "locked");
    expect(await suppressEmail(db(), "d1", "ravi@example.com", "unsubscribed", "test")).toEqual({ ok: false, error: "locked" });
  });
});

describe("uploaded lead lists need consent", () => {
  const upload = (body: Row) => postLeads(new Request("https://hawlai.online/api/leads", { method: "POST", body: JSON.stringify(body) }));
  const csvLead = { dealership_id: "d1", name: "Meera", phone: "9876543210", email: "meera@example.com", source: "csv_upload", status: "new" };

  it("without a confirmed consent source nothing is imported", async () => {
    for (const consent of [undefined, { source: "purchase", confirmed: false }, { source: "bought_list", confirmed: true }]) {
      const res = await upload({ leads: [csvLead], consent });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Confirm these people gave your business their details, and say how, before uploading.");
    }
    expect(writesTo("leads", "insert")).toEqual([]);
  });

  it("with it, every uploaded lead records granted consent and where it came from — whatever the client claimed", async () => {
    const res = await upload({ leads: [{ ...csvLead, consent_status: "unknown", consent_source: "made-up", dnd_opt_out: true }], consent: { source: "purchase", confirmed: true } });
    expect(res.status).toBe(200);
    const [row] = writesTo("leads", "insert")[0].values as Row[];
    expect(row).toMatchObject({ name: "Meera", email: "meera@example.com", consent_status: "granted", consent_source: "csv_upload:purchase" });
    expect(row.consent_captured_at).toEqual(expect.any(String));
    expect("dnd_opt_out" in row).toBe(false);
  });

  it("leads that didn't come from a CSV don't need the confirmation", async () => {
    const res = await upload({ leads: [{ dealership_id: "d1", name: "Walk-in", phone: "9876543210", source: "manual" }] });
    expect(res.status).toBe(200);
  });
});

describe("the business address setting", () => {
  const patch = (body: Row) => patchDealership(new Request("https://hawlai.online/api/dealership", { method: "PATCH", body: JSON.stringify(body) }));

  it("is saved trimmed; blank clears it", async () => {
    await patch({ business_address: "  12 Hazratganj, Lucknow  " });
    await patch({ business_address: "   " });
    expect(writesTo("dealerships", "update").map((w) => w.values)).toEqual([{ business_address: "12 Hazratganj, Lucknow" }, { business_address: null }]);
  });

  it("refuses anything over 300 characters", async () => {
    const res = await patch({ business_address: "x".repeat(301) });
    expect(res.status).toBe(400);
    expect(writesTo("dealerships", "update")).toEqual([]);
  });
});

describe("Gmail carries the unsubscribe headers", () => {
  it("adds them to the message, with line breaks stripped so nothing can inject a header", () => {
    const mime = buildMimeMessage({
      from: "x", to: "y", subject: "s", text: "t",
      headers: { "List-Unsubscribe": "<https://hawlai.online/api/public/unsubscribe/abc>", "X-Evil": "a\r\nBcc: victim@example.com" },
    });
    const head = mime.split("\r\n\r\n")[0].split("\r\n");
    expect(head).toContain("List-Unsubscribe: <https://hawlai.online/api/public/unsubscribe/abc>");
    expect(head).toContain("X-Evil: a Bcc: victim@example.com");
    expect(head.some((l) => l.startsWith("Bcc:"))).toBe(false);
  });
});
