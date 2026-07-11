import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateBlogPost } from "@/lib/agents/seoAgent";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;

  const { topic, city } = await request.json();
  if (!topic || topic.trim().length < 2) return NextResponse.json({ error: "Topic is too short" }, { status: 400 });

  let businessCategory = "car dealership";
  if (dealershipId) {
    const { data: dealership } = await supabase.from("dealerships").select("business_category").eq("id", dealershipId).single();
    businessCategory = dealership?.business_category ?? "car dealership";
  }

  const post = await generateBlogPost(topic.trim(), city, businessCategory);
  return NextResponse.json(post);
}
