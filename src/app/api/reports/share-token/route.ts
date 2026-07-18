import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

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

  const [{ data: dealership }, { data: snapshots }] = await Promise.all([
    supabase.from("dealerships").select("report_share_token").eq("id", dealershipId).single(),
    supabase.from("report_snapshots").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(20),
  ]);

  return NextResponse.json({ token: dealership?.report_share_token ?? null, snapshots: snapshots ?? [] });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const token = randomBytes(16).toString("hex");
  const { error } = await supabase.from("dealerships").update({ report_share_token: token }).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token });
}
