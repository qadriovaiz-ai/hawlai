import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate, formatDuration, getCallStatusColor, titleCaseFromSnake } from "@/lib/utils";
import AutoCallSettings from "@/components/calls/AutoCallSettings";
import CallScriptSettings from "@/components/calls/CallScriptSettings";

export default async function CallsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: calls } = await supabase
    .from("calls")
    .select("*, leads(name, phone, vehicle, lead_temperature)")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false });

  const stats = {
    total: calls?.length ?? 0,
    completed: calls?.filter((c) => c.status === "completed").length ?? 0,
    noAnswer: calls?.filter((c) => c.status === "no_answer").length ?? 0,
    avgDuration: calls?.length
      ? Math.round((calls.reduce((a, c) => a + (c.duration ?? 0), 0) / calls.length))
      : 0,
  };

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Call History</h1>
        <p className="text-slate-500 text-sm mt-0.5">All recorded calls and their outcomes</p>
      </div>

      <AutoCallSettings />
      <CallScriptSettings />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Calls", value: stats.total },
          { label: "Completed", value: stats.completed },
          { label: "No Answer", value: stats.noAnswer },
          { label: "Avg Duration", value: formatDuration(stats.avgDuration) },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {!calls || calls.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500 font-medium">No calls recorded yet</p>
            <p className="text-slate-400 text-sm mt-1">Calls will appear here after you start calling from the queue</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="table-header">Lead</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Duration</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-200 transition-colors">
                    <td className="table-cell">
                      <Link href={`/dashboard/leads/${call.lead_id}`} className="font-medium text-brand-400 hover:underline">
                        {call.leads?.name ?? "Unknown"}
                      </Link>
                      <p className="text-xs text-slate-400">{call.leads?.vehicle ?? ""}</p>
                    </td>
                    <td className="table-cell text-slate-600">{call.leads?.phone ?? "—"}</td>
                    <td className="table-cell text-slate-600">{formatDate(call.created_at)}</td>
                    <td className="table-cell text-slate-600">{call.duration > 0 ? formatDuration(call.duration) : "—"}</td>
                    <td className="table-cell">
                      <span className={`badge ${getCallStatusColor(call.status)}`}>
                        {titleCaseFromSnake(call.status)}
                      </span>
                    </td>
                    <td className="table-cell max-w-xs">
                      <p className="text-sm text-slate-600 truncate">{call.summary ?? "—"}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI calling status — this used to claim the integration was
          "coming soon"; Vapi has actually been live and placing real
          calls (see TriggerAICallButton, the AI Call column above)
          since earlier this session. The one still-accurate caveat is
          the shared number/DLT status, which is genuinely still
          pending.
          Master audit "looks advanced, delivers basic" finding —
          neither of these was explained anywhere before now: the
          script isn't fixed (buildDynamicSystemPrompt in
          callScriptAgent.ts pulls real dealership name/category,
          Brand Voice tone, and the specific lead's own context into
          every call), and "shared" concretely means every business
          today calls out through the same Vapi phone number AND the
          same base assistant voice/settings — only the script content
          differs per call. The opening line used to be the one part
          fixed for everyone; CallScriptSettings below now makes it
          (and additional instructions) owner-editable per business. */}
      <div className="card p-4 bg-brand-500/5 border-brand-400/30 space-y-3">
        <div>
          <p className="text-sm font-semibold text-brand-500 mb-1">AI calling is live</p>
          <p className="text-xs text-brand-600">
            Every call is scripted fresh, not read from a fixed script — the AI uses your business name and
            category, your <a href="/dashboard/settings/brand" className="underline hover:no-underline">Brand Voice tone</a>,
            and whatever's known about that specific lead. You can add your own instructions and override the
            opening line below.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-brand-500 mb-1">What "shared number" means today</p>
          <p className="text-xs text-brand-600">
            Every business on Hawlai currently calls out through the same phone number and the same base
            assistant voice — only the script content is personalized per call. Dedicated per-business numbers
            (a different number, and your own assistant voice) are ready to switch on once DLT telecom
            registration clears.
          </p>
        </div>
      </div>
    </div>
  );
}
