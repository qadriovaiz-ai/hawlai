import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// P2 28a — discards a draft plan without ever creating anything.
// Reuses the existing 'abandoned' status rather than deleting the row,
// so a discarded draft still shows up in history same as any other
// abandoned goal.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const { data: dealership } = profile?.dealership_id
    ? await supabase.from("dealerships").select("id").eq("id", profile.dealership_id).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  if (!dealership) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const service = createServiceClient();
  const { data: goal } = await service.from("goals").select("id, status").eq("id", id).eq("dealership_id", dealership.id).maybeSingle();
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  if (goal.status !== "draft") return NextResponse.json({ error: "This goal isn't a pending draft" }, { status: 400 });

  const { error } = await service.from("goals").update({ status: "abandoned", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
