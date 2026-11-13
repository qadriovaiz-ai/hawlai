// What a customer asked that the records could not answer — V4c.
//
// The most valuable row in the engine, and until now it did not exist.
// The tests that matter are about what is NOT stored: a visitor's
// sentence carries their name, number, address or situation, and this
// table is one the owner reads over a dashboard.

import { describe, it, expect } from "vitest";
import {
  questionKeyFrom,
  interviewKeys,
  gapReportRule,
  recordAnswerGap,
  OTHER_KEY,
} from "@/lib/chat/answerGaps";
import { INTERVIEW_QUESTIONS } from "@/lib/onboarding/interview";
import { code, sql } from "./helpers/source";

describe("1. THE KEYS ARE THE INTERVIEW'S OWN, READ NOT COPIED", () => {
  it("EVERY KEY THE INTERVIEW ASKS ABOUT IS ACCEPTED", () => {
    // A gap is only worth recording if the owner can be asked to close
    // it, and the interview is the thing that asks. A second list here
    // would drift, and a gap pointing at a question that no longer
    // exists is a finding nobody can close.
    const keys = interviewKeys();
    expect(keys.length).toBe(INTERVIEW_QUESTIONS.length);
    for (const q of INTERVIEW_QUESTIONS) {
      expect(questionKeyFrom(q.key), q.key).toBe(q.key);
    }
  });

  it("AND THE LIST IS NOT WRITTEN OUT IN THIS FILE", () => {
    const src = code("src/lib/chat/answerGaps.ts");
    expect(src).toMatch(/INTERVIEW_QUESTIONS\.map\(\(q\) => q\.key\)/);
    // No hand-written key would survive a question being renamed.
    for (const q of INTERVIEW_QUESTIONS.slice(0, 6)) {
      expect(src, q.key).not.toContain(`"${q.key}"`);
    }
  });

  it("ANYTHING ELSE BECOMES other — NOT TRUSTED, NOT DROPPED", () => {
    // THE LOAD-BEARING ONE. Trusting an invented key gives Tier 3 a
    // question it cannot ask; dropping the row loses the one thing that
    // is certainly true — a customer asked and got no answer.
    expect(questionKeyFrom("shipping_to_mars")).toBe(OTHER_KEY);
    expect(questionKeyFrom("")).toBe(OTHER_KEY);
    expect(questionKeyFrom(null)).toBe(OTHER_KEY);
    expect(questionKeyFrom(undefined)).toBe(OTHER_KEY);
    expect(questionKeyFrom(42)).toBe(OTHER_KEY);
    expect(questionKeyFrom({ key: "price_range" })).toBe(OTHER_KEY);
  });

  it("a key with stray spacing is still the key", () => {
    expect(questionKeyFrom("  price_range  ")).toBe("price_range");
  });

  it("other is not itself an interview question", () => {
    expect(interviewKeys()).not.toContain(OTHER_KEY);
  });
});

describe("2. THE MODEL REPORTS THE GAP; IT IS NOT GUESSED FROM THE REPLY", () => {
  it("THE PROMPT OFFERS EXACTLY THE QUESTIONS THAT EXIST", () => {
    const rule = gapReportRule();
    for (const q of INTERVIEW_QUESTIONS) expect(rule, q.key).toContain(q.key);
    expect(rule).toContain(OTHER_KEY);
  });

  it("IT ASKS ABOUT THE RECORDS BEING SILENT, not the model being unsure", () => {
    // A model that reported every hesitation would bury the real gaps
    // under its own tone.
    expect(gapReportRule()).toMatch(/about the BUSINESS's records being silent, not about you being unsure/);
    expect(gapReportRule()).toMatch(/`unanswered` is null/);
  });

  it("AND FORBIDS THE CUSTOMER'S OWN WORDS IN IT", () => {
    expect(gapReportRule()).toMatch(/Never put the customer's own words, name, number or address/);
    expect(gapReportRule()).toMatch(/a category, not a quote/);
  });

  it("THE AGENT IS GIVEN THE RULE AND RETURNS THE FIELD", () => {
    const src = code("src/lib/agents/chatbotAgent.ts");
    expect(src).toMatch(/\$\{gapReportRule\(\)\}/);
    expect(src).toMatch(/"unanswered": "<a question key, or other>" or null/);
    expect(src).toMatch(/unanswered: typeof parsed\.unanswered === "string" \? parsed\.unanswered : null/);
  });

  it("THE FALLBACK REPLY REPORTS NO GAP", () => {
    // The fallback is this product failing, not the business's records
    // being silent. Recording it would send the owner an interview
    // question to answer for an outage.
    const src = code("src/lib/agents/chatbotAgent.ts");
    const start = src.indexOf("const fallback: SalesAgentResult");
    expect(start).toBeGreaterThan(-1);
    const fallback = src.slice(start, src.indexOf("};", start));
    expect(fallback).toMatch(/unanswered: null/);
  });
});

describe("3. NEITHER THE CONVERSATION NOR THE PERSON IS STORED", () => {
  function db(onInsert: (row: any) => any = () => ({ error: null })) {
    const rows: any[] = [];
    return {
      rows,
      client: {
        from: (table: string) => ({
          insert: (row: any) => {
            rows.push({ table, row });
            return Promise.resolve(onInsert(row));
          },
        }),
      } as any,
    };
  }

  it("THE ROW IS A QUESTION KEY, A SOURCE AND A BUSINESS — NOTHING ELSE", () => {
    // THE LOAD-BEARING ONE. "My mother is in hospital in Gomti Nagar,
    // can you deliver by six" is a sentence this must never keep.
    const { rows, client } = db();
    return recordAnswerGap(client, "d1", "areas_served").then(() => {
      expect(rows).toHaveLength(1);
      expect(rows[0].table).toBe("answer_gaps");
      expect(Object.keys(rows[0].row).sort()).toEqual(["dealership_id", "question_key", "source"]);
      expect(rows[0].row).toEqual({
        dealership_id: "d1",
        question_key: "areas_served",
        source: "website_chat",
      });
    });
  });

  it("NO VISITOR ID — the gap belongs to the business, not the person", () => {
    const src = code("src/lib/chat/answerGaps.ts");
    expect(src).not.toMatch(/visitor_id|visitorId/);
    // ...and no field that could carry a sentence.
    expect(src).not.toMatch(/\bmessage\b.*:/);
    expect(src).not.toMatch(/question_text|asked_text|transcript/);
  });

  it("AND THE KEY IS VALIDATED AT THE POINT OF STORAGE", () => {
    const { rows, client } = db();
    return recordAnswerGap(client, "d1", "made_up_key").then(() => {
      expect(rows[0].row.question_key).toBe(OTHER_KEY);
    });
  });

  it("THE ROUTE PASSES NO MESSAGE TEXT TO IT", () => {
    const src = code("src/app/api/public/chat/route.ts");
    expect(src).toMatch(/recordAnswerGap\(supabase, dealershipId, unanswered\)/);
  });

  it("and it is recorded whether or not they left their details", () => {
    // A visitor who asks and leaves has still told us what is missing.
    const src = code("src/app/api/public/chat/route.ts");
    const gap = src.indexOf("recordAnswerGap(");
    const lead = src.indexOf("if (leadCapture?.phone || leadCapture?.email)");
    expect(gap).toBeGreaterThan(-1);
    expect(lead).toBeGreaterThan(-1);
    expect(gap).toBeLessThan(lead);
  });
});

describe("4. A FAILED WRITE NEVER REACHES THE VISITOR", () => {
  it("A DATABASE ERROR RETURNS FALSE, it does not throw", async () => {
    // A visitor is waiting on the other end of this request. A logging
    // table being unavailable is not a reason to fail their question.
    const failing = { from: () => ({ insert: () => Promise.resolve({ error: { message: "boom" } }) }) } as any;
    expect(await recordAnswerGap(failing, "d1", "price_range")).toBe(false);
  });

  it("AND A THROWING CLIENT IS CAUGHT TOO", async () => {
    const throwing = { from: () => { throw new Error("no connection"); } } as any;
    expect(await recordAnswerGap(throwing, "d1", "price_range")).toBe(false);
  });

  it("a missing client or business is refused quietly", async () => {
    expect(await recordAnswerGap(null, "d1", "price_range")).toBe(false);
    expect(await recordAnswerGap({} as any, "", "price_range")).toBe(false);
  });

  it("THE ROUTE DOES NOT AWAIT IT IN A WAY THAT CAN FAIL THE REPLY", () => {
    const src = code("src/app/api/public/chat/route.ts");
    // It is awaited (so the row lands before the function returns on a
    // serverless runtime) but cannot throw — see the tests above.
    expect(src).toMatch(/if \(unanswered\) await recordAnswerGap\(/);
  });
});

describe("5. THE CONVERSATION IS NO LONGER INVISIBLE AFTER ITS FIRST SECOND", () => {
  it("EVERY MESSAGE IS COUNTED, THROUGH THE EXISTING TRACK ROUTE", () => {
    // Which is what gives it the owner-exclusion and the consent
    // handling for free, rather than a second path that has neither.
    const src = code("src/components/website/ChatWidget.tsx");
    expect(src).toMatch(/trackEvent\(slug, "chat_message"\)/);
  });

  it("AND THE TRACK ROUTE ACCEPTS IT", () => {
    const src = code("src/app/api/public/track/route.ts");
    const list = src.slice(src.indexOf("const VALID_EVENTS"));
    expect(list.slice(0, list.indexOf(";"))).toContain('"chat_message"');
  });

  it("NO MESSAGE TEXT IS SENT WITH IT — the call takes two arguments, both known", () => {
    // THIS ASSERTION WAS VACUOUS AND A MUTATION SHOWED IT. It sliced
    // from `indexOf('trackEvent(slug, "chat_message")')`, so adding a
    // third argument made that exact string vanish, indexOf returned
    // -1, and the slice examined a stray character at the end of the
    // file — which contains neither "text" nor "input", so it passed
    // while the mutant shipped the visitor's message to the tracker.
    // An indexOf that misses must FAIL, not pass quietly: the fifth
    // time this shape of bug has appeared in this session's tests.
    const src = code("src/components/website/ChatWidget.tsx");
    const call = src.match(/trackEvent\(slug, "chat_message"[^)]*\)/);
    expect(call, "the chat_message call is not there at all").not.toBeNull();
    expect(call![0]).toBe('trackEvent(slug, "chat_message")');
  });
});

describe("6. THE MIGRATION", () => {
  const migration = () => sql("supabase/migrations/230_answer_gaps.sql");

  it("CREATES THE TABLE WITH NO COLUMN FOR A MESSAGE", () => {
    const m = migration();
    expect(m).toMatch(/create table if not exists answer_gaps/i);
    expect(m).toMatch(/question_key text not null/i);
    expect(m).not.toMatch(/visitor_id/i);
    expect(m).not.toMatch(/\bmessage\b/i);
    expect(m).not.toMatch(/transcript/i);
  });

  it("RLS IS ON, WITH A SELECT POLICY AND NO INSERT POLICY", () => {
    // Nothing a browser sends should be able to create a finding about
    // a business. The only writer is the public route's service client.
    const m = migration();
    expect(m).toMatch(/alter table answer_gaps enable row level security/i);
    expect(m).toMatch(/for select using/i);
    expect(m).not.toMatch(/for insert/i);
    expect(m).not.toMatch(/for all/i);
  });

  it("AND THE OWNER IS THE ONLY READER", () => {
    expect(migration()).toMatch(/dealership_id in \(select id from dealerships where owner_id = auth\.uid\(\)\)/i);
  });
});
