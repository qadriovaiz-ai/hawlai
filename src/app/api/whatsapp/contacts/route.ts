import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, phone, lead_temperature, status")
    .eq("dealership_id", dealershipId)
    .not("phone", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ leads: leads ?? [] });
}
