// ------------------------------------------------------------------
// True LTV + cohort analysis — P3 pieces 8b / 8c
// ------------------------------------------------------------------
// Both read the same lead/order data, so they live together rather
// than double-fetching it.
//
// HONESTY RULE, applied throughout: lifetime value only means
// something for businesses whose customers buy more than once. For a
// car dealership or a real-estate business, "lifetime value" is one
// transaction, and calling that LTV would dress a single sale up as
// something it isn't. So repeatRate is computed and surfaced, and the
// UI shows a plain disclaimer whenever the data shows one purchase
// per customer — rather than implying the business is underperforming
// on a metric that doesn't apply to it.
// ------------------------------------------------------------------

export interface CustomerLtv {
  customerKey: string; // phone (normalized) — the identity key P2 27a-iii already established
  name: string;
  orderCount: number;
  totalSpend: number;
  firstOrderAt: string;
  lastOrderAt: string;
}

export interface LtvSummary {
  customers: CustomerLtv[];
  customerCount: number;
  totalRevenue: number;
  avgLtv: number;
  avgOrdersPerCustomer: number;
  repeatCustomerCount: number;
  repeatRate: number; // 0-1
  // Drives the disclaimer — true when essentially nobody buys twice,
  // meaning "LTV" here is really just "average order value".
  isEssentiallySinglePurchase: boolean;
}

interface OrderRow {
  customer_phone: string | null;
  customer_name: string | null;
  total: number | string | null;
  created_at: string;
  payment_status?: string | null;
  status?: string | null;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function computeLtv(orders: OrderRow[]): LtvSummary {
  const byCustomer = new Map<string, CustomerLtv>();

  for (const o of orders) {
    // Cancelled orders never represent real value; unpaid ones haven't
    // yet. Counting either would inflate LTV with money that never
    // arrived.
    if (o.status === "cancelled") continue;
    if (o.payment_status && o.payment_status !== "paid") continue;
    if (!o.customer_phone) continue;

    const key = normalizePhone(o.customer_phone);
    if (!key) continue;

    const amount = Number(o.total) || 0;
    const existing = byCustomer.get(key);
    if (existing) {
      existing.orderCount += 1;
      existing.totalSpend += amount;
      if (o.created_at < existing.firstOrderAt) existing.firstOrderAt = o.created_at;
      if (o.created_at > existing.lastOrderAt) existing.lastOrderAt = o.created_at;
    } else {
      byCustomer.set(key, {
        customerKey: key,
        name: o.customer_name ?? "Customer",
        orderCount: 1,
        totalSpend: amount,
        firstOrderAt: o.created_at,
        lastOrderAt: o.created_at,
      });
    }
  }

  const customers = Array.from(byCustomer.values()).sort((a, b) => b.totalSpend - a.totalSpend);
  const customerCount = customers.length;
  const totalRevenue = customers.reduce((s, c) => s + c.totalSpend, 0);
  const totalOrders = customers.reduce((s, c) => s + c.orderCount, 0);
  const repeatCustomerCount = customers.filter((c) => c.orderCount > 1).length;
  const repeatRate = customerCount > 0 ? repeatCustomerCount / customerCount : 0;

  return {
    customers: customers.slice(0, 20),
    customerCount,
    totalRevenue: Math.round(totalRevenue),
    avgLtv: customerCount > 0 ? Math.round(totalRevenue / customerCount) : 0,
    avgOrdersPerCustomer: customerCount > 0 ? Math.round((totalOrders / customerCount) * 100) / 100 : 0,
    repeatCustomerCount,
    repeatRate: Math.round(repeatRate * 1000) / 1000,
    // Below 5% repeat buyers, "lifetime value" is functionally average
    // order value — a threshold, not zero, because one or two repeat
    // buyers in a large single-purchase business is noise, not a
    // repeat-purchase business model.
    isEssentiallySinglePurchase: customerCount >= 5 && repeatRate < 0.05,
  };
}

// ---- 8c: cohorts ----

export interface CohortRow {
  cohort: string; // "2026-03"
  leadCount: number;
  convertedCount: number;
  conversionRate: number; // 0-1
  revenue: number;
  // Months between acquisition and conversion, averaged — how long
  // this cohort actually took to buy.
  avgDaysToConvert: number | null;
}

interface CohortLeadRow {
  created_at: string;
  status: string;
  converted_at: string | null;
  deal_value: number | null;
}

export function computeCohorts(leads: CohortLeadRow[], monthsBack = 6): CohortRow[] {
  const cohorts = new Map<string, { leadCount: number; convertedCount: number; revenue: number; daysToConvert: number[] }>();

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - (monthsBack - 1));
  cutoff.setDate(1);
  cutoff.setHours(0, 0, 0, 0);

  for (const lead of leads) {
    const created = new Date(lead.created_at);
    if (created < cutoff) continue;
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;

    const entry = cohorts.get(key) ?? { leadCount: 0, convertedCount: 0, revenue: 0, daysToConvert: [] };
    entry.leadCount += 1;
    if (lead.status === "converted") {
      entry.convertedCount += 1;
      entry.revenue += Number(lead.deal_value) || 0;
      // converted_at only exists for leads converted after migration
      // 134 shipped — older conversions legitimately have no timing
      // data, so they're excluded from the average rather than
      // counted as zero days.
      if (lead.converted_at) {
        const days = (new Date(lead.converted_at).getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        if (days >= 0) entry.daysToConvert.push(days);
      }
    }
    cohorts.set(key, entry);
  }

  return Array.from(cohorts.entries())
    .map(([cohort, v]) => ({
      cohort,
      leadCount: v.leadCount,
      convertedCount: v.convertedCount,
      conversionRate: v.leadCount > 0 ? Math.round((v.convertedCount / v.leadCount) * 1000) / 1000 : 0,
      revenue: Math.round(v.revenue),
      avgDaysToConvert: v.daysToConvert.length > 0
        ? Math.round(v.daysToConvert.reduce((s, d) => s + d, 0) / v.daysToConvert.length)
        : null,
    }))
    .sort((a, b) => a.cohort.localeCompare(b.cohort));
}
