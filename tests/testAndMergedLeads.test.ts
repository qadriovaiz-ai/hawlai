// Leads that must not count: the owner's own tests, and duplicates.
//
// TEST LEADS. candle_by_qaaf's five leads are all the owner's own, made
// while trying things out. Every number was computed from them — a
// conversion rate, a Health Score, "call all 5 leads today". A test lead
// is not a customer who didn't buy; it is not a customer.
//
// MERGED DUPLICATES. leads.merged_into_lead_id has existed since
// migration 136: the same person arriving by DM and by phone is one
// lead, and the losing row is kept so the trail stays readable. Four
// places honoured it — dmLeadLinking, inboundCallLeadLinking,
// orderFulfillment, retargeting/audiences — and the COUNT surfaces did
// not. A duplicate in the denominator halves a conversion rate on its
// own, and because businessFacts.allTime.leads feeds the claims guard's
// social-proof ceiling, it also made "hundreds of happy customers"
// easier to pass.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { attribute, conversionOf, linkOrders } from "@/lib/analytics/orderLinkage";

const ORDER = {
  id: "o1",
  total: 550,
  status: "confirmed",
  created_at: "2026-09-20T10:00:00Z",
  customer_phone: "9876543210",
  customer_email: "buyer@example.com",
  lead_id: null as string | null,
};

const lead = (id: string, over: Record<string, any> = {}) => ({
  id,
  created_at: "2026-09-18T10:00:00Z",
  status: "new",
  source: "manual chat",
  phone: null,
  email: null,
  deal_value: null,
  meta_campaign_id: null,
  ...over,
});

describe("the owner's own test leads", () => {
  it("leave the denominator once marked", () => {
    const leads = [lead("l1", { is_test: true }), lead("l2", { is_test: true }), lead("l3")];
    const view = attribute([], leads);
    expect(view.testLeadIds.size).toBe(2);
    expect(view.countedLeads.map((l) => l.id)).toEqual(["l3"]);
    expect(conversionOf(view).leads).toBe(1);
  });

  it("give no rate at all when every lead was a test", () => {
    // Not 0%. There is nothing to measure, and "—" is the honest answer.
    const view = attribute([ORDER], Array.from({ length: 5 }, (_, i) => lead(`l${i}`, { is_test: true })));
    expect(conversionOf(view).rate).toBeNull();
    // The real order is still real, and still unlinked.
    expect(view.revenue).toBe(550);
    expect(view.unlinkedOrders).toHaveLength(1);
  });

  it("the toggle works both ways, and nothing marks a lead automatically", () => {
    const toggle = readFileSync("src/components/leads/TestLeadToggle.tsx", "utf8");
    // She may mis-mark one, and a mark she cannot undo is a number she
    // can never put right.
    expect(toggle).toMatch(/is_test: !isTest/);
    // No automatic marking anywhere: there is no way to detect it with
    // the current schema, and the only available signal — source being
    // "manual chat" — is also how a real walk-in customer is added.
    expect(toggle).toMatch(/page_events carries no\s*\*? ?session identifier/);
  });

  it("no code sets is_test except that toggle", () => {
    const { execFileSync } = require("child_process") as typeof import("child_process");
    const files = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f) => f !== "src/components/leads/TestLeadToggle.tsx");
    const writers: string[] = [];
    for (const file of files) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (/is_test:\s*(?:true|false|!)/.test(line)) writers.push(`${file}: ${line.trim().slice(0, 80)}`);
      }
    }
    expect(writers, `only the owner may mark a test lead:\n${writers.join("\n")}`).toEqual([]);
  });
});

describe("a merged duplicate is not a second lead", () => {
  it("leaves the denominator", () => {
    // Two rows, one person: the DM lead was folded into the phone lead.
    const leads = [lead("survivor"), lead("dupe", { merged_into_lead_id: "survivor" })];
    const view = attribute([], leads);
    expect(view.mergedLeadIds).toEqual(new Set(["dupe"]));
    expect(view.countedLeads.map((l) => l.id)).toEqual(["survivor"]);
    // THE BUG: two leads and one real person read as a 50% conversion
    // rate rather than 100%.
    expect(conversionOf(view).leads).toBe(1);
  });

  it("follows an order's recorded link through the merge to the survivor", () => {
    // The order still belongs to that person; it belongs to the row that
    // is still a lead. Dropping the link would turn a tidied duplicate
    // into an unlinked order.
    const leads = [lead("survivor"), lead("dupe", { merged_into_lead_id: "survivor" })];
    const [linked] = linkOrders([{ ...ORDER, lead_id: "dupe" }], leads);
    expect(linked.leadId).toBe("survivor");
    expect(linked.leadBasis).toBe("recorded");

    const view = attribute([{ ...ORDER, lead_id: "dupe" }], leads);
    expect(conversionOf(view)).toMatchObject({ converted: 1, leads: 1, rate: 1, unlinked: 0 });
  });

  it("follows a chain of merges, and cannot loop forever", () => {
    const leads = [lead("c"), lead("b", { merged_into_lead_id: "c" }), lead("a", { merged_into_lead_id: "b" })];
    expect(linkOrders([{ ...ORDER, lead_id: "a" }], leads)[0].leadId).toBe("c");

    const loop = [lead("x", { merged_into_lead_id: "y" }), lead("y", { merged_into_lead_id: "x" })];
    expect(() => linkOrders([{ ...ORDER, lead_id: "x" }], loop)).not.toThrow();
  });

  it("does not match a phone against a merged row", () => {
    // The duplicate holds the same number as its survivor, so indexing
    // it would make the match depend on which row happened to be first.
    const leads = [
      lead("dupe", { phone: "9876543210", merged_into_lead_id: "survivor" }),
      lead("survivor", { phone: "9876543210" }),
    ];
    const [linked] = linkOrders([ORDER], leads);
    expect(linked.leadId).toBe("survivor");
    expect(linked.leadBasis).toBe("matched_phone");
  });

  it("counts a lead with no merge mark normally", () => {
    expect(attribute([], [lead("l1"), lead("l2")]).countedLeads).toHaveLength(2);
  });
});

describe("the count surfaces share one definition", () => {
  it("every one of them filters through countsAsLead", () => {
    // Applied in CODE, not in the SQL, deliberately: three queries with
    // the same two conditions pasted in would drift the moment a fourth
    // condition appeared, and a row missing the columns would silently
    // vanish from a narrower select instead of counting normally.
    for (const file of [
      "src/lib/reports/businessNumbers.ts",
      "src/lib/claims/businessFacts.ts",
      "src/lib/strategy/diagnosis.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must import the shared predicate`).toMatch(/countsAsLead/);
      expect(source, `${file} must select the columns it needs`).toMatch(/merged_into_lead_id, is_test/);
    }
  });

  it("counts normally when a row is missing the columns", async () => {
    const { countsAsLead } = await import("@/lib/analytics/orderLinkage");
    // An older fixture, or a narrower select. Absent is not the same as
    // merged, and treating it as merged would erase real business.
    expect(countsAsLead({})).toBe(true);
    expect(countsAsLead({ merged_into_lead_id: null, is_test: false })).toBe(true);
    expect(countsAsLead({ merged_into_lead_id: "other" })).toBe(false);
    expect(countsAsLead({ is_test: true })).toBe(false);
  });

  it("which matters for the claims guard, not just the dashboard", () => {
    // businessFacts.allTime.leads is the ceiling findUnsupportedClaims
    // judges "hundreds of happy customers" against. A double-counted
    // duplicate raises that ceiling and makes an unbacked claim easier
    // to pass — a correctness problem, not a cosmetic one.
    const facts = readFileSync("src/lib/claims/businessFacts.ts", "utf8");
    expect(facts).toMatch(/leads: leads\.filter\(countsAsLead\)\.length/);
  });
});
