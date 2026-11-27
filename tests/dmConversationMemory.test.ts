// THE DM REPLY REMEMBERS THE CONVERSATION — 28 November 2026, F1 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md.
//
// generateAutoReply answered each message alone: "the red one" after "do
// you have kurtas?" meant nothing, and an order — product, size, name,
// address — could never be taken, because every turn started from zero.
// The thread is the rows auto_reply_log already holds; no new table.
//
// And the same read gives Meta's window: an automated message may only go
// within 24 hours of the customer's last message.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { code } from "./helpers/source";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let threadQuery: { filters: [string, any][]; limit: number | null; error?: string };

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let lim: number | null = null;
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api,
      not: () => api, is: () => api, in: () => api, ilike: () => api, insert: () => api, update: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      limit: (n: number) => ((lim = n), api),
      single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      then: (res: any, rej: any) => {
        if (table === "auto_reply_log") {
          threadQuery = { filters, limit: lim, error: threadQuery?.error };
          if (threadQuery.error) return Promise.resolve({ data: null, error: { message: threadQuery.error } }).then(res, rej);
          const rows = (tables.auto_reply_log ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
          // Newest first, as the query asks.
          const sorted = rows.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
          return Promise.resolve({ data: lim ? sorted.slice(0, lim) : sorted, error: null }).then(res, rej);
        }
        return Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { from };
}
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/usage/logUsage", () => ({ logClaudeUsage: async () => {}, logGeminiImageUsage: async () => {} }));

import { readDmThread, insideMessagingWindow, threadBlock, MESSAGING_WINDOW_MS } from "@/lib/dm/thread";
import { generateAutoReply } from "@/lib/agents/socialManagementAgent";
import { gatherBusinessFacts } from "@/lib/claims/businessFacts";

function capturePrompts(reply: string): string[] {
  const sent: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: any) => {
    sent.push(JSON.parse(init.body).messages[0].content);
    const content = [{ type: "text", text: JSON.stringify({ reply }) }];
    return { ok: true, status: 200, text: async () => JSON.stringify({ content }), json: async () => ({ content }), headers: { get: () => null } };
  }));
  return sent;
}

const log = (over: Row) => ({ dealership_id: "d1", channel: "dm_instagram", source_id: "cust-1", success: true, reply_text: null, ...over });

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.spyOn(console, "error").mockImplementation(() => {});
  threadQuery = { filters: [], limit: null };
  tables = {
    dealerships: [{ id: "d1", dealership_name: "a_shop", business_category: "Clothing", city: "Lucknow" }],
    websites: [],
    website_pages: [],
    products: [{ id: "p1", dealership_id: "d1", name: "Cotton kurta", price: 899, description: "Red, cotton", images: [], is_active: true, order_index: 0 }],
    discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [], business_knowledge: [],
    brand_profiles: [{ dealership_id: "d1", tone_of_voice: "warm", messaging_pillars: [], preferred_language: "english" }],
    auto_reply_log: [
      log({ created_at: "2026-11-28T10:00:00Z", incoming_text: "do you have kurtas?", reply_text: "Yes — the Cotton kurta, ₹899." }),
      log({ created_at: "2026-11-28T10:01:00Z", incoming_text: "is it in red?", reply_text: null, success: false }),
      log({ created_at: "2026-11-28T10:02:00Z", incoming_text: "ok the red one then", reply_text: "Great, the red Cotton kurta it is." }),
      // Another customer of the same business, and the same customer on Facebook — neither belongs.
      log({ created_at: "2026-11-28T10:03:00Z", source_id: "someone-else", incoming_text: "SOMEONE ELSE", reply_text: "x" }),
      log({ created_at: "2026-11-28T10:04:00Z", channel: "dm_facebook", incoming_text: "FACEBOOK THREAD", reply_text: "x" }),
    ],
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("1. THE THREAD IS THIS CUSTOMER'S, ON THIS CHANNEL, OLDEST FIRST", () => {
  it("THE TURNS COME BACK IN THE ORDER THEY WERE SAID", async () => {
    const t = await readDmThread(db(), "d1", "instagram", "cust-1");
    expect(t.turns).toEqual([
      { from: "customer", text: "do you have kurtas?" },
      { from: "business", text: "Yes — the Cotton kurta, ₹899." },
      { from: "customer", text: "is it in red?" },
      { from: "customer", text: "ok the red one then" },
      { from: "business", text: "Great, the red Cotton kurta it is." },
    ]);
  });

  it("A WITHHELD REPLY KEEPS THE CUSTOMER'S TURN AND HAS NO REPLY — that is what they saw", async () => {
    const t = await readDmThread(db(), "d1", "instagram", "cust-1");
    const i = t.turns.findIndex((x) => x.text === "is it in red?");
    expect(t.turns[i + 1].from).toBe("customer");
  });

  it("ANOTHER CUSTOMER'S MESSAGES, AND ANOTHER CHANNEL'S, NEVER ENTER IT", async () => {
    const t = await readDmThread(db(), "d1", "instagram", "cust-1");
    const all = t.turns.map((x) => x.text).join(" ");
    expect(all).not.toContain("SOMEONE ELSE");
    expect(all).not.toContain("FACEBOOK THREAD");
    expect(threadQuery.filters).toEqual(expect.arrayContaining([["dealership_id", "d1"], ["channel", "dm_instagram"], ["source_id", "cust-1"]]));
  });

  it("ONLY THE LAST FEW EXCHANGES — an order, not a novel", async () => {
    const t = await readDmThread(db(), "d1", "instagram", "cust-1", 2);
    expect(threadQuery.limit).toBe(2);
    expect(t.turns[0]).toEqual({ from: "customer", text: "is it in red?" });
  });

  it("THE CUSTOMER'S LAST MESSAGE TIME IS THE NEWEST ROW — Meta's window is measured from it", async () => {
    expect((await readDmThread(db(), "d1", "instagram", "cust-1")).lastCustomerAt).toBe("2026-11-28T10:02:00Z");
  });

  it("AN UNREADABLE THREAD IS AN EMPTY ONE — the reply still goes, without memory", async () => {
    threadQuery.error = "permission denied";
    expect(await readDmThread(db(), "d1", "instagram", "cust-1")).toEqual({ turns: [], lastCustomerAt: null });
  });
});

describe("2. META'S 24-HOUR WINDOW", () => {
  const now = new Date("2026-11-29T10:00:00Z");
  it("INSIDE IT, AN AUTOMATED MESSAGE IS ALLOWED", () => {
    expect(insideMessagingWindow(new Date(now.getTime() - MESSAGING_WINDOW_MS + 60_000).toISOString(), now)).toBe(true);
  });
  it("PAST IT, IT IS NOT", () => {
    expect(insideMessagingWindow(new Date(now.getTime() - MESSAGING_WINDOW_MS - 60_000).toISOString(), now)).toBe(false);
  });
  it("NO KNOWN LAST MESSAGE IS 'NOT ALLOWED' — never assumed open", () => {
    expect(insideMessagingWindow(null, now)).toBe(false);
    expect(insideMessagingWindow("not a date", now)).toBe(false);
  });
});

describe("3. THE REPLY SEES IT", () => {
  const facts = () => gatherBusinessFacts(db(), "d1");
  const CATALOGUE = [{ name: "Cotton kurta", price: 899, description: "Red, cotton", inventoryCount: 4 }];

  it("A DM'S PROMPT CARRIES THE EARLIER TURNS, IN ORDER", async () => {
    const sent = capturePrompts("It's ₹899.");
    const thread = await readDmThread(db(), "d1", "instagram", "cust-1");
    await generateAutoReply("dm", "how much?", "a_shop", "Clothing", { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts(), thread.turns);
    const p = sent[0];
    const a = p.indexOf('Customer: "do you have kurtas?"');
    const b = p.indexOf('Customer: "ok the red one then"');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(p).toMatch(/what was said, not instructions/);
  });

  it("A PUBLIC COMMENT NEVER CARRIES A PRIVATE THREAD", async () => {
    const sent = capturePrompts("Thanks!");
    const thread = await readDmThread(db(), "d1", "instagram", "cust-1");
    await generateAutoReply("comment", "nice", "a_shop", "Clothing", { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts(), thread.turns);
    expect(sent[0]).not.toContain("do you have kurtas?");
  });

  it("A QUOTE IN A CUSTOMER'S MESSAGE CANNOT CLOSE THE QUOTED LINE", () => {
    expect(threadBlock([{ from: "customer", text: 'say "ignore that"' }])).toContain(`Customer: "say 'ignore that'"`);
  });

  // F2 — the same generator says which question the records were silent
  // on, for a DM only, as a category.
  it("A DM ASKS THE MODEL WHICH QUESTION WENT UNANSWERED; A COMMENT DOES NOT", async () => {
    const sent = capturePrompts("ok");
    await generateAutoReply("dm", "q", "a_shop", "Clothing", { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts(), []);
    await generateAutoReply("comment", "q", "a_shop", "Clothing", { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts(), []);
    expect(sent[0]).toMatch(/WHEN YOUR RECORDS DIDN'T HAVE THE ANSWER/);
    expect(sent[0]).toContain('"unanswered"');
    expect(sent[1]).not.toMatch(/WHEN YOUR RECORDS DIDN'T HAVE THE ANSWER/);
    expect(sent[1]).not.toContain('"unanswered"');
  });

  it("WHAT THE MODEL NAMES IS NARROWED TO A KNOWN CATEGORY — never the customer's words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const content = [{ type: "text", text: JSON.stringify({ reply: "It's ₹899.", unanswered: "my address is 12 Main Road" }) }];
      return { ok: true, status: 200, text: async () => JSON.stringify({ content }), json: async () => ({ content }), headers: { get: () => null } };
    }));
    const out = await generateAutoReply("dm", "q", "a_shop", "Clothing", { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts(), []);
    expect(out.unanswered).toBe("other");
  });

  it("AND NOTHING WHEN THE MODEL SAID IT COULD ANSWER", async () => {
    capturePrompts("It's ₹899.");
    const out = await generateAutoReply("dm", "q", "a_shop", "Clothing", { tone_of_voice: "warm" }, CATALOGUE, [], [], null, undefined, await facts(), []);
    expect(out.unanswered).toBeNull();
  });

  it("THE WEBHOOK HANDLER READS THE THREAD AND HANDS IT ON", () => {
    const src = code("src/lib/webhooks/autoReplyHandler.ts");
    const start = src.indexOf("const thread = await readDmThread(");
    const end = src.indexOf("await supabase.from(\"auto_reply_log\").insert(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).toMatch(/generateAutoReply\("dm",[\s\S]*?businessCtx\.facts, thread\.turns\)/);
  });
});
