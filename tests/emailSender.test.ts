// Emails go out under the business's name, from Hawlai's verified domain,
// and replies reach the owner.
//
// THE LIVE CASE (2026-09-13): a promo from candle_by_qaaf was sent as
// "candle_by_qaaf via Hawlai <onboarding@resend.dev>" — Resend's shared
// test sender. Resend reported it Delivered; Gmail filtered it and it never
// reached the inbox. There was no reply-to, so a customer's reply went to
// an address nobody reads. mail.hawlai.online was verified in Resend on
// 2026-09-14, and the sender is now "Candle by Qaaf <hello@mail.hawlai.online>"
// with reply-to set to the owner.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let inserted: { table: string; row: Row }[];

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let insertRow: Row | null = null;
    // Selected columns are honoured, so a column the code forgets to
    // select really is missing — as it would be from Supabase.
    let columns: string[] | null = null;
    const project = (r: Row) => (columns ? Object.fromEntries(columns.filter((c) => c in r).map((c) => [c, r[c]])) : r);
    const rows = () => (insertRow ? [{ id: `${table}-1`, ...insertRow }] : (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v)).map(project));
    const api: any = {
      select: (cols?: string) => ((columns = !insertRow && cols && cols !== "*" ? cols.split(",").map((c) => c.trim()) : columns), api),
      order: () => api, limit: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      neq: () => api,
      insert: (row: Row) => (inserted.push({ table, row }), (insertRow = row), api),
      maybeSingle: async () => ({ data: insertRow ? rows()[0] : table === "team_members" ? null : rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

const sent: Row[] = [];
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (payload: Row) => (sent.push(payload), { data: { id: "msg-1" }, error: null }) };
  },
}));

let authUsers: Record<string, { email: string } | "error">;
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const u = authUsers[id];
          if (u === "error") return { data: { user: null }, error: { message: "auth is down" } };
          return { data: { user: u ?? null }, error: null };
        },
      },
    },
  }),
}));

const gmailSend = vi.fn(async (..._a: any[]) => ({ success: true }));
vi.mock("@/lib/agents/gmailAgent", () => ({ sendEmail: (...a: any[]) => gmailSend(...a) }));

let signedIn: Row | null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: signedIn } }) }, from: (t: string) => db().from(t) }),
}));

import { sendDealerEmail } from "@/lib/email/sendDealerEmail";
import { sendViaResend, senderDisplayName, fromHeader, SENDER_ADDRESS } from "@/lib/email/resendClient";
import { POST as inviteToTeam } from "@/app/api/team/route";

const STORE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", owner_id: "owner-1", gmail_email: null }],
  profiles: [{ id: "owner-1", dealership_id: "d1" }],
  team_members: [],
});

beforeEach(() => {
  tables = STORE();
  inserted = [];
  sent.length = 0;
  authUsers = { "owner-1": { email: "owner@candle.example" } };
  signedIn = { id: "owner-1", email: "owner@candle.example" };
  gmailSend.mockClear();
  process.env.RESEND_API_KEY = "test-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("the live case, through sendDealerEmail", () => {
  it("sends as Candle by Qaaf from the verified domain, with replies going to the owner", async () => {
    const result = await sendDealerEmail(db(), "d1", "customer@example.com", "Diwali", "Light up your home.");

    expect(result).toEqual({ success: true, resendMessageId: "msg-1", via: "resend" });
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe("Candle by Qaaf <hello@mail.hawlai.online>");
    expect(sent[0].replyTo).toBe("owner@candle.example");
    expect(sent[0].to).toBe("customer@example.com");
    expect(inserted).toContainEqual({ table: "email_sends", row: expect.objectContaining({ via: "resend", resend_message_id: "msg-1" }) });
  });

  it("nothing sends from Resend's shared test address any more", () => {
    expect(SENDER_ADDRESS).toBe("hello@mail.hawlai.online");
    expect(fromHeader("anything")).not.toContain("resend.dev");
  });

  it("if the owner's email can't be read, the email still goes — just without a reply-to", async () => {
    authUsers = { "owner-1": "error" };
    const result = await sendDealerEmail(db(), "d1", "customer@example.com", "Diwali", "Hi");
    expect(result.success).toBe(true);
    expect(sent[0].from).toBe("Candle by Qaaf <hello@mail.hawlai.online>");
    expect("replyTo" in sent[0]).toBe(false);
  });

  it("a visual email reaches Resend as that exact HTML, with the plain text alongside", async () => {
    await sendDealerEmail(db(), "d1", "customer@example.com", "Diwali", "Plain version", { html: "<h1>Visual version</h1>" });
    expect(sent[0].html).toBe("<h1>Visual version</h1>");
    expect(sent[0].text).toBe("Plain version");
  });

  it("a visual email for a Gmail-connected business is handed to Gmail with its HTML", async () => {
    tables.dealerships[0].gmail_email = "shop@gmail.com";
    await sendDealerEmail(db(), "d1", "customer@example.com", "Diwali", "Plain version", { html: "<h1>Visual version</h1>" });
    expect(gmailSend.mock.calls[0].slice(3)).toEqual(["Diwali", "Plain version", { html: "<h1>Visual version</h1>" }]);
  });

  it("a business with its own Gmail connected still sends from Gmail, not Resend", async () => {
    tables.dealerships[0].gmail_email = "shop@gmail.com";
    const result = await sendDealerEmail(db(), "d1", "customer@example.com", "Diwali", "Hi");
    expect(result.via).toBe("gmail");
    expect(gmailSend).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
  });
});

describe("the name in the inbox", () => {
  it.each([
    ["candle_by_qaaf", "Candle by Qaaf"],
    ["the-lamp-house", "The Lamp House"],
    ["Qaaf Candles", "Qaaf Candles"],
    ["qaaf candles", "qaaf candles"],
    ["", "Hawlai"],
    [null, "Hawlai"],
  ])("%j reads as %j", (name, expected) => {
    expect(senderDisplayName(name as any)).toBe(expected);
  });

  it("characters that would break or forge the header are removed", () => {
    expect(fromHeader('Evil"\r\nBcc: x@y.com <a@b.c>')).toBe('"EvilBcc: x@y.com a@b.c" <hello@mail.hawlai.online>');
  });

  it("a name with punctuation is quoted so the address still parses", () => {
    expect(fromHeader("Qaaf Candles, Pune")).toBe('"Qaaf Candles, Pune" <hello@mail.hawlai.online>');
  });

  it("a malformed reply-to is left off rather than sent", async () => {
    await sendViaResend("c@example.com", "s", "b", "candle_by_qaaf", { replyTo: "not an email" });
    expect("replyTo" in sent[0]).toBe(false);
  });
});

describe("team invites", () => {
  it("come from the business name on the verified domain, and replies go to the owner who invited", async () => {
    const res = await inviteToTeam(new Request("http://x/api/team", { method: "POST", body: JSON.stringify({ email: "designer@example.com", role: "designer" }) }));
    expect(res.status).toBe(200);
    expect(sent[0].from).toBe("Candle by Qaaf <hello@mail.hawlai.online>");
    expect(sent[0].replyTo).toBe("owner@candle.example");
  });
});
