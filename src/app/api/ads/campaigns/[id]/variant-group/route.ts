import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const LABELS = ["A", "B", "C", "D", "E"];

// Ensures the launched campaign at [id] has a variant_group_id — this
// is how "test a variant against this campaign" starts: the first
// campaign in a comparison is retroactively labeled A the first time
// a second variant is requested against it, since nothing needed a
// group id until then. Returns the group id and the next unused
// letter, so the caller (full-launch, pre-filled via query params)
// knows what to launch the new variant as.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: creative } = await supabase
    .from("ad_creatives")
    .select("id, variant_group_id, status")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  if (!creative) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (creative.status !== "launched") return NextResponse.json({ error: "Only a launched campaign can be tested against" }, { status: 400 });

  let groupId = creative.variant_group_id;
  if (!groupId) {
    groupId = crypto.randomUUID();
    const { error } = await supabase.from("ad_creatives").update({ variant_group_id: groupId, variant_label: "A" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: members } = await supabase.from("ad_creatives").select("variant_label").eq("variant_group_id", groupId);
  const usedLabels = new Set((members ?? []).map((m: any) => m.variant_label).filter(Boolean));
  const nextLabel = LABELS.find((l) => !usedLabels.has(l)) ?? `Variant ${(members?.length ?? 0) + 1}`;

  return NextResponse.json({ variantGroupId: groupId, nextLabel });
}
