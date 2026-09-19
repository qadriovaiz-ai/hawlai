// Retargeting audiences by how the business makes money (Retargeting R2,
// approved 2026-09-20).
//
// WHY: the four audiences were a shop's — cart, viewed, buyers, lookalike.
// A salon, a subscription box or a B2B supplier got audiences its customers
// never enter, and none of the ones they do:
//   products      cart and viewed-not-bought (pixel), lapsed buyers and
//                 customers (lists), the lookalike
//   services      opened the booking page but didn't book (pixel), enquired
//                 but didn't book (list)
//   subscription  members gone quiet (list)
//   b2b           engaged but not converted (list)
//   model not set the products set, as before
//
// Lists are built here from the business's own records, every read
// filtered by the business, and pass the same opt-out suppression as the
// CSV export (lib/ads/audienceHashing.ts). They're REPLACED in Meta on
// every sync, so someone who has since booked, converted or opted out
// drops off — appending would keep retargeting them.

import type { BusinessModel } from "@/lib/business/businessModel";
import { getCustomerRiskList } from "@/lib/agents/churnAgent";
import { normalizePhone, normalizeEmail, type AudienceRow } from "@/lib/ads/audienceHashing";

export type AudienceKey =
  | "abandoned_cart"
  | "viewed_no_purchase"
  | "lapsed_buyers"
  | "buyers"
  | "buyers_lookalike"
  | "booking_visitors"
  | "enquired_not_booked"
  | "lapsed_members"
  | "engaged_not_converted";

/** How a website audience is ruled in Meta: an event, or a visit to a page — minus an event that means they went ahead. */
export type WebsiteRule = { includeEvent: string; excludeEvent: string } | { includeUrl: "booking_page"; excludeEvent: string };

export type AudienceDefinition = {
  key: AudienceKey;
  /** The name in the business's Meta ad account. */
  name: string;
  type: "website" | "customer_list" | "lookalike";
  label: string;
  description: string;
  models: BusinessModel[];
  rule?: WebsiteRule;
  /** A lookalike's source list. */
  seed?: AudienceKey;
};

export const LAPSED_BUYER_DAYS = 60;
/** A missed monthly renewal, and two weeks' grace. */
export const LAPSED_MEMBER_DAYS = 45;
/** Enquiries this recent — the same window as the website audiences. */
export const ENQUIRY_DAYS = 30;
/** B2B decisions take longer. */
export const B2B_ENGAGED_DAYS = 90;

export const AUDIENCES: AudienceDefinition[] = [
  {
    key: "abandoned_cart", name: "Hawlai — Added to cart, didn't buy", type: "website", models: ["products"],
    label: "Added to cart but didn't buy", description: "People who put something in their cart in the last 30 days and haven't ordered.",
    rule: { includeEvent: "AddToCart", excludeEvent: "Purchase" },
  },
  {
    key: "viewed_no_purchase", name: "Hawlai — Viewed a product, didn't buy", type: "website", models: ["products"],
    label: "Viewed a product but didn't buy", description: "People who looked at a product in the last 30 days and haven't ordered.",
    rule: { includeEvent: "ViewContent", excludeEvent: "Purchase" },
  },
  {
    key: "lapsed_buyers", name: "Hawlai — Bought before, not lately", type: "customer_list", models: ["products"],
    label: "Bought before, not lately", description: `Customers whose last order was more than ${LAPSED_BUYER_DAYS} days ago.`,
  },
  {
    key: "buyers", name: "Hawlai — Customers who bought", type: "customer_list", models: ["products"],
    label: "Existing customers", description: "People who have actually ordered from you.",
  },
  {
    key: "buyers_lookalike", name: "Hawlai — People like your customers", type: "lookalike", models: ["products"],
    label: "People similar to your customers", description: "New people whose behaviour resembles your existing customers.", seed: "buyers",
  },
  {
    key: "booking_visitors", name: "Hawlai — Opened booking page, didn't book", type: "website", models: ["services"],
    label: "Opened your booking page but didn't book", description: "People who opened your booking page in the last 30 days and didn't make a booking.",
    rule: { includeUrl: "booking_page", excludeEvent: "Schedule" },
  },
  {
    key: "enquired_not_booked", name: "Hawlai — Enquired, didn't book", type: "customer_list", models: ["services"],
    label: "Enquired but didn't book", description: `People who enquired in the last ${ENQUIRY_DAYS} days and haven't booked yet.`,
  },
  {
    key: "lapsed_members", name: "Hawlai — Members gone quiet", type: "customer_list", models: ["subscription"],
    label: "Members gone quiet", description: `Members with no payment, order or visit in the last ${LAPSED_MEMBER_DAYS} days.`,
  },
  {
    key: "engaged_not_converted", name: "Hawlai — Engaged, not yet a client", type: "customer_list", models: ["b2b"],
    label: "Engaged but not yet a client", description: `Businesses you've been in touch with in the last ${B2B_ENGAGED_DAYS} days that haven't signed yet.`,
  },
];

export const AUDIENCE_BY_KEY = new Map(AUDIENCES.map((a) => [a.key, a]));

/** The audiences for this business: the ones for each way it makes money; a shop's when that isn't known. */
export function audiencesFor(models: BusinessModel[]): AudienceDefinition[] {
  const want: BusinessModel[] = models.length ? models : ["products"];
  return AUDIENCES.filter((a) => a.models.some((m) => want.includes(m)));
}

const daysAgo = (n: number, now: number) => new Date(now - n * 86_400_000).toISOString();

/** The people on a customer list, from the business's own records — each person once. Suppression is applied by the caller. */
export async function listMembers(service: any, dealershipId: string, key: AudienceKey, now: number = Date.now()): Promise<AudienceRow[]> {
  return onceEach(await rawMembers(service, dealershipId, key, now));
}

/** One row per person: the same phone (or, without one, email) in any format counts once. */
function onceEach(rows: AudienceRow[]): AudienceRow[] {
  const seen = new Set<string>();
  const out: AudienceRow[] = [];
  for (const r of rows) {
    const id = normalizePhone(r.phone) ?? normalizeEmail(r.email);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

async function rawMembers(service: any, dealershipId: string, key: AudienceKey, now: number): Promise<AudienceRow[]> {
  if (key === "buyers" || key === "lapsed_buyers") {
    const { data: orders } = await service
      .from("orders")
      .select("customer_phone, customer_email, created_at")
      .eq("dealership_id", dealershipId)
      .neq("status", "cancelled");
    if (key === "buyers") return (orders ?? []).map((o: any) => ({ phone: o.customer_phone, email: o.customer_email }));
    return lastSeenBefore(orders ?? [], daysAgo(LAPSED_BUYER_DAYS, now));
  }

  if (key === "enquired_not_booked" || key === "engaged_not_converted") {
    // New, queued or contacted — not booked, won or lost (leadProfile STAGE_MEANING).
    const stages = key === "enquired_not_booked" ? ["new", "ready_to_call", "called"] : ["called", "appointment_set"];
    const since = daysAgo(key === "enquired_not_booked" ? ENQUIRY_DAYS : B2B_ENGAGED_DAYS, now);
    const { data: leads } = await service
      .from("leads")
      .select("phone, email, status, created_at, merged_into_lead_id")
      .eq("dealership_id", dealershipId)
      .in("status", stages)
      .gte("created_at", since);
    return (leads ?? []).filter((l: any) => !l.merged_into_lead_id).map((l: any) => ({ phone: l.phone, email: l.email }));
  }

  if (key === "lapsed_members") {
    // Generic recency (approved 2026-09-17): their last payment or order, or
    // their last touch as a customer, is older than the window.
    const cutoff = daysAgo(LAPSED_MEMBER_DAYS, now);
    const [{ data: orders }, customers] = await Promise.all([
      service.from("orders").select("customer_phone, customer_email, created_at").eq("dealership_id", dealershipId).neq("status", "cancelled"),
      getCustomerRiskList(service, dealershipId).catch(() => []),
    ]);
    const fromOrders = lastSeenBefore(orders ?? [], cutoff);
    const recentPhones = new Set((orders ?? []).filter((o: any) => o.created_at >= cutoff).map((o: any) => String(o.customer_phone ?? "")).filter(Boolean));
    const fromCustomers = (customers as any[])
      .filter((c) => c.daysSince > LAPSED_MEMBER_DAYS && !recentPhones.has(String(c.phone ?? "")))
      .map((c) => ({ phone: c.phone, email: null }));
    return [...fromOrders, ...fromCustomers];
  }

  return [];
}

/** Customers (by phone, else email) whose LAST order is older than the cutoff. */
function lastSeenBefore(orders: { customer_phone: string | null; customer_email: string | null; created_at: string }[], cutoff: string): AudienceRow[] {
  const last = new Map<string, { phone: string | null; email: string | null; at: string }>();
  for (const o of orders) {
    const key = o.customer_phone || o.customer_email;
    if (!key) continue;
    const seen = last.get(key);
    if (!seen || o.created_at > seen.at) last.set(key, { phone: o.customer_phone, email: o.customer_email, at: o.created_at });
  }
  return [...last.values()].filter((c) => c.at < cutoff).map((c) => ({ phone: c.phone, email: c.email }));
}
