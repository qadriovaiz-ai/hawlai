import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { loadDiagnosis } from "@/lib/strategy/diagnosis";
import { generateChannelAdvice } from "@/lib/strategy/channelAdvice";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";

// Where the business actually leaks, from its own last 90 days
// (lib/strategy/diagnosis.ts), and — only when asked, since it's a model
// call — channel advice tied to those numbers (lib/strategy/channelAdvice.ts).
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  let diagnosis;
  try {
    diagnosis = await loadDiagnosis(supabase, dealershipId);
  } catch (err: any) {
    return NextResponse.json({ error: `Couldn't read your numbers right now — ${err?.message ?? "try again shortly"}.` }, { status: 500 });
  }

  const wantAdvice = new URL(request.url).searchParams.get("advice") === "1";
  if (!wantAdvice) return NextResponse.json({ diagnosis });

  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
  const advice = await generateChannelAdvice(diagnosis, facts, { supabase, dealershipId });
  if (!advice) return NextResponse.json({ diagnosis, advice: null, error: "Couldn't write the advice right now — the numbers above are still accurate." });
  return NextResponse.json({ diagnosis, advice });
}
