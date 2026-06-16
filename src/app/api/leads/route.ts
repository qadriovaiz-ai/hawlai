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
    .from("leads")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("ai_score", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { leads } = body;

  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: "leads array required" }, { status: 400 });
  }

  const { data, error } = await supabase.from("leads").insert(leads).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: data.length, leads: data });
}
