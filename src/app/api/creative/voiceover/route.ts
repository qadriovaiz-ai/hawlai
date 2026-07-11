import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { generateVoiceover } from "@/lib/agents/voiceoverAgent";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { text } = await request.json();
  if (!text || text.trim().length < 1) return NextResponse.json({ error: "Enter some text to read" }, { status: 400 });

  try {
    const buffer = await generateVoiceover(text);
    const serviceClient = createServiceClient();
    const filePath = `voiceovers/${dealershipId}/${Date.now()}.mp3`;
    await serviceClient.storage.from("ad-creatives").upload(filePath, buffer, { contentType: "audio/mpeg", upsert: true });
    const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
