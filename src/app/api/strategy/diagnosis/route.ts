import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { loadDiagnosis } from "@/lib/strategy/diagnosis";
import { generateChannelAdvice, ADVICE_FAILURE_MESSAGE } from "@/lib/strategy/channelAdvice";
import { readSignals } from "@/lib/signals/signals";

// The advice is a model call that may be retried once — room for both.
export const maxDuration = 60;
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
  // What the other departments have noticed (migration 198) — a plain
  // read of a store the daily monitors already fill, so this costs no
  // extra AI call. Capped so the prompt stays a sensible size.
  const signals = await readSignals(supabase, dealershipId, { limit: 12 });
  const result = await generateChannelAdvice(diagnosis, facts, { supabase, dealershipId }, signals);
  if (!result.ok) {
    // The reason is said, not hidden: it's what makes the next failure
    // diagnosable without anyone reading a server log.
    return NextResponse.json({ diagnosis, advice: null, error: ADVICE_FAILURE_MESSAGE[result.reason], reason: result.reason });
  }
  return NextResponse.json({ diagnosis, advice: result.advice });
}
