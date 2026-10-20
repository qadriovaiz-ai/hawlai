// C2 step 4a — the plumbing, verified for nothing.
//
// What the real model does with Hinglish is a measurement, not an
// assertion: it is the founder's recall gate, run against the 135
// human-graded sentences of the 13 October baseline. These tests cover
// what CAN be pinned for free — that the call is shaped right, that a
// failure fails closed, and that a malformed claim is dropped rather
// than coerced into the wrong rule.

import { describe, it, expect, vi, afterEach } from "vitest";
import { numberSentences, needsNoRecord, CLAIM_TYPES, UNLICENSABLE_TYPES, NEEDS_RECIPIENT_RECORD, type ExtractedClaim } from "@/lib/facts/extractClaims";
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

  it("ENUMERATES AT TEMPERATURE 0 — a stochastic reader cannot be gated", async () => {
    // Gate run 3: one hedged claim was enumerated in two runs and
    // missed in the third, same sentence, same prompt. The default
    // temperature of 1.0 was sampling. Variation in a step that lists
    // what a sentence claims is not flair — it is a claim checked on
    // Monday and shipped on Tuesday.
    let body: any = null;
    globalThis.fetch = (async (_url: any, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ content: [{ type: "tool_use", name: "report_claims", input: { claims: [] } }], usage: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    await run(["The candle is ₹999."]);
    expect(body.temperature).toBe(0);
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
    // 13 -> 14 on 2026-10-16, on purpose: customer_state was added
    // after the recall gate missed "Aapka lavender candle aa raha hai".
    // Changing this number is the decision the test exists to force.
    expect(CLAIM_TYPES).toHaveLength(14);
    for (const t of UNLICENSABLE_TYPES) expect(CLAIM_TYPES).toContain(t);
    for (const t of NEEDS_RECIPIENT_RECORD) expect(CLAIM_TYPES).toContain(t);
  });

  it("CUSTOMER_STATE IS NOT UNLICENSABLE — the difference is real", () => {
    // A benefit claim can never be supported by anything. "Your order
    // is on its way" becomes supportable the day a send carries the
    // recipient's own order row. Collapsing the two would mean either
    // refusing a true order confirmation forever, or treating "sleep
    // better" as merely missing a record.
    expect(UNLICENSABLE_TYPES).not.toContain("customer_state");
    expect(NEEDS_RECIPIENT_RECORD).toEqual(["customer_state"]);
  });

  it("A CUSTOMER_STATE CLAIM IS NOT BACKED BY A BUSINESS-WIDE COUNT", () => {
    // getContext carries business.paid_orders, not this reader's order.
    // Two paid orders on record does not establish that the person
    // reading this has one of them — which is the whole reason
    // candle-08's subject line was graded F.
    const claim: ExtractedClaim = {
      sentenceIndex: 0,
      canonical: "the reader's candle is on its way",
      claimType: "customer_state",
      subject: "customer",
      polarity: "assert",
    };
    // It is enumerated, so it reaches the verifier rather than passing
    // unseen. Whether a record backs it is step 4b's job, and there is
    // no per-recipient record in the context today.
    expect(CLAIM_TYPES).toContain(claim.claimType);
    expect(needsNoRecord(claim)).toBe(false);
    expect(NEEDS_RECIPIENT_RECORD).toContain(claim.claimType);
  });

  it("the prompt tells the reader not to skip a sentence its neighbour already says", () => {
    // salon-10's "baaki hum sambhal lete hain" was skipped while five
    // plainer siblings about automatic rebooking were caught. Each
    // sentence may be sent or posted on its own.
    const src = code("src/lib/facts/extractClaims.ts");
    expect(src).toMatch(/VAGUE PROMISE IS STILL THE PROMISE/);
    expect(src).toMatch(/Never skip a sentence because another sentence nearby says the same thing/);
  });
});

function r_claims(r: Awaited<ReturnType<typeof run>>): ExtractedClaim[] {
  if (!r.ok) throw new Error(`extract failed: ${r.reason}`);
  return r.claims;
}

describe("5. what is a safety claim and what is a material claim", () => {
  it("THE PROMPT SEPARATES 'WHAT IS IN IT' FROM 'IT IS SAFE'", () => {
    // The S1 exit run removed "the keratin treatment does not use
    // ammonia-based products" TWICE, as a safety claim. The record is
    // material.ammonia = false — the exact fact. A safety claim can
    // never be supported; a material claim can, so the label decided
    // whether a true sentence survived.
    //
    // Pinned on the rule itself, because the typing happens in the
    // model and the only thing code holds is the instruction.
    const src = code("src/lib/facts/extractClaims.ts");
    expect(src).toMatch(/A STATEMENT ABOUT WHAT IS OR IS NOT IN SOMETHING IS "material", NOT "safety"/);
    // The three shapes the owner's records actually take.
    expect(src).toMatch(/do not use <substance>/);
    expect(src).toMatch(/<substance>-free/);
    expect(src).toMatch(/made without <substance>/);
    // And the line that keeps genuine safety claims where they belong.
    expect(src).toMatch(/Only a claim that the thing IS SAFE, or safe FOR SOMEONE, is "safety"/);
  });
});

describe("6. courtesy is not a capability claim", () => {
  // Run 6 removed SIXTEEN capability claims, and most were courtesy:
  // "the business is available to answer customer questions", "the
  // business wants to help customers", "everything the customer needs
  // is here". The baseline graded "Koi bhi sawaal ho toh zaroor
  // poochein. Hum yahan hain." as NOT A CLAIM. The extractor had begun
  // reading an invitation as an operational undertaking, the licence
  // table refused it, and every email lost its human half.
  //
  // Founder's scope, 19 October: a capability claim is one where the
  // business will do something BY ITSELF, operationally — rebook,
  // remind, deliver. Being available, willing or glad is not that.
  const src = () => code("src/lib/facts/extractClaims.ts");

  it("THE RULE IS THERE, WITH THE DISTINCTION STATED", () => {
    expect(src()).toMatch(/ORDINARY COURTESY IS NOT A CAPABILITY CLAIM/);
    expect(src()).toMatch(/being available, willing, glad or ready is not an operational undertaking/i);
  });

  it("AND THE PHRASES, IN BOTH LANGUAGES", () => {
    // Named because the model plainly did not recognise them as
    // non-claims on its own.
    for (const phrase of ["Ask us anything", "we are here", "hum yahan hain", "poochh lo", "shuru karein"]) {
      expect(src(), phrase).toContain(phrase);
    }
  });

  it("it says what a capability claim IS, so the rule does not swing too far", () => {
    // Deleting the capability type would be the other failure: salon-10
    // invented automatic monthly rebooking, which is exactly the shape
    // this type exists for.
    // Reworded 19 October when rule 7a grew to cover statements of
    // role; the requirement is the same one, now phrased as a test the
    // reader can apply.
    expect(src()).toMatch(/names a SPECIFIC OPERATION the business performs by itself/);
    expect(src()).toMatch(/without the customer asking each time/);
  });
});

describe("7. a statement of role is courtesy, not capability", () => {
  // Run 11's one borderline removal, which the founder confirmed:
  // "Helping the customer is the business's job." was taken out as a
  // capability claim. Saying who you are for is not an undertaking to
  // do a particular thing, and the rule now says so — with the test
  // that separates the two: can you NAME the operation?
  const src = () => code("src/lib/facts/extractClaims.ts");

  it("THE RULE COVERS ROLE AND PURPOSE, not only availability", () => {
    expect(src()).toMatch(/A STATEMENT OF ROLE OR PURPOSE IS COURTESY TOO/);
    expect(src()).toMatch(/helping you is our job/);
    expect(src()).toMatch(/aapki madad karna hamara kaam hai/);
  });

  it("AND GIVES THE TEST THAT SEPARATES THEM", () => {
    // Without a nameable operation there is nothing a record could ever
    // support, so refusing it protects nobody and costs the owner their
    // ordinary warmth.
    expect(src()).toMatch(/names a SPECIFIC OPERATION the business performs by itself/);
    expect(src()).toMatch(/If you cannot name the operation, it is not a capability claim/);
  });

  it("the real capability shape is still named, so the rule cannot swing too far", () => {
    // salon-10 invented automatic monthly rebooking. That is the shape
    // this type exists for and it must survive the narrowing.
    expect(src()).toMatch(/rebook, remind, deliver, follow up, renew/);
    expect(src()).toMatch(/without the customer asking each time/);
  });
});

describe("8. a benefit is an effect on the person, not a property of the thing", () => {
  // S2a's first WhatsApp run removed "The paneer is fresh." as a
  // benefit claim. "Made fresh every morning" is in the paneer's own
  // catalogue description and reaches the pipeline as
  // product.paneer_250g.description — so a true, recorded property was
  // refused because the extractor typed it as an effect on the reader.
  //
  // Same family as the ammonia-as-safety mislabel: the licence table is
  // only as strong as the type the model picks, and the fix belongs
  // where the typing happens.
  const src = () => code("src/lib/facts/extractClaims.ts");

  it("THE LINE IS DRAWN BY WHO THE CLAIM IS ABOUT", () => {
    expect(src()).toMatch(/A BENEFIT IS AN EFFECT ON THE PERSON\. A PROPERTY OF THE THING IS NOT/);
    expect(src()).toMatch(/about the READER, and no record can support them/);
    expect(src()).toMatch(/about the THING — its state, its make, its measurements/);
  });

  it("AND THE TRAP IS NAMED: pleasing is not the test", () => {
    // The reason the model keeps reaching for `benefit`: a recorded
    // property a customer would like reads as a benefit if you ask
    // "would they be pleased?" rather than "who is this about?".
    expect(src()).toMatch(/not a benefit just because a customer would be pleased by it/);
  });

  it("the examples are the ones that actually failed, in both directions", () => {
    expect(src()).toContain("It helps you sleep");
    expect(src()).toContain("you will taste the difference");
    expect(src()).toContain("It is fresh");
    expect(src()).toContain("it burns for 40 hours");
  });

  it("the safety rule survives the renumbering", () => {
    // 6a became 6b. The ammonia fix must not be lost in the shuffle.
    expect(src()).toMatch(/6b\. BUT A STATEMENT ABOUT WHAT IS OR IS NOT IN SOMETHING IS "material", NOT "safety"/);
  });
});

describe("9. the two shapes the founder's blind grading caught", () => {
  // Blind grading of the sixth S2a WhatsApp run, 20 October 2026, found
  // three F. One was code (notCopy.ts). These are the other two, and
  // both were the extractor failing to enumerate a claim that was
  // there:
  //
  //   salon-04  "apke baal soft aur shiny ho jayenge"
  //   dairy-10  "Fresh desi ghee and paneer"
  //
  // Measured on the live extractor by scripts/eval/gradedF.eval.ts for
  // Rs 0.93 — a gate, not an exit run. Result: the first is reported as
  // `benefit` and refused outright; the second splits into one claim
  // per product, so the ghee's has nothing to cite. Four controls were
  // sent in the same call and none was wrongly typed `benefit`.
  const src = () => code("src/lib/facts/extractClaims.ts");

  it("THE TEST IS THE SUBJECT OF THE CHANGE, NEVER THE VERB", () => {
    // Run 7 reworded the salon sentence and walked straight through my
    // first version of this rule, which listed Hinglish verb endings:
    // "pa jaao" was not on the list. A word list in disguise — the
    // thing the founder told me to stop building, built by me one
    // commit after being told.
    //
    // So the rule now leads with the test and the forms are only
    // illustrations of it.
    expect(src()).toMatch(/IF THE SENTENCE NAMES A STATE THE READER OR THEIR BELONGINGS WILL BE IN, IT IS A BENEFIT CLAIM/);
    expect(src()).toMatch(/THE TEST IS THE SUBJECT OF THE CHANGE, NEVER THE VERB/);
    expect(src()).toMatch(/what is different, and does it belong to the reader or to the seller/);
  });

  it("A BARE NOUN PHRASE WITH NO VERB IS STILL THE SAME CLAIM", () => {
    // "₹3500 mein glossy, smooth hair" asserts the outcome without a
    // verb to catch. Measured: all three wordings now come back as
    // `benefit` and are refused outright.
    expect(src()).toMatch(/A BARE NOUN PHRASE COUNTS/);
    expect(src()).toMatch(/states no verb and promises the same outcome/);
  });

  it("the failure of my own first version is recorded in the rule", () => {
    expect(src()).toMatch(/I patched this rule once with a list of verb endings and the next run simply used a different one/);
  });

  it("AND THE RULE NAMES WHAT IS NOT ONE, because over-firing is the other failure", () => {
    // Six controls were sent in the same gate call and none came back
    // a benefit: "order ho jayega", "aapko 10% off milega", "delivery
    // ho jayegi Indore mein", "free shipping bhi hai", a price and a
    // process claim.
    expect(src()).toMatch(/NOT A BENEFIT: a state of the THING ITSELF/);
    expect(src()).toMatch(/anything the BUSINESS will do or give/);
  });

  it("A FIGURE CLAIM CARRIES NOTHING BUT THE FIGURE", () => {
    // Mine, not from the grading. The figure path is arithmetic and
    // never reads the sentence for meaning, so "we charge ₹50 for
    // delivery across Indore" rode a true ₹50 into an entailed verdict
    // and the delivery area was never weighed by anything.
    expect(src()).toMatch(/A CLAIM THAT CARRIES A FIGURE CARRIES NOTHING ELSE/);
    expect(src()).toMatch(/never examined by anybody unless you report it as its own claim/);
    expect(src()).toMatch(/every condition, area, guarantee or qualifier beside it as a separate claim with NO figure/);
  });

  it("ONE PROPERTY OVER SEVERAL THINGS IS SEVERAL CLAIMS", () => {
    expect(src()).toMatch(/ONE PROPERTY OVER SEVERAL NAMED THINGS IS SEVERAL CLAIMS/);
    expect(src()).toMatch(/report the claim ONCE PER THING, each with its own aboutProduct/);
    // Why it matters, in the words that make it checkable.
    expect(src()).toMatch(/the one with evidence carries the one without/);
  });

  it("the rule is stated in shapes, never in one trade's words", () => {
    // multiTenantVocabulary would refuse "hair" or "ghee" as an
    // example, and should. The rule uses <thing A> and <thing B>.
    expect(src()).toContain("<thing A>");
    expect(src()).not.toMatch(/"Fresh desi ghee/);
  });

  it("and the rules are in order, so a later edit does not bury one", () => {
    const body = src();
    const at = (n: string) => body.indexOf(`\n${n}. `);
    expect(at("6a")).toBeGreaterThan(0);
    expect(at("6b")).toBeGreaterThan(at("6a"));
    expect(at("6c")).toBeGreaterThan(at("6b"));
    expect(at("6d")).toBeGreaterThan(at("6c"));
    expect(at("7")).toBeGreaterThan(at("6d"));
  });
});
