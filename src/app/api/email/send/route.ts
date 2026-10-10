import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { sendApprovedEmail } from "@/lib/email/sendApprovedEmail";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // Every rule lives in src/lib/email/sendApprovedEmail.ts so the
  // approvals route can send without calling this app over HTTP (G-3
  // step 3). They moved WITH the work rather than being left here and
  // re-implemented there — which matters more on this path than any
  // other, because the approvals route was already calling
  // sendDealerEmail directly and that skips all of them.
  const result = await sendApprovedEmail(supabase, dealershipId, await request.json());
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.duplicate ? { duplicate: true } : {}),
        ...(result.lastSentAt ? { lastSentAt: result.lastSentAt } : {}),
      },
      { status: result.status }
    );
  }
  return NextResponse.json({ success: true });
}
