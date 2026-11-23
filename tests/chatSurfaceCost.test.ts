// Which surface a Master Chat turn came in on, in the cost log.
//
// ──────────────────────────────────────────────────────────────────
// WHY THIS EXISTS, found during M4's live run on 23 November 2026.
//
// One WhatsApp message had been handled end to end, and
// `daily_message_usage.message_count` read 2. Working out that the
// second count was that day's WEB chat took a query, a timezone
// correction and a reconstruction from timestamps — because web and
// WhatsApp both logged `operation: "master_chat"`, and the cost log
// could not tell them apart at all.
//
// So the surface now travels with the cost. Which creates the FIRST
// suffixed operation in this codebase, and therefore the risk this
// file mostly exists to pin: two consumers key on the operation by
// MEANING, and both were exact matches.
//
//   departmentFor()           exact lookup, `?? "Other"`
//   admin/spend's count       `l.operation === "master_chat"`
//
// Adding a suffix without them would have moved WhatsApp cost into
// "Other" and dropped WhatsApp turns out of the master-chat count —
// both silently, and both on the day a surface was added rather than
// on the day anyone looked. departmentSpend's own header says a
// breakdown that silently loses money is worse than no breakdown.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { baseOperation, departmentFor, computeDepartmentSpend } from "@/lib/analytics/departmentSpend";
import { code } from "./helpers/source";

const WHATSAPP_ROUTE = "src/app/api/webhooks/whatsapp/route.ts";
const WEB_ROUTE = "src/app/api/master-brain/route.ts";
const SPEND_ROUTE = "src/app/api/admin/spend/route.ts";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let logged: Row[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert" || op === "update") {
        // THE CAPTURE. Every api_usage_logs write lands here, which is
        // what makes the assertions below behavioural rather than a
        // grep for a string that might never be reached.
        if (op === "insert" && table === "api_usage_logs") {
          for (const r of Array.isArray(payload) ? payload : [payload]) logged.push(r);
        }
        return { data: payload, error: null };
      }
      const found = rows();
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, lt: () => api, lte: () => api,
      not: () => api, is: () => api, in: () => api, ilike: () => api, or: () => api, range: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      update: (v: any) => ((op = "update"), (payload = v), api),
      upsert: (v: any) => ((op = "insert"), (payload = v), api),
      delete: () => ((op = "delete"), api),
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from };
}

// Mocked to the SAME fake the call is given, so the capture holds
// whichever client logUsage picks — it prefers service role when a key
// is present and falls back to the caller's otherwise.
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { runMasterBrainChat } from "@/lib/agents/masterBrainV2";

function answers(text: string) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (!String(url).includes("anthropic")) return new Response("{}", { status: 404 });
    return new Response(
      JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 } }),
      { status: 200 }
    );
  }));
}

beforeEach(() => {
  logged = [];
  tables = {
    dealerships: [{ id: "d1", dealership_name: "Test Business", business_category: "Retail", city: "Pune", business_models: ["products"] }],
    websites: [], products: [], brand_profiles: [{ dealership_id: "d1", tone_of_voice: "plain", messaging_pillars: [], preferred_language: null }],
    business_knowledge: [], business_memory: [], team_members: [], orders: [], leads: [],
    page_events: [], abandoned_carts: [], discount_codes: [], website_pages: [],
    api_usage_logs: [], daily_message_usage: [], content_pieces: [],
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const operations = () => logged.filter((r) => r.service === "anthropic").map((r) => r.operation);

describe("1. THE SURFACE IS IN THE COST ROW", () => {
  it("A WHATSAPP TURN LOGS master_chat:whatsapp", async () => {
    answers("Theek hai.");
    await runMasterBrainChat(db(), "d1", [], "kya haal hai", null, "whatsapp");
    expect(operations()).toContain("master_chat:whatsapp");
  });

  it("AND A WEB TURN KEEPS THE BARE master_chat", async () => {
    // Not tidiness. Every row logged before 23 November 2026 says
    // `master_chat` and was overwhelmingly web, so suffixing web too
    // would split one true thing in half across a deploy boundary.
    answers("Sure.");
    await runMasterBrainChat(db(), "d1", [], "what's up", "conv-1", "web");
    expect(operations()).toContain("master_chat");
    expect(operations(), "web was suffixed").not.toContain("master_chat:web");
  });

  it("THE SURFACE IS NOT INFERRED FROM A MISSING CONVERSATION", async () => {
    // THE LOAD-BEARING ONE. `conversationId` is null on a WhatsApp turn
    // and would have been a tempting proxy — but it is ALSO null on a
    // web turn sent from a fresh /chat screen, so inferring from it
    // would file real web cost under WhatsApp. Same reasoning as
    // activeProvider() refusing to guess a provider from env vars.
    answers("Sure.");
    await runMasterBrainChat(db(), "d1", [], "first message of a new chat", null);
    expect(operations()).toContain("master_chat");
    expect(operations(), "a missing conversation was read as WhatsApp").not.toContain("master_chat:whatsapp");
  });

  it("the default, with no surface argument at all, is web", async () => {
    answers("Sure.");
    await runMasterBrainChat(db(), "d1", [], "hello");
    expect(operations()).toContain("master_chat");
  });
});

describe("2. A SUFFIX CANNOT MOVE MONEY", () => {
  it("THE SUFFIXED OPERATION STAYS IN ITS DEPARTMENT", async () => {
    // Without baseOperation this is "Other", and WhatsApp's model cost
    // silently leaves AI Employee.
    expect(departmentFor("master_chat:whatsapp")).toBe("AI Employee");
    expect(departmentFor("master_chat")).toBe("AI Employee");
  });

  it("AND AN UNKNOWN OPERATION IS STILL Other, suffixed or not", async () => {
    // The fallback must not become a way for anything to match.
    expect(departmentFor("something_new")).toBe("Other");
    expect(departmentFor("something_new:whatsapp")).toBe("Other");
  });

  it("THE BREAKDOWN STILL RECONCILES TO THE TOTAL", async () => {
    const { rows, totalInr } = computeDepartmentSpend([
      { operation: "master_chat", cost_inr: 10 },
      { operation: "master_chat:whatsapp", cost_inr: 5 },
      { operation: "graphic_design", cost_inr: 2 },
    ]);
    const ai = rows.find((r) => r.department === "AI Employee");
    expect(ai?.costInr).toBe(15);
    expect(ai?.calls).toBe(2);
    expect(rows.find((r) => r.department === "Other")).toBeUndefined();
    expect(totalInr).toBe(17);
  });

  it("baseOperation cuts at the FIRST colon and leaves a plain key alone", async () => {
    expect(baseOperation("master_chat:whatsapp")).toBe("master_chat");
    expect(baseOperation("master_chat")).toBe("master_chat");
    expect(baseOperation("a:b:c")).toBe("a");
    expect(baseOperation("")).toBe("");
  });
});

describe("3. THE CONSUMERS THAT KEY ON MEANING READ IT THROUGH baseOperation", () => {
  it("THE ADMIN MESSAGE COUNT COUNTS EVERY SURFACE", () => {
    // `=== "master_chat"` here would have quietly stopped counting
    // WhatsApp turns — a number that drops with nothing looking broken.
    const s = code(SPEND_ROUTE);
    const at = s.indexOf("const totalMasterChatMessages");
    expect(at).toBeGreaterThan(-1);
    const line = s.slice(at, at + 220);
    expect(line).toMatch(/baseOperation\(l\.operation\) === "master_chat"/);
    expect(line, "an exact match would drop the suffixed surfaces").not.toMatch(/l\.operation === "master_chat"/);
  });

  it("AND THE PER-OPERATION BREAKDOWN DELIBERATELY KEEPS THE RAW VALUE", () => {
    // The opposite requirement, in the same file: byOperation is the
    // one place the surfaces SHOULD appear apart, which is the whole
    // reason the suffix was added.
    const s = code(SPEND_ROUTE);
    const at = s.indexOf("const byOperation");
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at, at + 220);
    expect(block).toMatch(/byOperation\.set\(l\.operation,/);
    expect(block, "the breakdown collapsed the surfaces together").not.toMatch(/byOperation\.set\(baseOperation/);
  });
});

describe("4. BOTH CALL SITES NAME THEIR SURFACE", () => {
  it("THE WHATSAPP WEBHOOK PASSES whatsapp", () => {
    const s = code(WHATSAPP_ROUTE);
    const at = s.indexOf("runMasterBrainChat(");
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(at, at + 160)).toMatch(/runMasterBrainChat\(supabase, dealership\.id, history, text, null, "whatsapp"\)/);
  });

  it("AND THE WEB ROUTE PASSES web RATHER THAN RELYING ON THE DEFAULT", () => {
    // A default is a decision nobody made. With both sites explicit, a
    // third surface added later cannot inherit "web" by omission.
    const s = code(WEB_ROUTE);
    const at = s.indexOf("await runMasterBrainChat(");
    expect(at).toBeGreaterThan(-1);
    const call = s.slice(at, s.indexOf(");", at));
    expect(call).toMatch(/"web"/);
  });
});
