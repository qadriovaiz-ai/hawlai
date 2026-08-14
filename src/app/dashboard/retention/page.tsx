import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Heart, Car, Phone } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import RetentionMessageButton from "@/components/leads/RetentionMessageButton";

// Master audit Part B — churn/at-risk detection. This page used to be a
// flat list of every converted customer ordered by created_at, where
// someone last contacted yesterday looked identical to someone who
// hasn't been touched in eight months — so there was no way to know
// who to actually re-engage.
//
// Risk is derived from real recency, the same philosophy the
// retargeting segments endpoint already uses for lapsed buyers: a
// customer's last interaction is the latest of their conversion date,
// their most recent call, and their most recent appointment. No new
// schema and no AI call — recency is a fact we already store, it just
// was never computed here.
const AT_RISK_DAYS = 90;
const WATCH_DAYS = 45;

function riskTier(daysSince: number): { label: string; tone: string } {
  if (daysSince >= AT_RISK_DAYS) return { label: "At risk", tone: "bg-red-500/10 text-red-500 border-red-400/30" };
  if (daysSince >= WATCH_DAYS) return { label: "Watch", tone: "bg-amber-500/10 text-amber-600 border-amber-400/30" };
  return { label: "Recent", tone: "bg-emerald-500/10 text-emerald-600 border-emerald-400/30" };
}

export default async function RetentionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: convertedLeads } = await supabase
    .from("leads")
    .select("*")
    .eq("dealership_id", dealershipId)
    .eq("status", "converted")
    .order("created_at", { ascending: false });

  const leadIds = (convertedLeads ?? []).map((c) => c.id);
  const [{ data: calls }, { data: appointments }] = leadIds.length
    ? await Promise.all([
        supabase.from("calls").select("lead_id, created_at").in("lead_id", leadIds),
        supabase.from("appointments").select("lead_id, appointment_date").in("lead_id", leadIds),
      ])
    : [{ data: [] }, { data: [] }];

  // Latest touch per lead across every interaction type we record.
  const lastTouch = new Map<string, string>();
  const bump = (leadId: string, when: string | null) => {
    if (!when) return;
    const current = lastTouch.get(leadId);
    if (!current || when > current) lastTouch.set(leadId, when);
  };
  for (const c of convertedLeads ?? []) bump(c.id, c.created_at);
  for (const c of calls ?? []) bump(c.lead_id, c.created_at);
  // Only appointments already in the past count as a real interaction —
  // a booking three weeks out isn't contact that has happened yet.
  const nowIso = new Date().toISOString();
  for (const a of appointments ?? []) if (a.appointment_date <= nowIso) bump(a.lead_id, a.appointment_date);

  const customers = (convertedLeads ?? [])
    .map((c) => {
      const touchedAt = lastTouch.get(c.id) ?? c.created_at;
      const daysSince = Math.floor((Date.now() - new Date(touchedAt).getTime()) / 86400000);
      return { ...c, touchedAt, daysSince, risk: riskTier(daysSince) };
    })
    .sort((a, b) => b.daysSince - a.daysSince);

  const atRiskCount = customers.filter((c) => c.daysSince >= AT_RISK_DAYS).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Heart className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Customer Retention</h1>
          <p className="text-sm text-slate-500">Re-engage customers who already bought — service reminders, referrals, upsells</p>
        </div>
      </div>

      {!customers || customers.length === 0 ? (
        <div className="card p-12 text-center">
          <Heart className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">No converted customers yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Move a lead to "Converted" on the Pipeline page once they buy — they'll show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            {customers.length} customer{customers.length > 1 ? "s" : ""}
            {atRiskCount > 0 && (
              <> · <span className="text-red-500 font-medium">{atRiskCount} not contacted in {AT_RISK_DAYS}+ days</span></>
            )}
            <span className="block text-xs text-slate-400 mt-0.5">Most overdue first, based on the last call, appointment, or conversion on record.</span>
          </p>
          {customers.map((c) => (
            <div key={c.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-400">
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {c.phone}
                      </span>
                    )}
                    {c.vehicle && (
                      <span className="inline-flex items-center gap-1">
                        <Car className="w-3 h-3" /> {c.vehicle}
                      </span>
                    )}
                    <span>Last contact {formatRelativeTime(c.touchedAt)}</span>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${c.risk.tone}`}>
                  {c.risk.label}
                </span>
              </div>
              <RetentionMessageButton leadId={c.id} phone={c.phone} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
