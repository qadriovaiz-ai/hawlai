// A DM HAWLAI CANNOT ANSWER IS NEVER SILENT ON EITHER SIDE — 28 November
// 2026, F2 of docs/PLAN-INSTAGRAM-SELLER-MODE.md.
//
// When the claims guard withheld a reply (or the AI was down, or the
// records were unreadable), the customer got NOTHING and the seller found
// out only by opening a log. Now the customer gets an honest holding line
// — once since the last real answer — and the seller is told at once.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let logRows: Row[];
let inserted: Row[];
let notified: any[];
let gaps: any[];
let sends: { url: string; text: string }[];
let sendFails: boolean;
let outcome: any;
let language: string;

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    const api: any = {
      select: () => api, order: () => api, limit: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      maybeSingle: async () => {
        if (table === "dealerships") {
          const byIg = filters.find(([k]) => k === "instagram_business_id");
          if (!byIg) return { data: null, error: null };
          return { data: { id: "d1", dealership_name: "a_shop", business_category: "Clothing", instagram_access_token: "tok", dm_auto_reply_enabled: true, comment_auto_reply_enabled: false }, error: null };
        }
        return { data: null, error: null };
      },
      insert: async (r: Row) => {
        if (table === "auto_reply_log") inserted.push(r);
        return { error: null };
      },
      then: (res: any, rej: any) => {
        const rows = table === "auto_reply_log" ? logRows.slice().reverse() : [];
        return Promise.resolve({ data: rows, error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/agents/socialManagementAgent", () => ({ generateAutoReply: async () => outcome }));
vi.mock("@/lib/businessBrain", () => ({ getBusinessContext: async () => ({ toneOfVoice: "warm", knowledgeFacts: [], facts: { brand: { language } } }) }));
vi.mock("@/lib/agents/personas", () => ({ resolvePersona: async () => ({ goals: null }) }));
vi.mock("@/lib/claims/businessFacts", () => ({ fetchCatalog: async () => [] }));
vi.mock("@/lib/leads/dmLeadLinking", () => ({ resolveDmLead: async () => "lead-1" }));
vi.mock("@/lib/businessMemory/getLeadMemory", () => ({ getLeadMemory: async () => [] }));
vi.mock("@/lib/webhooks/deliveryLog", () => ({ recordDelivery: async () => {} }));
vi.mock("@/lib/integrations/health", () => ({ recordHealth: async () => ({ recorded: true, notified: false }) }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async (_s: any, n: any) => { notified.push(n); } }));
vi.mock("@/lib/chat/answerGaps", async (orig) => {
  const actual: any = await orig();
  return { ...actual, recordAnswerGap: async (_s: any, d: string, key: string, source: string) => { gaps.push({ d, key, source }); return true; } };
});

import { handleAutoReplyEntry } from "@/lib/webhooks/autoReplyHandler";
import { HOLDING_LINES, isHoldingLine } from "@/lib/dm/holdingLine";
import { readDmThread } from "@/lib/dm/thread";

const IG_ID = "17841432344301688";
const entry = (text: string) => ({ id: IG_ID, messaging: [{ sender: { id: "cust-1" }, message: { text } }] });
const WITHHELD = { reply: null, withheld: ["free shipping"], escalate: "Hawlai had an answer but it claimed something your records don't back." };

beforeEach(() => {
  logRows = [];
  inserted = [];
  notified = [];
  gaps = [];
  sends = [];
  sendFails = false;
  outcome = WITHHELD;
  language = "english";
  vi.stubGlobal("fetch", vi.fn(async (input: any, init: any = {}) => {
    const url = String(input);
    const text = JSON.parse(init.body ?? "{}")?.message?.text ?? "";
    sends.push({ url, text });
    if (sendFails) return new Response(JSON.stringify({ error: { message: "send refused" } }), { status: 400 });
    return new Response(JSON.stringify({ message_id: "m1" }), { status: 200 });
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("1. A WITHHELD REPLY: THE CUSTOMER HEARS THE TRUTH, THE SELLER IS TOLD", () => {
  it("THE CUSTOMER GETS THE HOLDING LINE ON INSTAGRAM", async () => {
    await handleAutoReplyEntry(entry("free shipping?"), db(), "meta-leads");
    expect(sends).toHaveLength(1);
    expect(sends[0].url).toContain("graph.instagram.com");
    expect(sends[0].text).toBe(HOLDING_LINES.english);
  });

  it("THE LOG SAYS BOTH: why nothing was answered, and that they were told", async () => {
    await handleAutoReplyEntry(entry("free shipping?"), db(), "meta-leads");
    expect(inserted[0]).toMatchObject({ success: false, reply_text: HOLDING_LINES.english });
    expect(inserted[0].error).toMatch(/claimed something your records don't back.*told the team will reply/);
  });

  it("THE SELLER IS TOLD AT ONCE — what the customer wrote, and why Hawlai didn't answer", async () => {
    await handleAutoReplyEntry(entry("free shipping?"), db(), "meta-leads");
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ dealershipId: "d1", kind: "dm_needs_reply", href: "/dashboard/social" });
    expect(notified[0].body).toContain("free shipping?");
    expect(notified[0].body).toContain("claimed something your records don't back");
    // Once per customer per day: the date and the sender are in the key.
    expect(notified[0].dedupeKey).toMatch(new RegExp(`^dm_needs_reply:instagram:cust-1:\\d{4}-\\d{2}-\\d{2}$`));
  });

  it("IN THE OWNER'S LANGUAGE", async () => {
    language = "hinglish";
    await handleAutoReplyEntry(entry("price?"), db(), "meta-leads");
    expect(sends[0].text).toBe(HOLDING_LINES.hinglish);
  });

  it("ONE HOLDING LINE SINCE THE LAST REAL ANSWER — not one per message", async () => {
    logRows = [{ incoming_text: "first question", reply_text: HOLDING_LINES.english, success: false, created_at: "2026-11-28T10:00:00Z" }];
    await handleAutoReplyEntry(entry("second question"), db(), "meta-leads");
    expect(sends).toEqual([]);
    // The seller is still told — the dedupe key keeps it to once a day.
    expect(notified).toHaveLength(1);
  });

  it("A FAILED HOLDING LINE IS RECORDED, AND THE SELLER IS STILL TOLD — never thrown", async () => {
    sendFails = true;
    await expect(handleAutoReplyEntry(entry("price?"), db(), "meta-leads")).resolves.toBeUndefined();
    expect(inserted[0].reply_text).toBeNull();
    expect(inserted[0].error).toMatch(/holding reply also failed: send refused/);
    expect(notified).toHaveLength(1);
  });
});

describe("2. AN ANSWERED DM CHANGES NOTHING", () => {
  it("NO HOLDING LINE AND NO NOTIFICATION when the reply went", async () => {
    outcome = { reply: "It's ₹899.", unanswered: null };
    await handleAutoReplyEntry(entry("price?"), db(), "meta-leads");
    expect(sends.map((s) => s.text)).toEqual(["It's ₹899."]);
    expect(notified).toEqual([]);
  });
});

describe("3. THE QUESTION THE RECORDS WERE SILENT ON BECOMES THE OWNER'S QUESTION", () => {
  it("RECORDED FROM A DM AS instagram_dm", async () => {
    outcome = { ...WITHHELD, unanswered: "delivery_area" };
    await handleAutoReplyEntry(entry("do you deliver to Pune?"), db(), "meta-leads");
    expect(gaps).toEqual([{ d: "d1", key: "delivery_area", source: "instagram_dm" }]);
  });

  it("AND NOT WHEN THE MODEL SAID IT COULD ANSWER", async () => {
    outcome = { reply: "Yes.", unanswered: null };
    await handleAutoReplyEntry(entry("open today?"), db(), "meta-leads");
    expect(gaps).toEqual([]);
  });
});

describe("4. THE THREAD KNOWS THE HOLDING LINE WAS SEEN", () => {
  it("A HOLDING LINE IS A TURN THE CUSTOMER SAW; A WITHHELD REPLY IS NOT", async () => {
    logRows = [
      { incoming_text: "a", reply_text: HOLDING_LINES.english, success: false, created_at: "2026-11-28T10:00:00Z" },
      { incoming_text: "b", reply_text: "a generated reply that was never sent", success: false, created_at: "2026-11-28T10:01:00Z" },
    ];
    const t = await readDmThread(db(), "d1", "instagram", "cust-1");
    expect(t.turns.map((x) => x.text)).toEqual(["a", HOLDING_LINES.english, "b"]);
  });

  it("isHoldingLine KNOWS ALL THREE, and nothing else", () => {
    for (const line of Object.values(HOLDING_LINES)) expect(isHoldingLine(line)).toBe(true);
    expect(isHoldingLine("Thanks for your message")).toBe(false);
  });
});
