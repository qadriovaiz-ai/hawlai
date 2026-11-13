// When the honest answer depends on the customer, ask — V4b.
//
// The founder's ask: a visitor wants to know what delivery will cost
// THEM, and the agent should not guess. It should say it wants to give
// an exact figure, ask whether it may take a number or an email, and
// tell them the business will send it — capturing a lead as a side
// effect of being honest rather than instead of it.
//
// THE TESTS THAT MATTER are the two ways this goes wrong: refusing to
// answer something the records DO answer, and promising something
// nobody will do.

import { describe, it, expect } from "vitest";
import { askRatherThanGuessRule } from "@/lib/chat/visitorPage";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { code } from "./helpers/source";

const goods = [{ id: "p-1", name: "A thing", kind: "product", price: 500, description: null, images: [], inventory: 3, category: null, active: true }];
const service = [{ id: "s-1", name: "A session", kind: "service", price: 800, description: null, images: [], inventory: null, category: null, active: true, durationMinutes: 60 }];

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return { businessName: "Example Co", products: goods, offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null }, ...over } as unknown as BusinessFacts;
}

describe("1. IT DOES NOT REFUSE WHAT THE RECORDS ANSWER", () => {
  it("THE RULE SAYS SO IN AS MANY WORDS", () => {
    // THE LOAD-BEARING ONE. Asking a visitor for their phone number to
    // tell them something already written on the page trains them to
    // distrust the question — and the next time it is asked, when it
    // IS needed, they will not answer.
    expect(askRatherThanGuessRule(facts())).toMatch(/IF THE FACTS DO ANSWER IT, JUST ANSWER IT/);
    expect(askRatherThanGuessRule(facts())).toMatch(/worse service, not safer/);
  });

  it("A RECORDED SHIPPING RATE IS NOT DECLARED UNKNOWN", () => {
    // With a flat rate on record the facts block states it, and the
    // right answer is the figure. A blanket "never answer" would
    // contradict the agent's own facts.
    const rule = askRatherThanGuessRule(facts());
    expect(rule).not.toMatch(/has NOT recorded what delivery costs/);
  });

  it("AND AN UNRECORDED ONE IS, when something physical is sold", () => {
    const rule = askRatherThanGuessRule(facts({ shipping: null }));
    expect(rule).toMatch(/has NOT recorded what delivery costs/);
    expect(rule).toMatch(/never say delivery is free/);
  });

  it("but not for a business that ships nothing", () => {
    // "Shipping: not applicable — nothing physical is sold" is what the
    // facts already say there. Raising it would invent a problem.
    const rule = askRatherThanGuessRule(facts({ products: service as any, shipping: null }));
    expect(rule).not.toMatch(/has NOT recorded what delivery costs/);
  });

  it("unreadable facts raise nothing specific, and still carry the rule", () => {
    const rule = askRatherThanGuessRule(null);
    expect(rule).not.toMatch(/has NOT recorded what delivery costs/);
    expect(rule).toMatch(/DON'T ESTIMATE/);
  });
});

describe("2. NO ESTIMATE, NO RANGE, NO 'ROUGHLY'", () => {
  it("THE THREE WAYS A GUESS GETS PAST A RULE AGAINST GUESSING", () => {
    // "Usually around ₹80" is a guess with a hedge on it, and a
    // customer reads it as a price.
    const rule = askRatherThanGuessRule(facts());
    expect(rule).toMatch(/don't estimate/i);
    expect(rule).toMatch(/don't give a range/i);
    expect(rule).toMatch(/"usually", "around" or "approximately"/);
  });

  it("IT NAMES WHAT MAKES AN ANSWER CUSTOMER-SPECIFIC — in general terms, rule 3", () => {
    // Where they are, what or how much, which date. No trade, product
    // or question list, so this reads the same for any business.
    const rule = askRatherThanGuessRule(facts());
    expect(rule).toMatch(/where they are/);
    expect(rule).toMatch(/exactly what or how much/);
    expect(rule).toMatch(/which date/);
  });
});

describe("3. THE PROMISE HAS TO BE KEEPABLE", () => {
  it("THE AGENT NEVER SAYS IT WILL TEXT, EMAIL OR CALL THEM", () => {
    // THE LOAD-BEARING ONE. Nothing in Hawlai messages a visitor
    // automatically. "I'll text you the exact rate" is a promise
    // nobody keeps, made to a real customer — the class of false claim
    // this whole layer exists to stop. The BUSINESS comes back to
    // them, which the captured lead makes true.
    const rule = askRatherThanGuessRule(facts());
    expect(rule).toMatch(/Never say that YOU will text, email or call them/);
    expect(rule).toMatch(/the business will/);
  });

  it("IT ASKS PERMISSION RATHER THAN DEMANDING, AND ASKS ONCE", () => {
    const rule = askRatherThanGuessRule(facts());
    expect(rule).toMatch(/ask if you may take their phone number or email/);
    expect(rule).toMatch(/Ask once/);
    expect(rule).toMatch(/don't ask again later/);
  });

  it("AND WHAT THEY ASKED FOR IS RECORDED, so the business knows what to send", () => {
    // A lead that says "wants a delivery price" and not to where is a
    // lead the owner cannot act on.
    expect(askRatherThanGuessRule(facts())).toMatch(/Put what they asked for in `interest`/);
  });
});

describe("4. EITHER A PHONE OR AN EMAIL IS ENOUGH", () => {
  const agent = () => code("src/lib/agents/chatbotAgent.ts");

  it("THE AGENT NO LONGER THROWS AWAY AN EMAIL-ONLY LEAD", () => {
    // Found while wiring this up: the agent required a phone, while
    // /api/public/chat has matched on "phone or email" since P2 27a-ii.
    // The two ends of one contract disagreed and the stricter end
    // silently won — so asking for "your number or email" and then
    // discarding the email was the actual behaviour.
    const src = agent();
    const start = src.indexOf("      leadCapture:");
    expect(start).toBeGreaterThan(-1);
    const gate = src.slice(start, src.indexOf("suggestBooking:", start));
    expect(gate).toMatch(/parsed\.leadCapture\.name && \(parsed\.leadCapture\.phone \|\| parsed\.leadCapture\.email\)/);
  });

  it("AND THE PROMPT ASKS FOR THE SAME THING THE CODE ACCEPTS", () => {
    // A contract stated one way to the model and enforced another way
    // in code is the shape of the bug above.
    const src = agent();
    expect(src).toMatch(/at least one of a phone number or an email address/);
    expect(src).not.toMatch(/haven't given both a name and phone number/);
  });

  it("the route already accepted either, and still does", () => {
    const route = code("src/app/api/public/chat/route.ts");
    expect(route).toMatch(/if \(leadCapture\?\.phone \|\| leadCapture\?\.email\)/);
  });

  it("A NAME IS STILL REQUIRED, and neither is ever invented", () => {
    const src = agent();
    expect(src).toMatch(/never invent the other/);
    const start = src.indexOf("      leadCapture:");
    expect(src.slice(start, start + 200)).toMatch(/parsed\.leadCapture\.name/);
  });
});

describe("5. THE AGENT IS ACTUALLY GIVEN THE RULE", () => {
  it("IT IS IN THE PROMPT", () => {
    const src = code("src/lib/agents/chatbotAgent.ts");
    expect(src).toMatch(/\$\{askRatherThanGuessRule\(context\.facts\)\}/);
  });

  it("AND IT IS BUILT FROM THE FACTS, not written as a constant", () => {
    // Which is what lets it stay quiet about shipping when shipping is
    // recorded. A constant string could not.
    const src = code("src/lib/chat/visitorPage.ts");
    const fn = src.slice(src.indexOf("export function askRatherThanGuessRule"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/physicalProducts\(facts\)/);
    expect(body).toMatch(/!facts\.shipping/);
  });
});
