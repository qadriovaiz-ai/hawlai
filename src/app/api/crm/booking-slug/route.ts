import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("dealerships").select("booking_slug").eq("id", dealershipId).single();
  return NextResponse.json({ slug: data?.booking_slug ?? null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name").eq("id", dealershipId).single();
  const base = (dealership?.dealership_name ?? "book").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let slug = base || "book";
  let attempt = 0;

  // Ensure uniqueness — try base, then base-2, base-3, etc.
  while (attempt < 20) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
    const { data: taken } = await supabase.from("dealerships").select("id").eq("booking_slug", candidate).maybeSingle();
    if (!taken) {
      await supabase.from("dealerships").update({ booking_slug: candidate }).eq("id", dealershipId);
      return NextResponse.json({ slug: candidate });
    }
    attempt++;
  }
  return NextResponse.json({ error: "Couldn't generate a unique booking link, try again" }, { status: 500 });
}
