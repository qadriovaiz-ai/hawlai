import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateSeoIdeas } from "@/lib/agents/seoAgent";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { topic, city } = await request.json();
  if (!topic || topic.trim().length < 2) {
    return NextResponse.json({ error: "Topic is too short" }, { status: 400 });
  }

  const ideas = await generateSeoIdeas(topic.trim(), city);
  return NextResponse.json(ideas);
}
