import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getPlan } from "@/lib/plans";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("plan").eq("id", profile.dealership_id).single();
  const plan = getPlan(dealership?.plan);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const since = monthStart.toISOString();

  const [calls, content, images, videos] = await Promise.all([
    supabase.from("calls").select("id", { count: "exact", head: true }).eq("dealership_id", profile.dealership_id).gte("created_at", since),
    supabase.from("content_pieces").select("id", { count: "exact", head: true }).eq("dealership_id", profile.dealership_id).gte("created_at", since),
    supabase.from("graphic_designs").select("id", { count: "exact", head: true }).eq("dealership_id", profile.dealership_id).gte("created_at", since),
    supabase.from("video_generations").select("id", { count: "exact", head: true }).eq("dealership_id", profile.dealership_id).gte("created_at", since),
  ]);

  return NextResponse.json({
    plan: dealership?.plan ?? "free",
    planDetails: plan,
    usage: {
      calls: calls.count ?? 0,
      content: content.count ?? 0,
      images: images.count ?? 0,
      videos: videos.count ?? 0,
    },
  });
}
