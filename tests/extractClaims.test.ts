// C2 step 4a — the plumbing, verified for nothing.
//
// What the real model does with Hinglish is a measurement, not an
// assertion: it is the founder's recall gate, run against the 135
// human-graded sentences of the 13 October baseline. These tests cover
// what CAN be pinned for free — that the call is shaped right, that a
// failure fails closed, and that a malformed claim is dropped rather
// than coerced into the wrong rule.

import { describe, it, expect, vi, afterEach } from "vitest";
import { numberSentences, needsNoRecord, CLAIM_TYPES, UNLICENSABLE_TYPES, type ExtractedClaim } from "@/lib/facts/extractClaims";
import { isUnlicensable } from "@/lib/facts/factRecord";
import { code } from "./helpers/source";

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
  vi.restoreAllMocks();
});

/** A canned Anthropic reply carrying one tool_use block. */
function reply(claims: unknown[], over: Record<string, unknown> = {}) {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        content: [{ type: "tool_use", name: "report_claims", input: { claims } }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: "claude-haiku-4-5-20251001",
        ...over,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;
}

async function run(sentences: string[]) {
  const { extractClaims } = await import("@/lib/facts/extractClaims");
  return extractClaims(sentences);
}

const CLAIM = {
  sentenceIndex: 1,
  canonical: "the candle burns for 40 hours",
  claimType: "duration",
  subject: "own_product",
  polarity: "assert",
  value: { number: 40, unit: "hours" },
};

describe("1. the call", () => {
  it("FORCES THE TOOL, so the answer cannot arrive as prose", async () => {
    let body: any = null;
    globalThis.fetch = (async (_url: any, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "report_claims", input: { claims: [] } }], usage: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    await run(["Hello."]);
    expect(body.tool_choice).toEqual({ type: "tool", name: "report_claims" });
    expect(body.tools[0].name).toBe("report_claims");
  });

  it("SENDS NO RECORDS — it cannot be talked into agreeing a claim is supported", async () => {
    let body: any = null;
    globalThis.fetch = (async (_url: any, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "report_claims", input: { claims: [] } }], usage: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    await run(["The lavender candle is ₹999."]);
    const sent = JSON.stringify(body.messages) + body.system;
    // The sentence goes; nothing about the catalogue, the shipping
    // config or the owner's rows does.
    expect(sent).toContain("₹999");
    expect(sent).not.toMatch(/factId|sourceRef|catalogue:|FactRecord/);
  });

  it("uses the cheap model by default, and takes an override so the gate can price the alternative", () => {
    const src = code("src/lib/facts/extractClaims.ts");
    expect(src).toContain("CLAUDE_MODELS.fast");
    expect(src).toContain("opts.model ??");
  });

  it("numbers the sentences so a claim can point back at one", () => {
    expect(numberSentences(["A.", "B."])).toBe("[0] A.\n[1] B.");
  });

  it("spends nothing on empty input", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const r = await run(["", "   "]);
    expect(called).toBe(false);
    expect(r).toEqual({ ok: true, claims: [], costInr: 0 });
  });
});

describe("2. it fails closed", () => {
  it("A MODEL FAILURE IS NOT AN EMPTY CLAIM LIST", async () => {
    // These look identical from the outside and mean opposite things:
    // "this copy claims nothing" versus "nobody checked". F-01 was
    // exactly this confusion, one layer down.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { type: "overloaded_error", message: "overloaded" } }), { status: 529 })) as typeof fetch;
    const r = await run(["The candle is ₹999."]);
    expect(r.ok).toBe(false);
  });

  it("a reply without the tool block fails rather than reading as nothing found", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "Sure! Here are the claims..." }], usage: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    const r = await run(["The candle is ₹999."]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/did not use the tool/);
  });

  it("a tool call with no claims array fails rather than reading as nothing found", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ content: [{ type: "tool_use", name: "report_claims", input: {} }], usage: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    const r = await run(["The candle is ₹999."]);
    expect(r.ok).toBe(false);
  });

  it("an EMPTY claims array is a real answer, and says so", async () => {
    reply([]);
    const r = await run(["Hello, good to see you."]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claims).toEqual([]);
  });
});

describe("3. a malformed claim is dropped, not coerced", () => {
  it("A CLAIM TYPE OUTSIDE THE ENUM IS DROPPED", async () => {
    // Coercing "healthy" to the nearest type would send it to the
    // wrong rule and it would be judged as, say, a material. A dropped
    // claim at least shows up as a gap in the recall measurement.
    reply([{ ...CLAIM, claimType: "healthy" }, CLAIM]);
    const r = await run(["a", "b"]);
    expect(r.ok && r.claims.map((c) => c.claimType)).toEqual(["duration"]);
  });

  it("an unknown subject is dropped", async () => {
    reply([{ ...CLAIM, subject: "the_world" }]);
    expect(r_claims(await run(["a"]))).toEqual([]);
  });

  it("an empty canonical is dropped — there is nothing to judge", async () => {
    reply([{ ...CLAIM, canonical: "   " }]);
    expect(r_claims(await run(["a"]))).toEqual([]);
  });

  it("a missing polarity defaults to assert, which is the strict reading", async () => {
    reply([{ ...CLAIM, polarity: undefined }]);
    const c = r_claims(await run(["a"]))[0];
    expect(c.polarity).toBe("assert");
  });

  it("a non-numeric value becomes null rather than NaN", async () => {
    reply([{ ...CLAIM, value: { number: "forty", unit: "hours" } }]);
    expect(r_claims(await run(["a"]))[0].value).toBeNull();
  });

  it("a negative or missing sentence index becomes 0 rather than undefined", async () => {
    reply([{ ...CLAIM, sentenceIndex: -3 }, { ...CLAIM, sentenceIndex: undefined }]);
    expect(r_claims(await run(["a"])).map((c) => c.sentenceIndex)).toEqual([0, 0]);
  });
});

describe("4. what needs no record at all", () => {
  it("CAPABILITY, COMPARISON, BENEFIT AND SAFETY ARE REFUSED BY THE ABSENCE OF A LICENCE", () => {
    // Not by a pattern. "sleep better" and "safe for babies" have no
    // source that could ever support them, which is why the Hinglish
    // forms need no rule of their own.
    expect(UNLICENSABLE_TYPES.sort()).toEqual(["benefit", "capability", "comparison", "safety"]);
    expect(isUnlicensable("benefit")).toBe(true);
    expect(isUnlicensable("safety")).toBe(true);
  });

  it("a claim about a competitor needs no record whatever its type", () => {
    const comparison: ExtractedClaim = {
      sentenceIndex: 0,
      canonical: "our ghee is made differently from most supermarket ghee",
      claimType: "process",
      subject: "competitor",
      polarity: "assert",
      comparedWith: "most supermarket ghee",
    };
    // dairy-07, reviewer-graded F twice. Typed `process`, which a
    // record COULD license — but nothing a business says about itself
    // establishes a claim about someone else's product.
    expect(needsNoRecord(comparison)).toBe(true);
  });

  it("an ordinary own-product claim does need a record", () => {
    expect(
      needsNoRecord({ sentenceIndex: 0, canonical: "the candle is soy wax", claimType: "material", subject: "own_product", polarity: "assert" })
    ).toBe(false);
  });

  it("every claim type is accounted for, so a new one cannot slip in untyped", () => {
    expect(CLAIM_TYPES).toHaveLength(13);
    for (const t of UNLICENSABLE_TYPES) expect(CLAIM_TYPES).toContain(t);
  });
});

function r_claims(r: Awaited<ReturnType<typeof run>>): ExtractedClaim[] {
  if (!r.ok) throw new Error(`extract failed: ${r.reason}`);
  return r.claims;
}
