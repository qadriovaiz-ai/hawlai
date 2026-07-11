import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { checkVideoOperation } from "@/lib/agents/videoAgent";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: record } = await supabase
    .from("video_generations")
    .select("*")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .single();

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "pending") return NextResponse.json(record);
  if (!record.operation_name) return NextResponse.json(record);

  const result = await checkVideoOperation(record.operation_name);

  if (!result.done) return NextResponse.json(record);

  if (result.error) {
    const { data: updated } = await supabase
      .from("video_generations")
      .update({ status: "failed", error_message: result.error })
      .eq("id", id)
      .select()
      .single();
    return NextResponse.json(updated);
  }

  if (result.videoBuffer) {
    const serviceClient = createServiceClient();
    const filePath = `videos/${dealershipId}/${id}.mp4`;
    await serviceClient.storage.from("ad-creatives").upload(filePath, result.videoBuffer, { contentType: "video/mp4", upsert: true });
    const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);

    const { data: updated } = await supabase
      .from("video_generations")
      .update({ status: "ready", video_url: publicUrlData.publicUrl })
      .eq("id", id)
      .select()
      .single();
    return NextResponse.json(updated);
  }

  return NextResponse.json(record);
}
