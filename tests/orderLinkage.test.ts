// Four answers to one question, from one order and five leads.
//
// candle_by_qaaf on 3 Oct 2026. One real order, ₹550. Five leads, all
// the owner's own tests. The dashboard said all of this at once:
//
//   Customer lifetime value   1 customer, ₹550
//   Cohorts                   0 converted, ₹0
//   Campaign table            1 sale, ₹550
//   Growth Metrics            0 of 5 leads converted
//   Channel attribution       ₹0 to manual chat
//   Chat                      "20% (1 of 5), healthy" — then "0%"
//
// None of them was lying. LTV groups ORDERS by phone; cohorts count
// LEADS whose status is "converted"; the campaign table credits an order
// carrying a meta_campaign_id. The order is linked to no lead, so the
// orders side says 1 and the leads side says 0, and each is right about
// its own table.

import { describe, it, expect } from "vitest";
import { linkOrders, attribute, conversionOf, unlinkedNote, revenueByCampaign } from "@/lib/analytics/orderLinkage";

/** The one real order: ₹550, confirmed, placed before the price rose to ₹999. */
const ORDER = {
  id: "o1",
  total: 550,
  status: "confirmed",
  created_at: "2026-09-20T10:00:00Z",
  customer_phone: "+91 98765 43210",
  customer_email: "buyer@example.com",
  lead_id: null,
  meta_campaign_id: null,
  utm_source: null,
  utm_campaign: null,
};

/** Five leads from "manual chat" — the owner's own tests. */
const LEADS = Array.from({ length: 5 }, (_, i) => ({
  id: `l${i + 1}`,
  created_at: "2026-09-18T10:00:00Z",
  status: "new",
  source: "manual chat",
  phone: null,
  email: null,
  deal_value: null,
  meta_campaign_id: null,
}));

describe("the live case: one order, five leads, no link between them", () => {
  it("says the order is paid and unlinked, rather than converted or lost", () => {
    const view = attribute([ORDER], LEADS);
    expect(view.paidOrders).toHaveLength(1);
    expect(view.revenue).toBe(550);
    expect(view.unlinkedOrders).toHaveLength(1);
    expect(view.convertedLeadIds.size).toBe(0);
  });

  it("gives ONE conversion rate, and it is 0 of 5 with the order named", () => {
    // Not "20% (1 of 5), healthy" and not a silent 0%. The order is real
    // and belongs to no lead, so it is in neither number — and the
    // surface has to say so.
    const c = conversionOf(attribute([ORDER], LEADS));
    expect(c).toEqual({ rate: 0, converted: 0, leads: 5, unlinked: 1, inferred: 0 });
  });

  it("names the hole in words the owner can act on", () => {
    const note = unlinkedNote(attribute([ORDER], LEADS));
    expect(note).toMatch(/1 paid order \(₹550\) isn't linked to any lead/);
    expect(note).toMatch(/not as a win and not as a loss/);
  });

  it("reports no rate at all when there are no leads to divide by", () => {
    // null, which a surface prints as "—". Printing 0% for "nothing to
    // measure" is the same lie as printing 100%.
    expect(conversionOf(attribute([ORDER], [])).rate).toBeNull();
  });
});

describe("a link is recorded or it does not exist", () => {
  it("uses orders.lead_id when it is set", () => {
    const [linked] = linkOrders([{ ...ORDER, lead_id: "l3" }], LEADS);
    expect(linked.leadId).toBe("l3");
    expect(linked.leadBasis).toBe("recorded");
  });

  it("ignores a lead_id pointing at a lead that isn't there", () => {
    const [linked] = linkOrders([{ ...ORDER, lead_id: "deleted" }], LEADS);
    expect(linked.leadId).toBeNull();
    expect(linked.leadBasis).toBe("none");
  });

  it("matches on phone, and says that is what it did", () => {
    // An inference, kept separable: two people share a landline, a shop
    // phone takes an order for a relative. Good enough to show the
    // owner; not good enough to put in a rate without saying so.
    const leads = [{ ...LEADS[0], phone: "9876543210" }, ...LEADS.slice(1)];
    const [linked] = linkOrders([ORDER], leads);
    expect(linked.leadId).toBe("l1");
    expect(linked.leadBasis).toBe("matched_phone");

    const view = attribute([ORDER], leads);
    expect(view.inferredOrders).toHaveLength(1);
    expect(conversionOf(view)).toMatchObject({ converted: 1, leads: 5, inferred: 1, unlinked: 0 });
    expect(unlinkedNote(view)).toMatch(/matched to a lead by phone or email rather than a recorded link/);
  });

  it("matches on email when the phone does not", () => {
    const leads = [{ ...LEADS[0], email: "BUYER@example.com" }, ...LEADS.slice(1)];
    expect(linkOrders([ORDER], leads)[0].leadBasis).toBe("matched_email");
  });

  it("prefers the recorded link over a phone that matches somebody else", () => {
    const leads = [{ ...LEADS[0], phone: "9876543210" }, ...LEADS.slice(1)];
    const [linked] = linkOrders([{ ...ORDER, lead_id: "l4" }], leads);
    expect(linked.leadId).toBe("l4");
    expect(linked.leadBasis).toBe("recorded");
  });
});

describe("'paid' means confirmed, not payment_status and not paid-ads", () => {
  it("counts confirmed, shipped and delivered", () => {
    for (const status of ["confirmed", "shipped", "delivered"]) {
      expect(attribute([{ ...ORDER, status }], LEADS).revenue, status).toBe(550);
    }
  });

  it("does not count a new or cancelled order", () => {
    for (const status of ["new", "cancelled"]) {
      const view = attribute([{ ...ORDER, status }], LEADS);
      expect(view.revenue, status).toBe(0);
      expect(view.paidOrders, status).toHaveLength(0);
    }
  });
});

describe("a campaign with no impressions cannot have sold anything", () => {
  const ORDER_WITH_CAMPAIGN = { ...ORDER, meta_campaign_id: "120254652336640260" };

  it("refuses the credit, and says why", () => {
    // THE LIVE CASE: Active on Meta for 19 days, 0 impressions, ₹0
    // spend, credited with 1 lead, 1 sale and ₹550. Whatever stamped
    // that id on the order, it was not a stranger clicking an ad nobody
    // was shown.
    const { credited, refused } = revenueByCampaign(attribute([ORDER_WITH_CAMPAIGN], LEADS), () => 0);
    expect(credited.size).toBe(0);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ campaignId: "120254652336640260", revenue: 550 });
    expect(refused[0].reason).toMatch(/never served an impression/);
    expect(refused[0].reason).toMatch(/the sale didn't come from the ad/);
  });

  it("credits a campaign that has actually been seen", () => {
    const { credited, refused } = revenueByCampaign(attribute([ORDER_WITH_CAMPAIGN], LEADS), () => 4200);
    expect(credited.get("120254652336640260")).toEqual({ revenue: 550, conversions: 1 });
    expect(refused).toEqual([]);
  });

  it("treats an unreadable campaign as unknown, not as zero", () => {
    // null is "Meta could not be read". Refusing the credit then would
    // turn an outage into a claim about the business.
    const { credited, refused } = revenueByCampaign(attribute([ORDER_WITH_CAMPAIGN], LEADS), () => null);
    expect(credited.get("120254652336640260")).toEqual({ revenue: 550, conversions: 1 });
    expect(refused).toEqual([]);
  });

  it("takes the campaign off the order before the lead's", () => {
    const leads = [{ ...LEADS[0], phone: "9876543210", meta_campaign_id: "other" }, ...LEADS.slice(1)];
    const [linked] = linkOrders([ORDER_WITH_CAMPAIGN], leads);
    expect(linked.campaignId).toBe("120254652336640260");
    expect(linked.campaignBasis).toBe("recorded");
  });

  it("inherits the lead's campaign only at the lead's own strength", () => {
    // The lead came from a campaign and the order came from the lead.
    // When the second step is a phone guess, so is the whole chain.
    const leads = [{ ...LEADS[0], phone: "9876543210", meta_campaign_id: "c9" }, ...LEADS.slice(1)];
    const [linked] = linkOrders([ORDER], leads);
    expect(linked.campaignId).toBe("c9");
    expect(linked.campaignBasis).toBe("matched_phone");
  });
});

describe("the owner's own test leads", () => {
  it("are out of the denominator once marked", () => {
    // Needs is_test (migration pending). Until the column exists every
    // lead counts, which is today's behaviour.
    const marked = LEADS.map((l) => ({ ...l, is_test: true }));
    const view = attribute([ORDER], marked);
    expect(view.testLeadIds.size).toBe(5);
    expect(view.countedLeads).toEqual([]);
    expect(conversionOf(view).rate).toBeNull();
  });

  it("count normally while the column is absent", () => {
    expect(attribute([ORDER], LEADS).countedLeads).toHaveLength(5);
  });
});
