import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("custom_call_instructions, custom_first_message")
    .eq("id", profile.dealership_id)
    .single();

  return NextResponse.json({
    customCallInstructions: dealership?.custom_call_instructions ?? "",
    customFirstMessage: dealership?.custom_first_message ?? "",
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { customCallInstructions, customFirstMessage } = await request.json();
  const { error } = await supabase
    .from("dealerships")
    .update({
      custom_call_instructions: typeof customCallInstructions === "string" && customCallInstructions.trim() ? customCallInstructions.trim() : null,
      custom_first_message: typeof customFirstMessage === "string" && customFirstMessage.trim() ? customFirstMessage.trim() : null,
    })
    .eq("id", profile.dealership_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
