import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: page } = await supabase.from("landing_pages").select("published").eq("dealership_id", dealershipId).maybeSingle();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase
    .from("page_events")
    .select("event_type, x_pct, y_pct, created_at")
    .eq("dealership_id", dealershipId)
    .gte("created_at", thirtyDaysAgo);

  const all = events ?? [];
  const views = all.filter((e) => e.event_type === "view").length;
  const chatOpens = all.filter((e) => e.event_type === "chat_open").length;
  const formSubmits = all.filter((e) => e.event_type === "form_submit").length;
  const clicks = all.filter((e) => e.event_type === "click" && e.x_pct !== null);

  return NextResponse.json({
    published: !!page?.published,
    views,
    chatOpens,
    formSubmits,
    engagementRate: views > 0 ? ((chatOpens + formSubmits) / views) * 100 : null,
    conversionRate: views > 0 ? (formSubmits / views) * 100 : null,
    heatmapPoints: clicks.slice(-500).map((c) => ({ x: c.x_pct, y: c.y_pct })),
  });
}
