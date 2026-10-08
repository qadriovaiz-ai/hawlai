// One order → lead → campaign linkage, computed once.
//
// Named orderLinkage rather than attribution because attribution.ts
// already exists and answers a different question: which CHANNEL gets
// credit for a lead, first/last/linear touch. This is the step before
// that — what is actually tied to what, and on what basis.
//
// FOUR ANSWERS TO ONE QUESTION (candle_by_qaaf, 3 Oct 2026). The
// business has exactly one real order, ₹550, and five test leads. The
// dashboard said all of this at the same time:
//
//   Customer lifetime value   1 customer, ₹550
//   Cohorts                   0 converted, ₹0
//   Campaign table            1 sale, ₹550
//   Growth Metrics            0 of 5 leads converted
//   Channel attribution       ₹0 to manual chat
//   Chat                      "20% (1 of 5), healthy" — then "0%"
//
// None of them was lying. They were reading different tables. LTV groups
// ORDERS by phone; cohorts count LEADS whose status is "converted"; the
// campaign table credits an order carrying a meta_campaign_id. The one
// order is not linked to any lead, so the orders side says 1 and the
// leads side says 0, and both are right about their own source.
//
// So the linkage is computed in one place and every surface reads it.
//
// THREE RULES, and each of them was being broken somewhere:
//
//   1. A LINK IS RECORDED OR IT DOES NOT EXIST. orders.lead_id,
//      orders.meta_campaign_id and orders.utm_campaign already exist.
//      Where they are null, the honest answer is "unlinked" — named on
//      the surface, not quietly dropped out of a denominator.
//   2. "PAID" MEANS CONFIRMED, NOT PAID-ADS. PAID_ORDER_STATUSES is
//      confirmed/shipped/delivered. A summary said a campaign "pulled in
//      ₹550 from a paid website order", which reads as ad-driven revenue
//      and means neither that nor payment_status.
//   3. A CAMPAIGN THAT HAS SERVED NO IMPRESSIONS CANNOT HAVE SOLD
//      ANYTHING. The live campaign had 0 impressions and ₹0 spend for 19
//      days and was credited 1 lead, 1 sale and ₹550. Whatever stamped
//      that campaign id on the order, it was not a stranger clicking an
//      ad nobody was shown.

import { PAID_ORDER_STATUSES } from "@/lib/claims/businessFacts";

export type OrderRow = {
  id: string;
  total: number | string | null;
  status: string | null;
  created_at: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  lead_id?: string | null;
  meta_campaign_id?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
};

export type LeadRow = {
  id: string;
  created_at: string;
  status: string | null;
  source?: string | null;
  phone?: string | null;
  email?: string | null;
  deal_value?: number | string | null;
  meta_campaign_id?: string | null;
  is_test?: boolean | null;
  /**
   * This row was found to be a duplicate and folded into another lead.
   *
   * Kept, never deleted (migration 136): the same person arriving by DM
   * and by phone is one lead, and the losing row stays so the trail is
   * readable. It must not be a second lead in any count — a duplicate
   * in the denominator halves the conversion rate on its own.
   */
  merged_into_lead_id?: string | null;
};

/** How a link was established — never an inference presented as a fact. */
export type LinkBasis = "recorded" | "matched_phone" | "matched_email" | "none";

export type LinkedOrder = {
  orderId: string;
  total: number;
  status: string;
  createdAt: string;
  /** Counts as revenue: confirmed, shipped or delivered. */
  paid: boolean;
  leadId: string | null;
  leadBasis: LinkBasis;
  campaignId: string | null;
  campaignBasis: LinkBasis;
  /** The channel this order can honestly be credited to, or null. */
  channel: string | null;
};

function digitsOf(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(-10);
}

function emailOf(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Orders with whatever link each one actually has, and the basis for it.
 *
 * A phone or email match is recorded as `matched_phone` / `matched_email`
 * rather than `recorded`, and kept separable, because it is an inference:
 * two people share a landline, a shop phone takes an order for a
 * relative. It is good enough to show the owner and not good enough to
 * put in a conversion rate without saying so.
 */
export function linkOrders(orders: OrderRow[], leads: LeadRow[]): LinkedOrder[] {
  const byId = new Map(leads.map((l) => [l.id, l]));

  /**
   * The lead a duplicate was folded into — following the chain, since a
   * merge can happen twice.
   *
   * An order pointing at a row that has since been merged still belongs
   * to that person; it belongs to their SURVIVING row. Dropping the link
   * instead would turn a tidied duplicate into an unlinked order.
   */
  const survivorOf = (lead: LeadRow | undefined): LeadRow | undefined => {
    let current = lead;
    for (let hops = 0; current?.merged_into_lead_id && hops < 5; hops++) {
      const next = byId.get(current.merged_into_lead_id);
      if (!next || next.id === current.id) break;
      current = next;
    }
    return current;
  };

  // Only surviving rows are matchable: a merged duplicate holds the same
  // phone number as its survivor, so indexing it would make the match
  // depend on which row happened to be first.
  const byPhone = new Map<string, LeadRow>();
  const byEmail = new Map<string, LeadRow>();
  for (const lead of leads) {
    if (lead.merged_into_lead_id) continue;
    const phone = digitsOf(lead.phone);
    if (phone.length === 10 && !byPhone.has(phone)) byPhone.set(phone, lead);
    const email = emailOf(lead.email);
    if (email.includes("@") && !byEmail.has(email)) byEmail.set(email, lead);
  }

  return orders.map((order) => {
    let leadId: string | null = null;
    let leadBasis: LinkBasis = "none";

    if (order.lead_id && byId.has(order.lead_id)) {
      // Through the merge, to the row that is still a lead.
      leadId = survivorOf(byId.get(order.lead_id))?.id ?? order.lead_id;
      leadBasis = "recorded";
    } else {
      const phone = digitsOf(order.customer_phone);
      const email = emailOf(order.customer_email);
      const byP = phone.length === 10 ? byPhone.get(phone) : undefined;
      const byE = email.includes("@") ? byEmail.get(email) : undefined;
      if (byP) {
        leadId = byP.id;
        leadBasis = "matched_phone";
      } else if (byE) {
        leadId = byE.id;
        leadBasis = "matched_email";
      }
    }

    // The campaign on the ORDER first — that is the strongest record
    // there is. Then the linked lead's, which is weaker: the lead came
    // from a campaign, the order came from the lead, and the second step
    // is an inference about intent.
    let campaignId: string | null = null;
    let campaignBasis: LinkBasis = "none";
    if (order.meta_campaign_id) {
      campaignId = order.meta_campaign_id;
      campaignBasis = "recorded";
    } else if (leadId) {
      const lead = byId.get(leadId);
      if (lead?.meta_campaign_id) {
        campaignId = lead.meta_campaign_id;
        campaignBasis = leadBasis === "recorded" ? "recorded" : leadBasis;
      }
    }

    const channel = order.utm_source?.trim()
      ? order.utm_source.trim()
      : campaignId
      ? "meta_ads"
      : leadId
      ? (byId.get(leadId)?.source ?? null)
      : null;

    return {
      orderId: order.id,
      total: Number(order.total ?? 0),
      status: String(order.status ?? ""),
      createdAt: order.created_at,
      paid: PAID_ORDER_STATUSES.has(String(order.status ?? "")),
      leadId,
      leadBasis,
      campaignId,
      campaignBasis,
      channel,
    };
  });
}

/**
 * Whether this row counts as a lead at all.
 *
 * ONE DEFINITION, because the same two conditions were about to be
 * pasted into three separate queries and would have drifted the moment a
 * fourth condition appeared. Applied in CODE rather than in the SQL so
 * every caller shares it — and so a row that is missing the columns
 * (an older fixture, a narrower select) counts normally instead of
 * silently vanishing.
 *
 * A merged duplicate is not a second person. The owner's own test is not
 * a customer. Both stay in the table; neither belongs in a denominator.
 */
export function countsAsLead(lead: { merged_into_lead_id?: string | null; is_test?: boolean | null }): boolean {
  return !lead.merged_into_lead_id && lead.is_test !== true;
}

export type AttributionView = {
  /** Every order, linked. */
  orders: LinkedOrder[];
  /** Confirmed or beyond — the only ones that count as revenue. */
  paidOrders: LinkedOrder[];
  revenue: number;
  /** Paid orders with no lead on either basis. Shown, never hidden. */
  unlinkedOrders: LinkedOrder[];
  /** Paid orders whose lead link is a phone or email guess, not a record. */
  inferredOrders: LinkedOrder[];
  /** Lead ids a paid order points at, however weakly. */
  convertedLeadIds: Set<string>;
  /** Leads excluded as the owner's own tests. */
  testLeadIds: Set<string>;
  /** Leads excluded as duplicates folded into another row. */
  mergedLeadIds: Set<string>;
  /** Leads that count in a denominator: real, not tests. */
  countedLeads: LeadRow[];
};

export function attribute(orders: OrderRow[], leads: LeadRow[]): AttributionView {
  const testLeadIds = new Set(leads.filter((l) => l.is_test === true).map((l) => l.id));
  const mergedLeadIds = new Set(leads.filter((l) => Boolean(l.merged_into_lead_id)).map((l) => l.id));
  // A merged duplicate is not a second lead, and the owner's own test is
  // not a customer. Both are kept in the table and out of the count.
  const countedLeads = leads.filter((l) => !testLeadIds.has(l.id) && !mergedLeadIds.has(l.id));
  const linked = linkOrders(orders, leads);
  const paidOrders = linked.filter((o) => o.paid);

  return {
    orders: linked,
    paidOrders,
    revenue: paidOrders.reduce((sum, o) => sum + o.total, 0),
    unlinkedOrders: paidOrders.filter((o) => o.leadBasis === "none"),
    inferredOrders: paidOrders.filter((o) => o.leadBasis === "matched_phone" || o.leadBasis === "matched_email"),
    convertedLeadIds: new Set(paidOrders.map((o) => o.leadId).filter((id): id is string => Boolean(id))),
    testLeadIds,
    mergedLeadIds,
    countedLeads,
  };
}

/**
 * The one conversion rate, with everything it could not account for.
 *
 * Returns null rather than a number when there is nothing to divide by —
 * and `null` is what the surfaces must print as "—", not "0%". "0 of 5
 * leads converted" and "20% (1 of 5), healthy" were the same data
 * described by two surfaces that had each decided what the missing link
 * meant.
 */
export function conversionOf(view: AttributionView): {
  rate: number | null;
  converted: number;
  leads: number;
  /** Paid orders that belong to no lead, so are in neither number. */
  unlinked: number;
  /** Of the converted, how many rest on a phone or email guess. */
  inferred: number;
} {
  const leads = view.countedLeads.length;
  const converted = view.countedLeads.filter((l) => view.convertedLeadIds.has(l.id)).length;
  return {
    rate: leads > 0 ? converted / leads : null,
    converted,
    leads,
    unlinked: view.unlinkedOrders.length,
    inferred: view.inferredOrders.length,
  };
}

/**
 * Said on any surface that reports a conversion rate.
 *
 * An order nobody can tie to a lead is not a zero and not a rounding
 * error — it is a hole in the measurement, and the owner is the one who
 * can close it by recording where the sale came from.
 */
export function unlinkedNote(view: AttributionView): string | null {
  const parts: string[] = [];
  if (view.unlinkedOrders.length > 0) {
    const n = view.unlinkedOrders.length;
    const money = view.unlinkedOrders.reduce((sum, o) => sum + o.total, 0);
    parts.push(
      `${n} paid ${n === 1 ? "order" : "orders"} (₹${money.toLocaleString("en-IN")}) ${n === 1 ? "isn't" : "aren't"} linked to any lead, so ${n === 1 ? "it isn't" : "they aren't"} in the conversion rate either way — not as a win and not as a loss.`
    );
  }
  if (view.inferredOrders.length > 0) {
    const n = view.inferredOrders.length;
    parts.push(`${n} ${n === 1 ? "is matched" : "are matched"} to a lead by phone or email rather than a recorded link, so treat ${n === 1 ? "it" : "them"} as likely rather than certain.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Revenue per campaign, refusing a credit a campaign cannot have earned.
 *
 * `impressionsOf` comes from Meta. A campaign that has served no
 * impressions has shown nobody anything, so a sale cannot have come
 * through it however the id arrived on the order — which is the live
 * case: Active for 19 days, 0 impressions, ₹0 spend, credited 1 lead,
 * 1 sale and ₹550.
 *
 * Refused credits come back named, so the surface can say what it did
 * not count and why rather than printing a quiet zero.
 */
export function revenueByCampaign(
  view: AttributionView,
  impressionsOf: (campaignId: string) => number | null
): {
  credited: Map<string, { revenue: number; conversions: number }>;
  refused: { campaignId: string; revenue: number; reason: string }[];
} {
  const credited = new Map<string, { revenue: number; conversions: number }>();
  const refused: { campaignId: string; revenue: number; reason: string }[] = [];

  for (const order of view.paidOrders) {
    if (!order.campaignId) continue;
    const impressions = impressionsOf(order.campaignId);
    // null means Meta could not be read — unknown, not zero. An
    // unreadable campaign keeps its credit and the surface says the
    // numbers could not be checked.
    if (impressions === 0) {
      refused.push({
        campaignId: order.campaignId,
        revenue: order.total,
        reason: "this campaign has never served an impression, so nobody can have reached your shop through it — the order carries its name, but the sale didn't come from the ad",
      });
      continue;
    }
    const entry = credited.get(order.campaignId) ?? { revenue: 0, conversions: 0 };
    entry.revenue += order.total;
    entry.conversions += 1;
    credited.set(order.campaignId, entry);
  }

  return { credited, refused };
}
