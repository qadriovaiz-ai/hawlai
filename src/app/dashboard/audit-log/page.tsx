import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import Link from "next/link";
import { History, Search } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ApprovalRole } from "@/lib/approvalAuthority";

const EVENT_BADGE: Record<string, string> = {
  approval_approved: "bg-green-500/10 text-green-400 border border-green-700/40",
  approval_rejected: "bg-red-500/10 text-red-400 border border-red-700/40",
  call_tool_executed: "bg-blue-500/10 text-blue-400 border border-blue-700/40",
  campaign_auto_paused: "bg-amber-500/10 text-amber-400 border border-amber-700/40",
};

// A resource this page knows how to link to — extend as new
// resource_types start getting logged. Anything else just shows as
// plain text, never a broken link.
const RESOURCE_HREF: Record<string, (id: string) => string> = {
  lead: (id) => `/dashboard/leads/${id}`,
  pending_approval: () => `/dashboard/approvals`,
  ad_creative: () => `/dashboard/ads/campaigns`,
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; event_type?: string }>;
}) {
  const { q, event_type: eventTypeFilter } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Same dealership-resolution pattern as /dashboard/approvals — owner
  // check first, then active team membership for the currently-active
  // business, not just profile.dealership_id.
  const { data: ownedDealership } = await supabase.from("dealerships").select("id").eq("owner_id", user.id).maybeSingle();

  let dealershipId: string | undefined;
  if (ownedDealership) {
    dealershipId = ownedDealership.id;
  } else {
    const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
    if (!profile?.dealership_id) redirect("/dashboard");
    const { data: membership } = await supabase.from("team_members").select("dealership_id, role").eq("user_id", user.id).eq("dealership_id", profile.dealership_id).eq("status", "active").maybeSingle();
    if (!membership) redirect("/dashboard");
    dealershipId = membership.dealership_id;
    void (membership.role as ApprovalRole); // resolved for parity with the approvals page's authorization pattern; audit_log itself has no per-role view restriction — visibility, not authority
  }

  if (!dealershipId) redirect("/dashboard");

  // audit_log RLS is owner-only (immutable-by-design, migration 128) —
  // service client here after real authorization is already confirmed
  // above, same pattern as approvals/campaigns pages.
  const service = createServiceClient();

  const { data: distinctEvents } = await service
    .from("audit_log")
    .select("event_type")
    .eq("dealership_id", dealershipId)
    .limit(500);
  const eventTypes = Array.from(new Set((distinctEvents ?? []).map((e: any) => e.event_type))).sort();

  let query = service
    .from("audit_log")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (eventTypeFilter) query = query.eq("event_type", eventTypeFilter);
  if (q && q.trim()) query = query.ilike("summary", `%${q.trim()}%`);

  const { data: events, error: fetchError } = await query;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-500/10 rounded-xl flex items-center justify-center">
          <History className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500">Every approval decision, AI call action, and auto-pause — immutable, most recent first</p>
        </div>
      </div>

      <form className="flex flex-col sm:flex-row gap-2" method="get">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search summaries..."
            className="input pl-9 text-sm w-full"
          />
        </div>
        <select name="event_type" defaultValue={eventTypeFilter ?? ""} className="input text-sm sm:w-56">
          <option value="">All event types</option>
          {eventTypes.map((et) => (
            <option key={et} value={et}>{et.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary text-sm px-4">Filter</button>
      </form>

      {fetchError ? (
        <div className="card border-red-700/40">
          <EmptyState icon={History} tone="negative" title="Couldn't load the audit log" description="This is a connection issue — refresh to try again." />
        </div>
      ) : !events || events.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={History}
            title={q || eventTypeFilter ? "No matching events" : "Nothing logged yet"}
            description={q || eventTypeFilter ? "Try a different search or clear the filter." : "Approval decisions, AI call actions, and auto-pauses will show up here as they happen."}
          />
        </div>
      ) : (
        <div className="divide-y divide-slate-200/80 border-t border-b border-slate-200/80">
          {events.map((event: any) => {
            const hrefBuilder = event.resource_type ? RESOURCE_HREF[event.resource_type] : null;
            const href = hrefBuilder && event.resource_id ? hrefBuilder(event.resource_id) : null;
            return (
              <div key={event.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className={`badge text-[10px] ${EVENT_BADGE[event.event_type] ?? "bg-slate-200 text-slate-500 border border-slate-300/80"}`}>
                      {event.event_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-slate-400">{event.actor}</span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {href ? <Link href={href} className="hover:underline">{event.summary}</Link> : event.summary}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{formatDate(event.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
