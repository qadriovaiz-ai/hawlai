import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { runGrowthWork, buildGrowthReport } from "@/lib/growth/dailyGrowth";

// The report, when the owner asks for it — R3.
//
// THE DAILY EMAIL STOPPED IN R2b, on the founder's decision: the agent
// keeps checking and fixing in the background, and a report is
// something he asks for rather than something that arrives every
// morning. Between R2b and this route there was no way to get one at
// all, which was stated in R2b's commit rather than discovered here.
//
// IT SENDS NOTHING. The report comes back for the screen, and emailing
// it is a second, explicit click — /api/growth/report/send. A request
// for a report is not a request for an email, and the founder said so
// in those words.
//
// IT DOES THE WORK FIRST, deliberately. runGrowthWork re-audits the
// site and the catalogue before the report is built, so "give me a
// report" means "look now and tell me", not "show me this morning's
// answer". It is model-free — the only paid pass is behind
// GROWTH_COPY_AUDIT_ON and is never armed from here — so the cost of
// asking twice is two reads.
//
// AND IT IS SAFE TO ASK TWICE. recordFindings updates rows in place,
// the goal drafts are unique-indexed, and R2a moved the "shown" mark
// onto what the report actually printed — so a second report in the
// same day shows what the first one did not, rather than repeating it.

export async function POST() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await session.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No business" }, { status: 400 });

  // THE SESSION RESOLVED WHOSE BUSINESS IT IS; the work writes findings
  // and goal drafts, which RLS does not grant a client. The same
  // service-client-after-server-resolved-dealershipId shape used by the
  // approvals executor and the campaigns page.
  const service = createServiceClient();

  try {
    const work = await runGrowthWork(service, dealershipId);
    const result = await buildGrowthReport(service, dealershipId, work);
    if (!result.report) {
      return NextResponse.json({ error: "There was nothing to put in a report just now." }, { status: 500 });
    }
    return NextResponse.json({
      report: result.report,
      // WHAT WAS LEFT OUT, AND WHY — the same honesty the email carries.
      // A figure that traced to nothing takes its block out; the report
      // still comes, and says how many blocks went.
      blocksLeftOut: result.blocksLeftOut,
      leftOut: result.leftOut,
      reportSound: result.reportSound,
    });
  } catch (err: any) {
    console.error(`[growth-report] ${dealershipId}: ${err?.message ?? err}`);
    return NextResponse.json({ error: "The report could not be built just now." }, { status: 500 });
  }
}
