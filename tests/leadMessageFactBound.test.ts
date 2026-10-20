// S2b — THE LEAD MESSAGE ON THE FACT-BOUND PIPELINE.
//
// FOUND BY A CONFIRMATION RUN, which is the whole argument for running
// one. The parallel run of 2026-10-20 came in at Rs 1.52 against a
// Rs 7.64 estimate, and a fifth of the expected cost is the kind of
// good news that is never good news: contentAgent called the door
// WITHOUT factBound, so the run measured the old path and its grading
// sheet would have confirmed nothing at all.
//
// The same shape as the WhatsApp wiring in S2a, where the door was
// hardcoding kind: "email" — a surface that looks wired and is not.

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { generateCopy, factBoundEnabled, type CopyRequest } from "@/lib/content/generateCopy";
import { CLAUDE_MODELS } from "@/lib/models";
import { code } from "./helpers/source";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { SALON } from "../scripts/eval/fixtures";

const ORIGINAL = globalThis.fetch;
const ORIGINAL_FLAG = process.env.FACT_BOUND_COPY;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
  if (ORIGINAL_FLAG === undefined) delete process.env.FACT_BOUND_COPY;
  else process.env.FACT_BOUND_COPY = ORIGINAL_FLAG;
});
beforeEach(() => {
  process.env.FACT_BOUND_COPY = "1";
});

const FACTS = SALON.facts as unknown as BusinessFacts;
const TOPIC = "follow up with Ravi about the keratin treatment";

function request(over: Partial<CopyRequest> = {}): CopyRequest {
  return {
    topic: TOPIC,
    businessName: "Shine Studio",
    businessCategory: "Salon and grooming",
    facts: FACTS,
    mode: "draft",
    revise: true,
    operation: "follow_up_message",
    factBound: true,
    task: "lead_message",
    logContext: { supabase: {}, dealershipId: "biz_1" } as any,
    brief: { label: "follow-up whatsapp message to a lead", instructions: "Get them to book." },
    ...over,
  };
}

describe("1. the surface is actually on the pipeline", () => {
  it("OPTS IN AND DECLARES ITS OWN TASK", () => {
    const src = code("src/lib/agents/contentAgent.ts");
    expect(src).toMatch(/factBound: true/);
    expect(src).toMatch(/task: "lead_message"/);
    expect(factBoundEnabled(request())).toBe(true);
  });

  it("and the task is one getContext knows how to slice", () => {
    expect(code("src/lib/facts/getContext.ts")).toMatch(/"lead_message"/);
  });

  it("still does nothing with the flag off", () => {
    delete process.env.FACT_BOUND_COPY;
    expect(factBoundEnabled(request())).toBe(false);
  });
});

describe("2. the lead's name — PLAN-S2 called this a certainty, not a risk", () => {
  it("THE NAME IS IN THE ALLOWED VOCABULARY, VIA THE TOPIC", async () => {
    // "Hey Ravi" is a proper noun in no record, and introducedWords
    // flags a capitalised word it was not given the moment it lands in
    // a place position. It is covered because contentAgent builds the
    // topic as "follow up with <name>", and generateCopy puts req.topic
    // in the vocabulary.
    //
    // PINNED RATHER THAN TRUSTED. Nothing in contentAgent says "this is
    // how the lead's name stays legal", so without this test the next
    // person to reword that topic string would start deleting every
    // greeting in the product and have no idea why.
    const { introducedWords } = await import("@/lib/content/introducedWords");
    expect(introducedWords(["Hi Ravi, keratin treatment is ready for you."], [TOPIC])).toEqual([]);
  });

  it("the topic really does carry the name", () => {
    expect(code("src/lib/agents/contentAgent.ts")).toMatch(/follow up with \$\{lead\.name\}/);
  });

  it("AND THE VOCABULARY REALLY DOES CARRY THE TOPIC", () => {
    // Two halves of one guarantee. If either is reworded the greeting
    // starts being deleted, so both are pinned.
    const src = code("src/lib/content/generateCopy.ts");
    const vocabulary = src.slice(src.indexOf("const allowedVocabulary"), src.indexOf("introducedWords(sentences"));
    expect(vocabulary).toMatch(/req\.topic/);
  });
});

describe("3. it writes from the records like every other surface", () => {
  function script(...bodies: unknown[]) {
    const sent: any[] = [];
    let i = 0;
    globalThis.fetch = (async (_url: any, init: any) => {
      const req2 = JSON.parse(init.body);
      sent.push(req2);
      if (req2?.tool_choice?.name === "report_unlicensable") {
        return new Response(
          JSON.stringify({
            content: [{ type: "tool_use", name: "report_unlicensable", input: { claims: [] } }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      const body = bodies[Math.min(i, bodies.length - 1)];
      i += 1;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return sent;
  }
  const tool = (name: string, input: unknown) => ({ content: [{ type: "tool_use", name, input }], usage: { input_tokens: 10, output_tokens: 5 } });
  const prose = (text: string) => ({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 } });

  async function priceId(): Promise<string> {
    const { contextFromFacts } = await import("@/lib/facts/getContext");
    const ctx = contextFromFacts("biz_1", FACTS, { kind: "lead_message", topic: TOPIC });
    return ctx.records.find((r) => r.key === "product.keratin_treatment.price")!.id;
  }

  it("SELECT RUNS, AND ON SONNET", async () => {
    const id = await priceId();
    const sent = script(
      tool("select_claims", {
        claims: [{ id: "c1", claimType: "price", factIds: [id], intent: "the treatment is ₹3500", value: 3500, unit: "inr", aboutProduct: "Keratin treatment" }],
        conflicts: [],
        unknowns: [],
      }),
      prose(JSON.stringify({ message: "Hi Ravi, keratin treatment ₹3500 hai." })),
      tool("report_claims", {
        claims: [
          {
            sentenceIndex: 0,
            canonical: "the keratin treatment costs ₹3500",
            claimType: "price",
            subject: "own_product",
            polarity: "assert",
            value: { number: 3500, unit: "inr" },
            aboutProduct: "Keratin treatment",
          },
        ],
      })
    );
    const r = await generateCopy(request());
    expect(sent[0].tool_choice.name).toBe("select_claims");
    expect(sent[0].model).toBe(CLAUDE_MODELS.standard);
    expect(r.output.message).toMatch(/3500/);
    expect(r.output.message).toMatch(/Ravi/);
  });

  it("AND A CLAIM ABOUT THE READER'S OWN BOOKING IS STILL REFUSED", async () => {
    // customer_state is this surface's whole temptation: there IS a
    // lead row, and the founder's rule of 16 October is that nothing
    // supports a claim about this reader until a send carries their own
    // record.
    const id = await priceId();
    script(
      tool("select_claims", {
        claims: [{ id: "c1", claimType: "price", factIds: [id], intent: "the treatment is ₹3500", value: 3500, unit: "inr" }],
        conflicts: [],
        unknowns: [],
      }),
      prose(JSON.stringify({ message: "Aapka appointment confirm ho gaya hai." })),
      tool("report_claims", {
        claims: [
          {
            sentenceIndex: 0,
            canonical: "the reader's appointment is confirmed",
            claimType: "customer_state",
            subject: "customer",
            polarity: "assert",
          },
        ],
      })
    );
    const r = await generateCopy(request());
    expect(r.output.message).not.toMatch(/appointment confirm/);
  });
});
