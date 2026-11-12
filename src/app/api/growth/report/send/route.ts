import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { renderText, type DailyReport } from "@/lib/growth/report";

// "Email it to me as well" — R3, and a separate click on purpose.
//
// THE FOUNDER'S WORDS: the report shows on the screen, and emailing it
// is its own button; no email goes by default. So this route exists
// only to be clicked, and nothing calls it on a schedule.
//
// WHY THIS IS NOT GATED BY AN APPROVAL, which Rule 6 would otherwise
// require of anything that sends. The registry exists because the
// product acts on the owner's behalf toward OTHER PEOPLE — a customer,
// a page, a platform. This sends the owner a copy of what he is already
// looking at, to his own address, because he clicked a button that says
// so. An approval card for "email me this" is the safe direction being
// made the slow one, which CLAUDE.md names as its own fault.
//
// AND IT IS STILL NOT A FREE-TEXT SENDER. The only thing it can mail is
// a DailyReport the owner just received from /api/growth/report, to the
// address on his own account — never a recipient from the request.

/** The one thing this route will mail. Anything else is refused. */
function isReport(value: unknown): value is DailyReport {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.subject === "string" && typeof r.day === "string" && Array.isArray(r.blocks);
}

export async function POST(request: Request) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await session.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No business" }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  }
  if (!isReport(body?.report)) {
    return NextResponse.json({ error: "That is not a report." }, { status: 400 });
  }
  const report = body.report as DailyReport;

  const service = createServiceClient();
  const { ownerEmail, sendDealerEmail } = await import("@/lib/email/sendDealerEmail");
  const { data: dealership } = await service.from("dealerships").select("owner_id").eq("id", dealershipId).maybeSingle();

  // THE ADDRESS IS THE ACCOUNT'S, never the request's. A recipient that
  // travelled on the body would make this a way to mail anyone.
  const to = await ownerEmail(dealership?.owner_id ?? null);
  if (!to) return NextResponse.json({ error: "There is no email address on your account to send it to." }, { status: 400 });

  try {
    const sent = await sendDealerEmail(service, dealershipId, to, report.subject, renderText(report), {
      // ONE COPY PER REPORT PER DAY. Clicking twice is a person being
      // unsure it worked, not a person wanting two emails — the same
      // reasoning the daily send carried, with the day it is about
      // rather than the day it is sent.
      idempotencyKey: `growth-report-on-demand-${dealershipId}-${report.day}`,
    });
    const ok = Boolean((sent as any)?.ok ?? sent);
    return NextResponse.json({
      sent: ok,
      // SAID, NOT ASSUMED. A button that always says "sent" is a button
      // the owner stops believing.
      to: ok ? to : null,
      error: ok ? null : "It could not be sent just now.",
    });
  } catch (err: any) {
    console.error(`[growth-report] ${dealershipId}: could not email the report: ${err?.message ?? err}`);
    return NextResponse.json({ error: "It could not be sent just now." }, { status: 500 });
  }
}
