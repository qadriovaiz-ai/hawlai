// The owner's Preferred Ad Language reaches the CHAT, not just the
// generators (2026-09-21).
//
// THE SECOND REPORT: Settings still said English, and chat still wrote
// "Khud banao. Khud le jaao… ₹800 · Slots limited · Book karo".
//
// 7f1972c made the setting a rule inside every generator — and it holds
// there (tests/preferredLanguage.test.ts). This caption never went
// through one. The chat AI wrote it into its own reply, and its own
// prompt had no language or tone rule anywhere in it: only the facts
// line "Preferred language: english", printed under ten Business Story
// answers in full Hinglish. The same weak signal, one layer up.
//
// The rule now sits in the chat prompt, right after those answers. The
// other half of the fix is that copy belongs in a tool at all — where
// the story check, the claims check and the link check live too.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let systems: string[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert" || op === "update") return { data: payload, error: null };
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

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { runMasterBrainChat } from "@/lib/agents/masterBrainV2";

// The owner's real Business Story answers: ten of these, in Hinglish, is
// what the one-line setting was competing against.
const STORY = [
  { id: "k1", dealership_id: "d1", is_active: true, category: "business_story", title: "Kaise shuru hua", content: "Lockdown mein ghar pe pehli candle banayi thi, dost ke liye." },
  { id: "k2", dealership_id: "d1", is_active: true, category: "business_story", title: "Sabse mushkil", content: "Temperature timing sabse mushkil step hai — ek baar jaldi mein poora batch kharab kiya tha." },
  { id: "k3", dealership_id: "d1", is_active: true, category: "business_story", title: "Curing", content: "Har candle 24 ghante cure hoti hai, jaldi nahi." },
];

function say(text: string) {
  systems = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
    if (!String(url).includes("anthropic")) return new Response("{}", { status: 404 });
    systems.push(String(JSON.parse(init.body).system ?? ""));
    return new Response(
      JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 } }),
      { status: 200 }
    );
  }));
}

function setup(language: string | null) {
  tables = {
    dealerships: [{ id: "d1", dealership_name: "Candle by Qaaf", business_category: "Home fragrance", city: "Shahjahanpur", business_models: ["products", "services"] }],
    websites: [{ id: "w1", dealership_id: "d1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
    products: [{ id: "p1", dealership_id: "d1", name: "Candle Making Workshop", kind: "service", price: 800, duration_minutes: 90, images: [], is_active: true }],
    brand_profiles: [{ dealership_id: "d1", tone_of_voice: "warm, no hype", messaging_pillars: [], preferred_language: language }],
    business_knowledge: STORY, business_memory: [], team_members: [], orders: [], leads: [],
    page_events: [], abandoned_carts: [], discount_codes: [], website_pages: [],
    api_usage_logs: [], daily_message_usage: [], content_pieces: [],
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the setting reaches the chat prompt as a rule", () => {
  it("English is an instruction, not a field — and it comes AFTER the Hinglish story answers", async () => {
    setup("english");
    say("Ho gaya.");
    await runMasterBrainChat(db(), "d1", [], "chhota punchy caption banao");

    const prompt = systems[0];
    expect(prompt).toContain("Write EVERY word of this piece in English");
    expect(prompt).toContain("these are settings the owner chose");
    // The owner's Hinglish notes are in there, and the rule answers them.
    expect(prompt).toContain("Temperature timing sabse mushkil");
    expect(prompt.indexOf("Write EVERY word")).toBeGreaterThan(prompt.indexOf("Temperature timing sabse mushkil"));
  });

  it("it covers what the AI writes itself, and not how it talks to the owner", async () => {
    setup("english");
    say("Ho gaya.");
    await runMasterBrainChat(db(), "d1", [], "caption do");
    expect(systems[0]).toContain("This covers the words YOU write, not just what a tool returns");
    expect(systems[0]).toContain("stays in whatever language they are writing to you in");
  });

  it("the tone is carried the same way", async () => {
    setup("english");
    say("Ho gaya.");
    await runMasterBrainChat(db(), "d1", [], "caption do");
    expect(systems[0]).toContain("Tone: warm, no hype");
    expect(systems[0]).toContain("the notes are a record, not a style guide");
  });

  it("THE REASON IT CAME BACK: the Brand Voice block no longer argues the other way", async () => {
    // hinglish_ok defaults to true for every business that hasn't been
    // through voice extraction, so this block said "don't force pure
    // English" under a heading that says to follow it exactly — in the
    // same prompt as the English rule. formatFactsForCopy prints the same
    // block, so every generator carried the contradiction too.
    setup("english");
    say("Ho gaya.");
    await runMasterBrainChat(db(), "d1", [], "caption do");
    expect(systems[0]).not.toContain("don't force pure English");
    expect(systems[0]).toContain("set their copy language to English — that settles it");
  });

  it("Hinglish left as it is stays Hinglish — the default isn't touched", async () => {
    setup("hinglish");
    say("Ho gaya.");
    await runMasterBrainChat(db(), "d1", [], "caption do");
    expect(systems[0]).toContain("natural Hinglish");
    expect(systems[0]).not.toContain("Write EVERY word of this piece in English");
  });

  it("nothing set: the product's own default, never an empty rule", async () => {
    setup(null);
    say("Ho gaya.");
    await runMasterBrainChat(db(), "d1", [], "caption do");
    expect(systems[0]).toContain("natural Hinglish");
  });
});

describe("copy belongs in a tool, where every check lives", () => {
  it("the chat is told to generate copy, not type it out — with the reason", async () => {
    setup("english");
    say("Ho gaya.");
    await runMasterBrainChat(db(), "d1", [], "caption do");
    const prompt = systems[0];
    expect(prompt).toContain("Copy a customer will read goes through the tool");
    expect(prompt).toContain("even one line");
    // Named, so it can't be read as advice about long-form only.
    for (const word of ["caption", "headline", "subject line", "tagline"]) expect(prompt).toContain(word);
  });
});

describe("the generators chat hands off to", () => {
  it("social replies and auto-replies carry the rule too — both are read by customers", () => {
    const src = readFileSync("src/lib/agents/socialManagementAgent.ts", "utf8");
    // Two generators in this file: reply suggestions/templates, and the
    // unreviewed DM/comment auto-reply.
    expect(src.match(/soundRule\(/g) ?? []).toHaveLength(2);
    expect(readFileSync("src/lib/webhooks/autoReplyHandler.ts", "utf8")).toContain("preferred_language: businessCtx.facts?.brand?.language");
    expect(readFileSync("src/app/api/social/management/route.ts", "utf8")).toContain('select("tone_of_voice, preferred_language")');
    expect(readFileSync("src/lib/agents/masterBrainV2.ts", "utf8")).toContain("preferred_language: socialFacts?.brand?.language ?? null");
  });
});
