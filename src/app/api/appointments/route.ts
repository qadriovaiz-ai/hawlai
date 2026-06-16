import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dealershipId = searchParams.get("dealership_id");
  if (!dealershipId) return NextResponse.json({ error: "dealership_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("appointments")
    .select("*, leads(name, phone, vehicle)")
    .eq("dealership_id", dealershipId)
    .order("appointment_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const { data, error } = await supabase.from("appointments").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update lead status
  await supabase
    .from("leads")
    .update({ status: "appointment_set" })
    .eq("id", body.lead_id);

  return NextResponse.json(data);
}
