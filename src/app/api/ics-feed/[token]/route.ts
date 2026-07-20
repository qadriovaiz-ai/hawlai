import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcsText(text: string): string {
  return (text ?? "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("id, dealership_name")
    .eq("calendar_token", token)
    .maybeSingle();
  if (!dealership) return new NextResponse("Not found", { status: 404 });

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, appointment_date, appointment_type, notes, status, leads(name, phone)")
    .eq("dealership_id", dealership.id)
    .eq("status", "scheduled")
    .order("appointment_date", { ascending: true });

  const events = (appointments ?? [])
    .map((a: any) => {
      const start = toIcsDate(a.appointment_date);
      const end = toIcsDate(new Date(new Date(a.appointment_date).getTime() + 30 * 60 * 1000).toISOString());
      const summary = escapeIcsText(`${a.appointment_type || "Meeting"} — ${a.leads?.name || "Lead"}`);
      const description = escapeIcsText([a.leads?.phone ? `Phone: ${a.leads.phone}` : "", a.notes || ""].filter(Boolean).join("\\n"));
      return [
        "BEGIN:VEVENT",
        `UID:${a.id}@hawlai`,
        `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${summary}`,
        description ? `DESCRIPTION:${description}` : "",
        "END:VEVENT",
      ].filter(Boolean).join("\r\n");
    })
    .join("\r\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hawlai//Calendar Sync//EN",
    `X-WR-CALNAME:${escapeIcsText(dealership.dealership_name ?? "Hawlai")} Appointments`,
    events,
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=appointments.ics",
    },
  });
}
