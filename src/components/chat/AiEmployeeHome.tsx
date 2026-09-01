import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Palette, ShieldCheck, PenLine, Megaphone, Users2, BarChart3, ArrowRight, Lightbulb, CheckCircle2 } from "lucide-react";
import { getOpenOpportunities } from "@/lib/agents/opportunityAgent";
import ActivityFeed from "@/components/activity/ActivityFeed";

// The AI Employee work surface.
//
// Rendered INTO MasterChatPage's existing empty state rather than
// beside it as a third column. /chat already has two columns
// (ConversationSidebar + chat), so a persistent side panel would have
// cost the chat roughly half its width on the app's primary work
// surface. This is a launchpad: it's what you see before you've asked
// anything, and it steps aside once you have.
//
// Server component, passed down as a prop — so none of these queries
// reach the browser and the client bundle doesn't grow.
//
// Deliberately NOT here: a standing approval notice. MasterChatPage's
// header already carries one ("Anything that spends money or sends
// something live still needs your approval"), and a second copy on the
// same screen would dilute rather than reinforce it.

const CAPABILITIES = [
  { label: "Create content", href: "/dashboard/content-marketing", icon: PenLine },
  { label: "Run ads", href: "/dashboard/ads", icon: Megaphone },
  { label: "Reach customers", href: "/dashboard/leads-hub", icon: Users2 },
  { label: "Analyse results", href: "/dashboard/analytics", icon: BarChart3 },
];

export default async function AiEmployeeHome() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return null;

  // allSettled: three independent reads, and one failing should cost
  // its own row rather than the whole surface — same reasoning Home
  // already applies.
  const [brandRes, approvalsRes, opportunitiesRes] = await Promise.allSettled([
    supabase.from("brand_profiles").select("brand_voice").eq("dealership_id", dealershipId).maybeSingle(),
    supabase
      .from("pending_approvals")
      .select("id", { count: "exact", head: true })
      .eq("dealership_id", dealershipId)
      .eq("status", "pending"),
    getOpenOpportunities(supabase, dealershipId),
  ]);

  // Brand voice counts as set only when the structured profile exists.
  // Onboarding's "Skip for now" marks onboarding_completed while
  // writing no profile at all, so the completion flag is not a
  // reliable signal here — the row is.
  const brandVoiceSet =
    brandRes.status === "fulfilled" && Boolean((brandRes.value.data as any)?.brand_voice);
  const pendingApprovals = approvalsRes.status === "fulfilled" ? approvalsRes.value.count ?? 0 : 0;
  const opportunities = opportunitiesRes.status === "fulfilled" ? opportunitiesRes.value : [];

  // One recommendation, not a list — the highest-priority open
  // opportunity. Read from opportunityAgent rather than generated
  // again here: a second recommendation engine on the same data would
  // be free to disagree with the one on Home, and the customer would
  // have no way to tell which to believe.
  const priority = opportunities[0] ?? null;

  return (
    <div className="space-y-5 py-2">
      {/* ---- Status strip ---- */}
      <div className="flex flex-wrap items-center gap-2">
        {brandVoiceSet ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
            <CheckCircle2 className="w-3 h-3 text-green-500" /> Brand voice set
          </span>
        ) : (
          <Link
            href="/dashboard/settings/brand"
            className="inline-flex items-center gap-1.5 text-[11px] text-brand-600 bg-brand-500/10 border border-brand-300/50 rounded-full px-2.5 py-1 hover:bg-brand-500/15 transition-colors"
          >
            <Palette className="w-3 h-3" /> Set your brand voice
          </Link>
        )}

        {pendingApprovals > 0 && (
          <Link
            href="/dashboard/approvals"
            className="inline-flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-500/10 border border-amber-300/50 rounded-full px-2.5 py-1 hover:bg-amber-500/15 transition-colors"
          >
            <ShieldCheck className="w-3 h-3" />
            {pendingApprovals} waiting for you
          </Link>
        )}
      </div>

      {/* ---- Today's priority ---- */}
      {priority ? (
        <div className="rounded-xl border border-brand-300/50 bg-brand-500/[0.07] p-4 space-y-2">
          <p className="text-[10.5px] font-semibold text-brand-600 uppercase tracking-wide flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" /> Today&apos;s priority
          </p>
          <p className="text-sm font-semibold text-slate-800">{priority.title}</p>
          {priority.description && <p className="text-xs text-slate-600">{priority.description}</p>}
          {priority.action_href && (
            <Link
              href={priority.action_href}
              className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline"
            >
              Do this <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      ) : (
        // §5.3: an empty state, never a generic filler suggestion. A
        // fabricated "try posting more!" would be worse than silence —
        // it reads as advice and carries no information.
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
          <p className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Today&apos;s priority</p>
          <p className="text-xs text-slate-500">
            Nothing urgent right now. Recommendations appear here once there&apos;s enough activity — leads coming in,
            campaigns running — for one to be worth acting on.
          </p>
        </div>
      )}

      {/* ---- Capability entry points ---- */}
      <div>
        <p className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Or start here</p>
        <div className="grid grid-cols-2 gap-2">
          {CAPABILITIES.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 hover:border-brand-300 hover:bg-brand-500/[0.06] transition-colors"
            >
              <Icon className="w-4 h-4 text-brand-500 shrink-0" />
              <span className="text-sm text-slate-700">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ---- Recent work ----
          Reuses the existing feed rather than a second one.
          hideWhenEmpty because on a launchpad an empty "nothing here
          yet" card is noise — a new account should see the four things
          it can do, not a blank panel below them. */}
      <ActivityFeed limit={5} title="Recent work" historyOnly hideWhenEmpty />
    </div>
  );
}
