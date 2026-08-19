import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { generateGraphic } from "@/lib/agents/graphicDesignAgent";
import { generateContent } from "@/lib/agents/contentMarketingAgent";
import { checkAndRecordGenerationUsage, generationLimitMessage } from "@/lib/usage/generationLimits";

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

  const { data } = await supabase
    .from("social_post_queue")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("scheduled_for", { ascending: true });
  return NextResponse.json({ items: data ?? [] });
}

// Generates one real post (image + caption, same generators the
// existing autopilot uses) for a specific date and adds it to the
// queue as 'queued' — nothing posts yet, this just prepares something
// the dealer can review, edit, or delete before its scheduled date.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const { scheduledFor, topic } = body;
  if (!scheduledFor) return NextResponse.json({ error: "scheduledFor date required" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single();
  const { data: brandProfile } = await supabase.from("brand_profiles").select("tone_of_voice, messaging_pillars").eq("dealership_id", dealershipId).maybeSingle();

  const name = dealership?.dealership_name ?? "the business";
  const category = dealership?.business_category ?? "business";
  const pillars = brandProfile?.messaging_pillars ?? [];
  const effectiveTopic = topic || (pillars.length > 0 ? pillars[Math.floor(Math.random() * pillars.length)] : "");

  // P0 cost-governance fix — this route was generating real Gemini
  // images with no monthly-cap check and no cost logging at all,
  // reachable by any authenticated user regardless of plan (including
  // Free). Same check + logContext every other image-generation call
  // site already uses (see /api/graphic-design/generate/route.ts).
  const usage = await checkAndRecordGenerationUsage(dealershipId, "image");
  if (!usage.allowed) return NextResponse.json({ error: generationLimitMessage(usage), limitReached: true }, { status: 429 });

  const [imageBuffer, contentResult] = await Promise.all([
    generateGraphic("social_graphic", name, category, effectiveTopic, brandProfile, { supabase, dealershipId }),
    generateContent("instagram_post", name, category, effectiveTopic, brandProfile, { supabase, dealershipId }),
  ]);

  if (contentResult._fallback) return NextResponse.json({ error: "Content generation didn't work right now — try again shortly." }, { status: 500 });
  const caption = contentResult.output.text ?? (Object.values(contentResult.output)[0] as string) ?? "";
  if (!caption) return NextResponse.json({ error: "Couldn't generate a caption" }, { status: 500 });

  const serviceClient = createServiceClient();
  const filePath = `content-queue/${dealershipId}/${Date.now()}.png`;
  await serviceClient.storage.from("ad-creatives").upload(filePath, imageBuffer, { contentType: "image/png", upsert: true });
  const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);

  const { data: saved, error } = await supabase.from("social_post_queue").insert({
    dealership_id: dealershipId,
    scheduled_for: scheduledFor,
    caption,
    image_url: publicUrlData.publicUrl,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, item: saved });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, caption, scheduledFor } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const update: any = {};
  if (caption !== undefined) update.caption = caption;
  if (scheduledFor !== undefined) update.scheduled_for = scheduledFor;

  // Only editable while still queued — once posted, the real post is
  // already live, editing this row wouldn't change what's on Instagram.
  const { error } = await supabase.from("social_post_queue").update(update).eq("id", id).eq("dealership_id", dealershipId).eq("status", "queued");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id } = await request.json();
  const { error } = await supabase.from("social_post_queue").delete().eq("id", id).eq("dealership_id", dealershipId).eq("status", "queued");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
