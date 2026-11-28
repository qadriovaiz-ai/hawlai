// A MESSAGE THE SELLER SENDS AN INSTAGRAM CUSTOMER — O5 and FU2 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// Meta's rule, from the customer's own last message: within 24 hours an
// ordinary message; 24 hours to 7 days only a person's, tagged
// HUMAN_AGENT; after 7 days nothing. The tag is set in ONE place, reached
// only when the seller sent the message themselves.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { code } from "./helpers/source";

let lastCustomerAt: string | null;
vi.mock("@/lib/dm/thread", async (orig) => ({ ...(await orig<any>()), readDmThread: async () => ({ turns: [], lastCustomerAt }) }));
const fetches: { url: string; body: any }[] = [];
let metaFails = false;
let business: any;
let waitingCards: any[];
let draft: any;
let claimed: any[];
const cards: any[] = [];
vi.mock("@/lib/crypto/oauthSecrets", () => ({
  INSTAGRAM_TOKEN_SELECT: "instagram_access_token",
  readInstagramToken: (d: any) => d?.instagram_access_token ?? null,
}));
vi.mock("@/lib/chat/requestApproval", () => ({
  requestApproval: async (_s: any, d: string, req: any) => (cards.push([d, req]), { needsApproval: true, approvalId: "ap-1" }),
}));

import { reachFor, sendSellerMessage, orderUpdateDraft, quoteFollowUpDraft, MAX_SELLER_MESSAGE } from "@/lib/dm/sellerMessage";
import { runQuoteFollowUp, FOLLOW_UP_AFTER_MS } from "@/lib/dm/quoteFollowUp";
import { getActionPolicy } from "@/lib/executionPolicy";

type Q = { table: string; op: string; filters: Record<string, any>; payload?: any };
let queries: Q[];
function db() {
  return {
    from: (table: string) => {
      const q: Q = { table, op: "select", filters: {} };
      const answer = () => {
        if (table === "agent_tasks") return { data: claimed, error: null };
        if (table === "dealerships") return { data: business, error: null };
        if (table === "dm_order_drafts") return { data: draft, error: null };
        if (table === "pending_approvals") return { data: waitingCards, error: null };
        if (table === "brand_profiles") return { data: { preferred_language: "english" }, error: null };
        return { data: null, error: null };
      };
      const api: any = {
        select: () => api,
        update: (p: any) => ((q.op = "update"), (q.payload = p), api),
        insert: async (p: any) => (queries.push({ table, op: "insert", filters: {}, payload: p }), { error: null }),
        eq: (c: string, v: any) => ((q.filters[c] = v), api),
        limit: () => api,
        maybeSingle: async () => (queries.push(q), answer()),
        then: (res: any) => (queries.push(q), Promise.resolve(answer()).then(res)),
      };
      return api;
    },
  };
}

const NOW = new Date("2026-11-30T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

beforeEach(() => {
  queries = [];
  fetches.length = 0;
  cards.length = 0;
  metaFails = false;
  lastCustomerAt = hoursAgo(2);
  business = { instagram_business_id: "ig-1", instagram_access_token: "tok", instagram_selling_enabled: true, seller_upi_vpa: "shop@okhdfcbank" };
  waitingCards = [];
  draft = { status: "open", readback: { total: 950 }, readback_sent_at: hoursAgo(30) };
  claimed = [{ id: "t1" }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      fetches.push({ url: String(url), body: JSON.parse(init.body) });
      return { ok: !metaFails, status: metaFails ? 400 : 200, json: async () => (metaFails ? { error: { message: "(#10) not allowed" } } : {}) };
    })
  );
});

describe("1. WHAT META ALLOWS, FROM THE CUSTOMER'S OWN LAST MESSAGE", () => {
  it("UNDER A DAY: ORDINARY · A DAY TO A WEEK: A PERSON'S, TAGGED · AFTER: NOTHING", () => {
    expect(reachFor(hoursAgo(23), NOW)).toEqual({ mode: "normal" });
    expect(reachFor(hoursAgo(25), NOW)).toEqual({ mode: "human_agent" });
    expect(reachFor(hoursAgo(24 * 7 - 1), NOW)).toEqual({ mode: "human_agent" });
    expect(reachFor(hoursAgo(24 * 7 + 1), NOW)).toMatchObject({ mode: "closed", why: expect.stringMatching(/more than 7 days/) });
    expect(reachFor(null, NOW)).toMatchObject({ mode: "closed", why: expect.stringMatching(/never written/) });
  });
});

describe("2. SENDING IT", () => {
  it("INSIDE A DAY: NO TAG", async () => {
    expect(await sendSellerMessage(db(), "d1", "cust-1", " Your order has shipped. ", NOW)).toEqual({ ok: true, mode: "normal" });
    expect(fetches[0].url).toContain("graph.instagram.com");
    expect(fetches[0].body).toEqual({ recipient: { id: "cust-1" }, message: { text: "Your order has shipped." } });
  });

  it("A DAY TO A WEEK: TAGGED HUMAN_AGENT, AS META REQUIRES", async () => {
    lastCustomerAt = hoursAgo(50);
    expect(await sendSellerMessage(db(), "d1", "cust-1", "Shipped!", NOW)).toEqual({ ok: true, mode: "human_agent" });
    expect(fetches[0].body).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  });

  it("AFTER A WEEK: NOTHING SENT, AND THE SELLER IS TOLD WHY", async () => {
    lastCustomerAt = hoursAgo(24 * 8);
    expect(await sendSellerMessage(db(), "d1", "cust-1", "Shipped!", NOW)).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/more than 7 days/) });
    expect(fetches).toEqual([]);
  });

  it("LOGGED IN THE CONVERSATION, WITH NO INCOMING TEXT — it never reopens the window", async () => {
    await sendSellerMessage(db(), "d1", "cust-1", "Shipped!", NOW);
    expect(queries.find((q) => q.table === "auto_reply_log")!.payload).toMatchObject({ channel: "dm_instagram", source_id: "cust-1", incoming_text: null, reply_text: "Shipped!", success: true });
  });

  it("EMPTY, TOO LONG, NO CUSTOMER, NOT CONNECTED, META REFUSING — each said, nothing pretended", async () => {
    expect(await sendSellerMessage(db(), "d1", "cust-1", "  ", NOW)).toMatchObject({ ok: false, status: 400 });
    expect(await sendSellerMessage(db(), "d1", "cust-1", "x".repeat(MAX_SELLER_MESSAGE + 1), NOW)).toMatchObject({ ok: false, status: 400 });
    expect(await sendSellerMessage(db(), "d1", "", "Hi", NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/doesn't record/) });
    business.instagram_access_token = null;
    expect(await sendSellerMessage(db(), "d1", "cust-1", "Hi", NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/isn't connected/) });
    business.instagram_access_token = "tok";
    metaFails = true;
    expect(await sendSellerMessage(db(), "d1", "cust-1", "Hi", NOW)).toMatchObject({ ok: false, status: 502, error: expect.stringMatching(/Instagram refused/) });
  });

  it("THE DRAFTS ARE CODE'S, BY STATUS — and there is none for a status that isn't news", () => {
    expect(orderUpdateDraft("shipped", "#ABC123", "Asha Crafts", "english")).toBe("Your order #ABC123 has been shipped. Thank you for ordering from Asha Crafts!");
    expect(orderUpdateDraft("delivered", "#ABC123", "Asha Crafts", "hinglish")).toMatch(/deliver ho gaya/);
    expect(orderUpdateDraft("confirmed", "#ABC123", "Asha Crafts", "english")).toBeNull();
    expect(quoteFollowUpDraft("950", "english")).toMatch(/₹950/);
  });
});

describe("3. FU2 — A CARD, NEVER A SEND", () => {
  const TASK = () => ({ id: "t1", dealership_id: "d1", action_details: { sender_id: "cust-1", readback_sent_at: draft.readback_sent_at } });

  it("QUIET FOR OVER A DAY, UNDER A WEEK: A CARD WITH THE DRAFTED MESSAGE — and nothing sent", async () => {
    lastCustomerAt = hoursAgo(31);
    expect(await runQuoteFollowUp(db(), TASK(), NOW)).toEqual({ raised: true, why: "card raised" });
    expect(cards).toEqual([["d1", expect.objectContaining({ actionType: "dm_human_message", details: expect.objectContaining({ sender_id: "cust-1", text: quoteFollowUpDraft("950", "english"), reason: "quote_followup" }), requestedBy: "seller_mode" })]]);
    expect(cards[0][1].confirm).toMatch(/only as a message from you, up to 7 days/);
    expect(fetches).toEqual([]);
    expect(FOLLOW_UP_AFTER_MS).toBeGreaterThan(24 * 3600_000);
  });

  const skips: [string, () => void, RegExp][] = [
    // Quoted 21 hours ago, the customer's last word just before it: quiet, but Meta's 24 hours aren't up.
    ["still inside 24 hours", () => ((draft.readback_sent_at = hoursAgo(21)), (lastCustomerAt = hoursAgo(22))), /still inside 24 hours/],
    ["past 7 days", () => (lastCustomerAt = hoursAgo(24 * 8)), /more than 7 days/],
    ["the customer wrote since", () => (lastCustomerAt = hoursAgo(1)), /written since/],
    ["a card already waiting", () => ((lastCustomerAt = hoursAgo(31)), (waitingCards = [{ id: "ap-0" }])), /already waiting/],
    ["Seller Mode off", () => (business.instagram_selling_enabled = false), /Seller Mode is off/],
    ["the order placed", () => (draft.status = "ordered"), /nothing is waiting/],
    ["another run has it", () => (claimed = []), /another run/],
  ];
  for (const [what, arrange, why] of skips) {
    it(`NO CARD WHEN ${what.toUpperCase()}`, async () => {
      arrange();
      const task = TASK();
      const r = await runQuoteFollowUp(db(), task, NOW);
      expect(r.raised).toBe(false);
      expect(r.why).toMatch(why);
      expect(cards).toEqual([]);
    });
  }

  it("A NEWER QUOTE HAS ITS OWN — this one raises nothing", async () => {
    lastCustomerAt = hoursAgo(31);
    const task = { id: "t1", dealership_id: "d1", action_details: { sender_id: "cust-1", readback_sent_at: hoursAgo(40) } };
    expect((await runQuoteFollowUp(db(), task, NOW)).why).toMatch(/quote has changed/);
  });
});

describe("4. WIRING AND RULES — read with comments stripped", () => {
  it("REGISTERED: A SEND, HIGH RISK, NEEDING THE SELLER'S DECISION", () => {
    expect(getActionPolicy("dm_human_message")).toMatchObject({ actionType: "send", riskLevel: "high", requiresApproval: true });
  });

  it("THE APPROVED CARD SENDS THROUGH sellerMessage — which re-reads the window then", () => {
    const src = code("src/lib/approvals/decide.ts");
    const start = src.indexOf('if (approval?.action_type === "dm_human_message") {');
    const end = src.indexOf('if (approval?.action_type === "create_page_draft") {', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = src.slice(start, end);
    expect(branch).toMatch(/const sent = await sendSellerMessage\(service, approval\.dealership_id, String\(d\?\.sender_id \?\? ""\), d\?\.text\);/);
    expect(branch).toMatch(/if \(!sent\.ok\) return NextResponse\.json\(\{ error: sent\.error \}, \{ status: sent\.status \}\);/);
  });

  it("THE HUMAN_AGENT TAG IS SET IN ONE PLACE ONLY — nothing automated reaches it", () => {
    const SRC = join(__dirname, "../src");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
      });
    const setters = walk(SRC)
      .map((p) => ({ path: relative(SRC, p).replace(/\\/g, "/"), text: code(p) }))
      .filter((f) => /humanAgent:\s*(?!opts)/.test(f.text) || /tag:\s*"HUMAN_AGENT"/.test(f.text))
      .map((f) => f.path)
      .sort();
    // The transport writes the tag; sellerMessage is the only caller that asks for it.
    expect(setters).toEqual(["lib/dm/sellerMessage.ts", "lib/instagram/dm.ts"]);
  });

  it("THE EXECUTOR IS REGISTERED, AND THE ORDERS TAB SENDS THROUGH THE SAME FUNCTION", async () => {
    const { TASK_EXECUTORS } = await import("@/lib/tasks/taskExecutors");
    expect(typeof TASK_EXECUTORS.dm_quote_followup).toBe("function");
    expect(code("src/app/api/orders/[id]/message/route.ts")).toMatch(/const sent = await sendSellerMessage\(createServiceClient\(\), found\.dealershipId, String\(found\.order\.instagram_sender_id \?\? ""\), body\?\.text\);/);
  });
});
