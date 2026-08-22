import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { computeDepartmentSpend } from "@/lib/analytics/departmentSpend";

// P3 piece 7c — agency billing REPORT view (confirmed scope): what
// each managed business actually costs to run this month, so an
// agency can bill its own clients accordingly.
//
// Deliberately NOT a consolidated payment system — each business
// still pays for its own plan exactly as before. Combining actual
// payment into one agency invoice is a real business/finance decision
// (who the paying entity is, proration, invoicing), explicitly
// deferred rather than assumed.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: businesses } = await supabase
    .from("dealerships")
    .select("id, dealership_name, plan")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  if (!businesses || businesses.length === 0) return NextResponse.json({ businesses: [], totals: null });

  const ids = businesses.map((b) => b.id);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Real per-call cost, computed at log time from actual per-unit
  // provider pricing (api_usage_logs.cost_inr) — not an estimate
  // re-derived here.
  const { data: usage } = await supabase
    .from("api_usage_logs")
    .select("dealership_id, service, operation, cost_inr")
    .in("dealership_id", ids)
    .gte("created_at", monthStart.toISOString());

  const byDealership = new Map<string, { total: number; byService: Record<string, number> }>();
  for (const row of usage ?? []) {
    const entry = byDealership.get(row.dealership_id) ?? { total: 0, byService: {} };
    const cost = Number(row.cost_inr) || 0;
    entry.total += cost;
    entry.byService[row.service] = (entry.byService[row.service] ?? 0) + cost;
    byDealership.set(row.dealership_id, entry);
  }

  const rows = businesses.map((b) => {
    const u = byDealership.get(b.id) ?? { total: 0, byService: {} };
    return {
      id: b.id,
      name: b.dealership_name,
      plan: b.plan,
      costInr: Math.round(u.total * 100) / 100,
      byService: Object.fromEntries(Object.entries(u.byService).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    };
  });

  // Phase 4 / 2b — where the cost actually goes, by department.
  // Read-only visibility; per-department CAPS were deliberately not
  // built (see migration 148's header), and this is the data that
  // would tell us whether they'd ever be worth it.
  const { rows: departmentRows, totalInr: departmentTotalInr } = computeDepartmentSpend(usage ?? []);

  return NextResponse.json({
    businesses: rows,
    byDepartment: departmentRows,
    totals: {
      businessCount: rows.length,
      costInr: Math.round(rows.reduce((s, r) => s + r.costInr, 0) * 100) / 100,
      departmentCostInr: departmentTotalInr,
      monthStart: monthStart.toISOString(),
    },
  });
}
