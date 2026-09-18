// The last departments moved onto lib/ai/claude.ts (2026-09-18): SEO,
// social, video, WhatsApp, website, brand, CRO, calls, chatbot, retention,
// pitch deck, influencers, 3D, and the two news monitors.
//
// Two rules beyond "say why":
//  - words a business's CUSTOMER reads (the website chatbot, a retention
//    message, an auto-reply) are never replaced with Hawlai's outage
//    notice — the customer gets the business's own safe line, or nothing;
//  - a monitor that couldn't check says so, instead of "no new alerts".

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async () => {} }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) }) }));

import { generateSeoTask } from "@/lib/agents/seoToolkitAgent";
import { generateSocialTask, generateAutoReply } from "@/lib/agents/socialManagementAgent";
import { generateVideoTask } from "@/lib/agents/videoMarketingAgent";
import { generateWhatsappContent } from "@/lib/agents/whatsappMarketingAgent";
import { generateBrandKit } from "@/lib/agents/brandBuildingAgent";
import { generateAeoCheck } from "@/lib/agents/aeoAgent";
import { generateBlogPost, generateSeoIdeas } from "@/lib/agents/seoAgent";
import { generateSeoPage } from "@/lib/agents/seoPageAgent";
import { generateInfluencerPlan } from "@/lib/agents/influencerAgent";
import { generate3DScene } from "@/lib/agents/threeDAgent";
import { planWebsite } from "@/lib/agents/websiteBuilderAgent";
import { runSalesAgentTurn } from "@/lib/agents/chatbotAgent";
import { generateRetentionMessage } from "@/lib/agents/retentionAgent";
import { scoreLeadFromCall } from "@/lib/agents/callScoringAgent";
import { generateDeckContent } from "@/lib/agents/pitchDeckAgent";
import { checkTopicAlerts } from "@/lib/automation/topicMonitor";
import { checkCompetitorAlerts } from "@/lib/automation/competitorMonitor";
import { resetOperatorAlerts } from "@/lib/ai/claude";

const OUTAGE = "AI features are temporarily unavailable on our side — the Hawlai team has been alerted. Please try again later.";
const BUSY = "The AI service is busy — try again in a minute.";
const CREDITS = { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } } };
const RATE = { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "rate limited" } } };

function anthropic(...replies: { status: number; body: any }[]) {
  let n = 0;
  const spy = vi.fn(async () => {
    const r = replies[Math.min(n++, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}
const okText = (text: string) => ({ status: 200, body: { content: [{ type: "text", text }], usage: { input_tokens: 5, output_tokens: 5 } } });

/** A watch list and nothing else — enough for the monitors. */
function monitorDb(table: string, rows: any[]) {
  const inserts: any[] = [];
  const from = (t: string) => {
    const api: any = {
      select: () => api, eq: () => api,
      single: async () => ({ data: { business_category: "Home fragrance" } }),
      maybeSingle: async () => ({ data: null }),
      insert: async (row: any) => (inserts.push({ t, row }), { error: null }),
      then: (res: any) => Promise.resolve({ data: t === table ? rows : [], error: null }).then(res),
    };
    return api;
  };
  return { db: { from }, inserts };
}

beforeEach(() => {
  resetOperatorAlerts();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("owner-facing generators: marked, in the approved words", () => {
  const cases: [string, () => Promise<any>][] = [
    ["SEO toolkit", () => generateSeoTask("meta_tags", "Candle by Qaaf", "Lucknow", "Home fragrance")],
    ["Social management", () => generateSocialTask("dm_automation", "Candle by Qaaf", "Home fragrance", "Diwali")],
    ["Video marketing", () => generateVideoTask("reel_script", "Candle by Qaaf", "Home fragrance", "Diwali")],
    ["WhatsApp marketing", () => generateWhatsappContent("broadcast", "Candle by Qaaf", "Home fragrance", "Diwali")],
  ];
  it.each(cases)("%s: the placeholder says why", async (_n, run) => {
    anthropic(CREDITS);
    const r = await run();
    expect(r._aiFailure).toEqual({ kind: "credits", message: OUTAGE });
    expect(JSON.stringify(r.output)).toContain(OUTAGE);
    expect(JSON.stringify(r.output)).not.toMatch(/Regenerate once|API is available/);
  });

  it("brand kit, AEO check, blog post, SEO ideas, influencer plan, website plan: marked", async () => {
    anthropic(CREDITS);
    for (const r of [
      await generateBrandKit("Candle by Qaaf", "Lucknow"),
      await generateAeoCheck("Candle by Qaaf", "Lucknow", "Home fragrance"),
      await generateBlogPost("soy candles", "Lucknow"),
      await generateSeoIdeas("soy candles", "Lucknow"),
      await generateInfluencerPlan("soy candles", "Lucknow", null),
      await planWebsite("candle shop site", "Candle by Qaaf", "Home fragrance", "Lucknow"),
    ] as any[]) {
      expect(r._aiFailure).toEqual({ kind: "credits", message: OUTAGE });
    }
  });

  it("an SEO page: nothing to publish, and why", async () => {
    anthropic(RATE);
    expect(await generateSeoPage("soy candles", "Candle by Qaaf", "Home fragrance", "Lucknow")).toEqual({ output: null, _fallback: true, _aiFailure: { kind: "rate_limited", message: BUSY } });
  });

  it("a 3D scene: the approved words, never Anthropic's raw error body", async () => {
    anthropic(CREDITS);
    expect(await generate3DScene("a rotating candle", "Candle by Qaaf", "Home fragrance")).toEqual({ html: null, error: OUTAGE });
  });

  it("the pitch deck's fallback no longer tells the owner about an Anthropic key or quota", async () => {
    anthropic(CREDITS);
    const deck: any = await generateDeckContent("Candle by Qaaf", "Lucknow", "Home fragrance", null, [], null);
    expect(JSON.stringify(deck)).not.toMatch(/Anthropic|quota|API key/i);
    expect(deck._aiFailure).toEqual({ kind: "credits", message: OUTAGE });
  });
});

describe("customer-facing words never carry Hawlai's outage notice", () => {
  it("the website chatbot answers the visitor with the business's own safe line", async () => {
    anthropic(CREDITS);
    const turn = await runSalesAgentTurn({ dealershipName: "Candle by Qaaf", businessCategory: "Home fragrance" } as any, [], "Do you ship to Delhi?");
    expect(turn.reply).toMatch(/leave your name and number/);
    expect(JSON.stringify(turn)).not.toContain("Hawlai");
  });

  it("a retention message to a past customer is the plain check-in, not an outage notice", async () => {
    anthropic(CREDITS);
    const msg = await generateRetentionMessage({ name: "Asha" } as any, null, "service_reminder");
    expect(msg).toMatch(/^Hi Asha/);
    expect(msg).not.toContain("Hawlai");
  });

  it("an auto-reply to a DM or comment: nothing is sent", async () => {
    anthropic(CREDITS);
    expect(await generateAutoReply("dm", "Price kya hai?", "Candle by Qaaf", "Home fragrance")).toBeNull();
    // …whereas a working AI's reply does go out.
    anthropic(okText('{"reply":"Lavender candle ₹550 hai — DM mein order kar sakte hain!"}'));
    expect(await generateAutoReply("dm", "Price kya hai?", "Candle by Qaaf", "Home fragrance")).toBe("Lavender candle ₹550 hai — DM mein order kar sakte hain!");
  });

  it("a call the AI couldn't score says to review it manually", async () => {
    anthropic(CREDITS);
    const score = await scoreLeadFromCall("Caller: haan, Diwali ke liye 20 candles chahiye, kal call karo.", "Asha");
    expect(score.reason).toMatch(/Couldn't analyze the call transcript automatically/);
  });
});

describe("monitors: 'couldn't check' is not 'nothing new'", () => {
  it("credits out: the run stops after the first watch and says why", async () => {
    const spy = anthropic(CREDITS);
    const { db } = monitorDb("topic_watches", [{ topic: "soy wax prices" }, { topic: "Diwali demand" }, { topic: "GST on candles" }]);
    expect(await checkTopicAlerts(db, "d1")).toEqual({ newAlerts: 0, aiFailure: { kind: "credits", message: OUTAGE } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("busy: each watch still gets its turn, and the run says why", async () => {
    const spy = anthropic(RATE);
    const { db } = monitorDb("competitor_watches", [{ competitor_name: "Rival Candles" }, { competitor_name: "Wick & Co" }]);
    expect(await checkCompetitorAlerts(db, "d1")).toEqual({ newAlerts: 0, aiFailure: { kind: "rate_limited", message: BUSY } });
    expect(spy).toHaveBeenCalledTimes(4); // two watches, one retry each
  });

  it("when it works: web-search text is read and new alerts are saved, with no failure", async () => {
    anthropic({ status: 200, body: { content: [
      { type: "server_tool_use", id: "s", name: "web_search", input: {} },
      { type: "web_search_tool_result", tool_use_id: "s", content: [] },
      { type: "text", text: '{"items":[{"title":"Soy wax up 8%","summary":"Prices rose this week.","sourceUrl":"https://example.com"}]}' },
    ], usage: { input_tokens: 5, output_tokens: 5 } } });
    const { db, inserts } = monitorDb("topic_watches", [{ topic: "soy wax prices" }]);
    expect(await checkTopicAlerts(db, "d1")).toEqual({ newAlerts: 1 });
    expect(inserts.find((i) => i.t === "topic_alerts")?.row.title).toBe("Soy wax up 8%");
  });

  it("a reply that can't be read: the approved 'something went wrong', not 'regenerate once the API is available'", async () => {
    anthropic(okText("Sure! Here are some reel ideas for Diwali..."));
    const r: any = await generateVideoTask("reel_script", "Candle by Qaaf", "Home fragrance", "Diwali");
    expect(r).toEqual({ output: { text: "Something went wrong writing this — try again. If it keeps happening, let us know." }, _fallback: true });
  });

  it("a normal reply to an owner generator carries no failure", async () => {
    anthropic(okText('{"text":"5 reel ideas"}'));
    const r: any = await generateVideoTask("reel_script", "Candle by Qaaf", "Home fragrance", "Diwali");
    expect(r._fallback).toBeUndefined();
    expect(r._aiFailure).toBeUndefined();
  });
});
