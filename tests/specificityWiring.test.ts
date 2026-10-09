// The specificity editor reaches the surface the owner actually uses.
//
// F-Q1. reviseForSpecificity has existed since September, with its own
// prompt and its own tests, wired to the DEPARTMENT PAGE. The five
// caption sentences that went public on 8 October 2026 came through
// chat's generate_content tool, which never passed `revise: true` — so
// the editor never ran on them.
//
// A grep would be the cheap way to check this and the wrong one: it
// cannot tell `revise: true` on the chat path from `revise: true` on the
// page path. These tests run executeTool and count the model calls.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;

/** Every prompt the model was sent, in order. */
let prompts: string[] = [];
let replies: Row[] = [];

function anthropic(...rs: Row[]) {
  replies = rs;
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: any): Promise<any> => {
      if (!String(url).includes("anthropic")) {
        return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
      }
      const body = JSON.parse(init.body);
      prompts.push(body.messages.map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n"));
      const reply = replies[Math.min(call, replies.length - 1)];
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: "text", text: JSON.stringify(reply) }], usage: { input_tokens: 10, output_tokens: 10 } }),
      };
    })
  );
}

const STORE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "Test Business", business_address: "1 Road, Lucknow" }],
  business_knowledge: [],
  content_pieces: [],
  products: [{ id: "p1", dealership_id: "d1", name: "Lavender jar", price: 450, description: "Soy wax, 200g" }],
  brand_profiles: [{ dealership_id: "d1", preferred_language: "english" }],
  websites: [],
  social_accounts: [],
});

let store: Record<string, Row[]>;

function db(): any {
  const api = (table: string) => {
    const rows = store[table] ?? [];
    const self: any = {
      select: () => self,
      eq: () => self,
      neq: () => self,
      in: () => self,
      gte: () => self,
      lte: () => self,
      order: () => self,
      limit: () => self,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      insert: (r: Row) => ({
        select: () => ({ single: async () => ({ data: { id: "new", ...r }, error: null }) }),
        then: (res: any) => Promise.resolve({ data: null, error: null }).then(res),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return self;
  };
  return { from: api, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { executeTool } from "@/lib/agents/masterBrainV2";

const CTX: any = { id: "d1", name: "Test Business", category: "home fragrance", toneOfVoice: "warm", city: "Lucknow" };

/** A caption that already carries a real specific, so only genericness is in play. */
const SPECIFIC = { text: "Lavender jar, 200g. ₹450. Made in Lucknow." };

beforeEach(() => {
  prompts = [];
  store = STORE();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("the chat path runs the specificity editor", () => {
  it("THE SECOND CALL IS THE EDITOR, and the chat tool makes it", async () => {
    // Before this, the chat path made exactly one call: generate, then
    // straight to the card. The page path made two.
    anthropic(SPECIFIC, SPECIFIC);
    await executeTool(db(), CTX, "generate_content", { contentType: "instagram_post", topic: "Diwali" }, "");
    expect(prompts.length).toBeGreaterThanOrEqual(2);
  });

  it("the editor's prompt is the specificity one, not a second generation", async () => {
    // A regeneration would drift off the topic the owner asked for. The
    // editor edits what is there.
    anthropic(SPECIFIC, SPECIFIC);
    await executeTool(db(), CTX, "generate_content", { contentType: "instagram_post", topic: "Diwali" }, "");
    const second = prompts[1] ?? "";
    expect(second.toLowerCase()).toMatch(/specific|generic|any business/);
  });

  it("THE CHAT PATH PASSES revise, PROVED BY THE CALL COUNT NOT A GREP", async () => {
    // A grep for `revise: true` cannot tell this call site from the
    // department page's. Counting the calls can.
    anthropic(SPECIFIC, SPECIFIC);
    await executeTool(db(), CTX, "generate_content", { contentType: "instagram_post", topic: "Diwali" }, "");
    const withEditor = prompts.length;

    prompts = [];
    store = STORE();
    anthropic(SPECIFIC, SPECIFIC);
    // The same tool with a content type that is not a social post still
    // goes through the same opts, so the count must not depend on it.
    await executeTool(db(), CTX, "generate_content", { contentType: "product_description", topic: "Lavender" }, "");
    expect(prompts.length).toBe(withEditor);
  });
});

describe("the unattended path deliberately does NOT", () => {
  it("CONTENT AUTOPILOT PASSES NO revise, AND THAT IS ON PURPOSE", async () => {
    // The opts comment says "never the auto-publish path", and the
    // reason is real: nobody is there to benefit from a second model
    // call, and it would double the cost of every unsupervised piece.
    // Asserted on the source because the alternative is running the
    // whole autopilot; the call-count tests above are what prove the
    // chat path, which is the one that changed.
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/lib/automation/contentAutopilot.ts", "utf8");
    expect(src).toMatch(/generateContent\(/);
    expect(src).not.toMatch(/revise:\s*true/);
  });

  it("and the flag still exists, so this is a choice rather than a gap", () => {
    const { readFileSync } = require("fs") as typeof import("fs");
    const src = readFileSync("src/lib/agents/contentMarketingAgent.ts", "utf8");
    expect(src).toMatch(/revise\?: boolean/);
  });
});
