import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateDesign } from "@/lib/graphicDesign/generateDesign";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { designType, prompt } = await request.json();

  // The work itself lives in src/lib/graphicDesign/generateDesign.ts so
  // the approvals route can run it without calling this app over HTTP
  // (G-3 step 1). This route is now authz plus a thin translation to
  // HTTP; every check that guards the money - the feature hold, the plan
  // cap, the claims strip - moved WITH the work rather than being left
  // here and re-implemented there.
  const result = await generateDesign(supabase, dealershipId, { designType, prompt });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.unavailable ? { unavailable: true } : {}),
        ...(result.limitReached ? { limitReached: true } : {}),
      },
      { status: result.status }
    );
  }
  return NextResponse.json({
    url: result.url,
    id: result.id,
    ...(result.leftOut ? { leftOut: result.leftOut } : {}),
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("graphic_designs")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(40);

  return NextResponse.json({ items: data ?? [] });
}
