import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDateTime, getAppointmentStatusColor } from "@/lib/utils";
import UpdateAppointmentStatus from "@/components/appointments/UpdateAppointmentStatus";

export default async function AppointmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: appointments } = await supabase
    .from("appointments")
    .select("*, leads(name, phone, vehicle, lead_temperature)")
    .eq("dealership_id", dealershipId)
    .order("appointment_date", { ascending: true });

  const now = new Date();
  const upcoming = appointments?.filter((a) => new Date(a.appointment_date) >= now && a.status === "scheduled") ?? [];
  const past = appointments?.filter((a) => new Date(a.appointment_date) < now || a.status !== "scheduled") ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
        <p className="text-slate-500 text-sm mt-0.5">Scheduled test rides and showroom visits</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total", value: appointments?.length ?? 0, color: "text-slate-900" },
          { label: "Upcoming", value: upcoming.length, color: "text-blue-400" },
          { label: "Completed", value: appointments?.filter((a) => a.status === "completed").length ?? 0, color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Upcoming */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Upcoming ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-slate-400 text-sm">No upcoming appointments</p>
            <p className="text-slate-400 text-xs mt-1">Book appointments from the lead detail page</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((appt) => (
              <AppointmentCard key={appt.id} appt={appt} />
            ))}
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Past ({past.length})</h2>
          <div className="space-y-3">
            {past.map((appt) => (
              <AppointmentCard key={appt.id} appt={appt} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AppointmentCard({ appt }: { appt: Record<string, unknown> & { id: string; leads?: { name?: string; phone?: string; vehicle?: string } | null } }) {
  const lead = appt.leads as { name?: string; phone?: string; vehicle?: string } | null;
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="text-center bg-slate-50 rounded-lg p-3 shrink-0 min-w-16">
        <p className="text-xs text-slate-500">
          {new Date(appt.appointment_date as string).toLocaleString("en-IN", { month: "short" })}
        </p>
        <p className="text-2xl font-bold text-slate-900">
          {new Date(appt.appointment_date as string).getDate()}
        </p>
        <p className="text-xs text-slate-500">
          {new Date(appt.appointment_date as string).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        <Link href={`/dashboard/leads/${appt.lead_id}`} className="font-semibold text-slate-900 hover:text-brand-600 transition-colors">
          {lead?.name ?? "Unknown"}
        </Link>
        <p className="text-sm text-slate-500">{lead?.vehicle ?? ""} • {String(appt.appointment_type).replace(/_/g, " ")}</p>
        {typeof appt.notes === "string" ? (
  <p className="text-xs text-slate-400 mt-0.5 truncate">
    {appt.notes}
  </p>
) : null}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`badge ${getAppointmentStatusColor(appt.status as "scheduled" | "completed" | "cancelled")}`}>
          {String(appt.status)}
        </span>
        <UpdateAppointmentStatus appointmentId={appt.id} currentStatus={appt.status as string} />
      </div>
    </div>
  );
}
