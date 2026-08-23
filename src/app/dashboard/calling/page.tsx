import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PhoneCall, Users, CalendarDays, Flame, ArrowRight, Settings2 } from "lucide-react";
import { resolvePersona, PERSONA_CHANNEL_LABELS } from "@/lib/agents/personas";
import { getEffectiveLimits } from "@/lib/usage/effectiveLimits";
import { currentBillingMonth } from "@/lib/usage/callingMinutes";
import ActivityFeed from "@/components/activity/ActivityFeed";

// UX Transformation piece 5a — the calling workspace.
//
// A calling-focused customer previously had to assemble their own view
// from /dashboard/calls, /dashboard/leads, /dashboard/appointments and
// persona settings buried inside /dashboard/autopilot. This is the one
// screen that answers "is my AI employee working, and what did it do?"
//
// Reuses everything: existing calls/leads/appointments tables, the
// persona resolver, calling-minute usage, and the activity feed. No
// new data, no new schema.
export default async function CallingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const service = createServiceClient();

  const [
    callsTodayRes,
    connectedTodayRes,
    hotLeadsRes,
    appointmentsRes,
    persona,
    limits,
    callingUsageRes,
  ] = await Promise.all([
    supabase.from("calls").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).gte("created_at", todayStart.toISOString()),
    supabase.from("calls").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).eq("status", "completed").gte("created_at", todayStart.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).eq("lead_temperature", "hot"),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).gte("created_at", todayStart.toISOString()),
    resolvePersona(supabase, dealershipId, "call_outbound"),
    getEffectiveLimits(supabase, dealershipId),
    service.from("calling_minutes_usage").select("minutes_used").eq("dealership_id", dealershipId).eq("billing_month", currentBillingMonth()).maybeSingle(),
  ]);

  const callsToday = callsTodayRes.count ?? 0;
  const connectedToday = connectedTodayRes.count ?? 0;
  const minutesUsed = Number(callingUsageRes.data?.minutes_used ?? 0);
  const includedMinutes = limits.callingFreeMinutes;

  const stats = [
    { label: "Calls today", value: callsToday, icon: PhoneCall },
    { label: "Connected", value: connectedToday, icon: PhoneCall },
    { label: "Hot leads", value: hotLeadsRes.count ?? 0, icon: Flame },
    { label: "Appointments today", value: appointmentsRes.count ?? 0, icon: CalendarDays },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Your AI Calling Employee</h1>
          <p className="text-sm text-slate-500">
            Handling outbound calls as your {PERSONA_CHANNEL_LABELS.call_outbound.toLowerCase()} — {persona.label.toLowerCase()}.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Link href="/dashboard/calling/test" className="text-xs text-brand-500 hover:text-brand-400 inline-flex items-center gap-1">
            <PhoneCall className="w-3.5 h-3.5" /> Test &amp; go live
          </Link>
          <Link href="/dashboard/calling/setup" className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1">
            <Settings2 className="w-3.5 h-3.5" /> Set up
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card p-5">
            <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center mb-3">
              <Icon className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="card p-5 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-700">Calling minutes this month</span>
          <span className="text-slate-500 tabular-nums">
            {minutesUsed.toFixed(1)} / {includedMinutes} included
          </span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${minutesUsed > includedMinutes ? "bg-amber-500" : "bg-brand-500"}`}
            style={{ width: `${includedMinutes > 0 ? Math.min(100, Math.round((minutesUsed / includedMinutes) * 100)) : 0}%` }}
          />
        </div>
        {minutesUsed > includedMinutes && includedMinutes > 0 && (
          <p className="text-xs text-amber-600">
            Past your included minutes — extra minutes are charged at cost plus ₹{limits.callingMarginInr.toFixed(2)}/min.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { href: "/dashboard/leads-hub", label: "Leads", desc: "Who to call and what happened", icon: Users },
          { href: "/dashboard/calls", label: "Call history", desc: "Transcripts and summaries", icon: PhoneCall },
          { href: "/dashboard/appointments", label: "Appointments", desc: "What got booked", icon: CalendarDays },
        ].map(({ href, label, desc, icon: Icon }) => (
          <Link key={href} href={href} className="card p-4 flex items-start gap-3 hover:border-brand-300 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-slate-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              <p className="text-xs text-slate-400">{desc}</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-1" />
          </Link>
        ))}
      </div>

      <ActivityFeed
        limit={15}
        title="Recent calling activity"
        historyOnly
        emptyMessage="No calls yet — this fills in as your AI employee works."
      />
    </div>
  );
}
