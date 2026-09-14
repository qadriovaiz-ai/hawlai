import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { indiaToday } from "@/lib/expertise/seasonalCalendar";
import { cleanFilters, exportFilename, exportRole, fetchLeadsForExport, leadsToCsv, NOT_ALLOWED, unsubscribedEmails } from "@/lib/leads/exportLeads";

// The leads CSV download — what chat's export link, the Leads page button
// and the scheduled export email all point at. Works only for a signed-in
// owner or admin of the business; the file is built on request and never
// stored.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to Hawlai to download your leads." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No business found for this account." }, { status: 400 });

  try {
    if (!(await exportRole(dealershipId, user.id))) return NextResponse.json({ error: NOT_ALLOWED }, { status: 403 });

    const filters = cleanFilters(new URL(request.url).searchParams);
    const [leads, unsubscribed, { data: dealership }] = await Promise.all([
      fetchLeadsForExport(supabase, dealershipId, filters),
      unsubscribedEmails(dealershipId),
      supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).maybeSingle(),
    ]);

    return new NextResponse(leadsToCsv(leads, unsubscribed), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(dealership?.dealership_name, indiaToday())}"`,
        // Personal data: never kept by a browser or proxy cache.
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Couldn't build the export — ${err.message}. Try again.` }, { status: 500 });
  }
}
