// The visitor who became this lead — V5a.
//
// Nothing behavioural could ever fire without this. A visitor's
// browsing lives on page_events.visitor_id; a lead lives in leads;
// there was no join between them, so "follow up because of what they
// looked at" had nothing to stand on.
//
// THE TESTS THAT MATTER are about the null case. visitor_id is
// withheld until somebody accepts cookies, so NULL is the normal
// answer — and it means "we cannot connect this person to any
// browsing", never "they browsed nothing".

import { describe, it, expect } from "vitest";
import { code, sql } from "./helpers/source";

const CHAT = "src/app/api/public/chat/route.ts";
const LEADS = "src/app/api/public/leads/route.ts";
const WIDGET = "src/components/website/ChatWidget.tsx";

describe("1. BOTH CAPTURE PATHS KEEP THE LINK", () => {
  it("THE LANDING FORM'S LEAD CARRIES IT", () => {
    const src = code(LEADS);
    const insert = src.slice(src.indexOf('from("leads").insert({'));
    const row = insert.slice(0, insert.indexOf("})"));
    expect(row).toMatch(/visitor_id: typeof visitorId === "string" && visitorId\.trim\(\) \? visitorId\.trim\(\) : null/);
  });

  it("AND SO DOES THE CHAT'S", () => {
    // Until now a lead captured through the CHAT had no link to its
    // visitor at all: the route never received an id and never bridged
    // one.
    const src = code(CHAT);
    const insert = src.slice(src.indexOf('from("leads").insert({'));
    const row = insert.slice(0, insert.indexOf("})"));
    expect(row).toMatch(/visitor_id: visitor,/);
  });

  it("A BLANK OR MISSING ID IS STORED AS NULL, not as an empty string", () => {
    // An empty string would join to nothing and look like a link that
    // exists. Null is the honest shape for "there isn't one".
    const src = code(CHAT);
    const line = src.slice(src.indexOf("const visitor ="));
    expect(line.slice(0, line.indexOf(";") + 1)).toBe(
      'const visitor = typeof visitorId === "string" && visitorId.trim() ? visitorId.trim() : null;'
    );
  });

  it("the id is read off the request, which the browser sent", () => {
    const src = code(CHAT);
    expect(src).toMatch(/const \{ slug, message, history, path, visitorId \} = await request\.json\(\);/);
  });
});

describe("2. THE CHAT'S BROWSING NOW BECOMES TOUCHPOINTS TOO", () => {
  it("IT BRIDGES, WHICH IT NEVER DID", () => {
    // The landing form has done this since migration 196. A chat
    // lead's first touch was recorded as "ai_sales_agent" and
    // everything before it was lost.
    const src = code(CHAT);
    expect(src).toMatch(/bridgeVisitorTouchpoints\(supabase, \{ leadId: newLead\.id, dealershipId, visitorId: visitor \}\)/);
  });

  it("AND ONLY FOR A LEAD THAT WAS ACTUALLY CREATED", () => {
    const src = code(CHAT);
    const guard = src.indexOf("if (newLead) {");
    const bridge = src.indexOf("bridgeVisitorTouchpoints(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(bridge);
  });

  it("the first touchpoint is still recorded, not replaced by the bridge", () => {
    const src = code(CHAT);
    expect(src).toMatch(/recordFirstTouchpoint\(supabase, \{ leadId: newLead\.id/);
  });
});

describe("3. CONSENT DECIDES, IN EXACTLY ONE PLACE", () => {
  it("THE WIDGET SENDS THE ID THROUGH THE CONSENT-GATED READER", () => {
    const src = code(WIDGET);
    const body = src.slice(src.indexOf("body: JSON.stringify("));
    expect(body.slice(0, 600)).toMatch(/visitorId: getOrCreateVisitorId\(\)/);
  });

  it("THERE IS NO SECOND FUNCTION DECIDING WHETHER AN ID MAY EXIST", () => {
    // THE LOAD-BEARING ONE. I wrote one on the way in — a
    // `visitorIdForCapture` that re-checked consent and re-wrapped the
    // try/catch — on the false belief that getOrCreateVisitorId mints
    // an id regardless. It does not: it is a re-export of consent.ts's
    // getVisitorIdIfConsented, which returns null unless consent was
    // granted. A duplicated definition of a consent rule is the worst
    // possible place for the two copies to drift.
    const utils = code("src/lib/utils.ts");
    expect(utils).toMatch(/export \{ getVisitorIdIfConsented as getOrCreateVisitorId \} from "\.\/consent";/);
    expect(utils).not.toMatch(/visitorIdForCapture/);

    const consent = code("src/lib/consent.ts");
    const fn = consent.slice(consent.indexOf("export function getVisitorIdIfConsented"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/if \(readConsent\(\) !== "granted"\) return null;/);
  });

  it("AND NO CAPTURE PATH READS localStorage ITSELF", () => {
    for (const file of [WIDGET, "src/components/website/LandingLeadForm.tsx"]) {
      expect(code(file), file).not.toMatch(/localStorage/);
    }
  });
});

describe("4. THE MIGRATION", () => {
  const migration = () => sql("supabase/migrations/231_leads_visitor_id.sql");

  it("ADDS A NULLABLE COLUMN — null is the normal case", () => {
    const m = migration();
    expect(m).toMatch(/alter table leads/i);
    expect(m).toMatch(/add column if not exists visitor_id text;/i);
    // SCOPED TO THE COLUMN DEFINITION. A bare /not null/ search matched
    // the partial index's own `where visitor_id is not null`, which is
    // the opposite of a problem — a whole-file grep for a word that
    // belongs elsewhere in the file is a false alarm waiting to be
    // loosened.
    const statement = m.slice(m.indexOf("alter table leads"));
    expect(statement.slice(0, statement.indexOf(";"))).not.toMatch(/not null/i);
  });

  it("IT IS NOT UNIQUE", () => {
    // One person can fill in a form twice, and one browser is one
    // visitor id. A unique constraint would make the second capture
    // fail outright — a privacy-friendly convenience turned into a
    // lost lead.
    expect(migration()).not.toMatch(/unique/i);
  });

  it("THE INDEX IS PARTIAL, because the column is null for most rows", () => {
    const m = migration();
    expect(m).toMatch(/create index if not exists idx_leads_visitor/i);
    expect(m).toMatch(/on leads\(dealership_id, visitor_id\)/i);
    expect(m).toMatch(/where visitor_id is not null/i);
  });

  it("AND IT CHANGES NO EXISTING ROW", () => {
    const m = migration();
    expect(m).not.toMatch(/\bupdate\b/i);
    expect(m).not.toMatch(/\bdrop\b/i);
  });
});
