import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("dealerships")
    .select("auto_pause_low_performers, auto_budget_reallocate_percent")
    .eq("id", dealershipId)
    .single();

  return NextResponse.json(data ?? { auto_pause_low_performers: false, auto_budget_reallocate_percent: 0 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { auto_pause_low_performers, auto_budget_reallocate_percent } = await request.json();

  const { data, error } = await supabase
    .from("dealerships")
    .update({
      ...(auto_pause_low_performers !== undefined && { auto_pause_low_performers }),
      ...(auto_budget_reallocate_percent !== undefined && { auto_budget_reallocate_percent }),
    })
    .eq("id", dealershipId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
