import { generateGraphic } from "@/lib/agents/graphicDesignAgent";
import { generateContent } from "@/lib/agents/contentMarketingAgent";
import { postPhotoToPage } from "@/lib/agents/socialMediaAgent";
import { createServiceClient } from "@/lib/supabase/service";

// Runs daily as part of the autopilot cron. Fully automatic — no
// human touches the generated content before it's posted. This is
// deliberately scoped to organic social posting only; anything that
// spends money (ads/budget) is never part of this, per the
// always-approval-required rule for financial actions.
export async function runContentAutopilot(supabase: any, dealershipId: string) {
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, business_category, fb_page_id, fb_page_access_token, content_autopilot_enabled, content_autopilot_frequency_days, content_autopilot_last_posted_at")
    .eq("id", dealershipId)
    .single();

  if (!dealership?.content_autopilot_enabled) return { skipped: "disabled" };
  if (!dealership.fb_page_id || !dealership.fb_page_access_token) return { skipped: "facebook not connected" };

  const frequencyDays = dealership.content_autopilot_frequency_days ?? 3;
  if (dealership.content_autopilot_last_posted_at) {
    const daysSince = (Date.now() - new Date(dealership.content_autopilot_last_posted_at).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSince < frequencyDays) return { skipped: "not due yet" };
  }

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, messaging_pillars")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  const pillars = brandProfile?.messaging_pillars ?? [];
  const topic = pillars.length > 0 ? pillars[Math.floor(Math.random() * pillars.length)] : "";

  let imageUrl: string | null = null;
  let caption: string | null = null;
  let postId: string | null = null;
  let success = true;
  let error: string | null = null;

  try {
    const [imageBuffer, contentResult] = await Promise.all([
      generateGraphic("social_graphic", dealership.dealership_name ?? "the business", dealership.business_category ?? "business", topic, brandProfile),
      generateContent("instagram_post", dealership.dealership_name ?? "the business", dealership.business_category ?? "business", topic, brandProfile),
    ]);

    if (contentResult._fallback) throw new Error("Content generation fell back to placeholder — skipping this run rather than posting generic text");
    caption = contentResult.output.text ?? (Object.values(contentResult.output)[0] as string) ?? "";
    if (!caption) throw new Error("No caption text generated");

    const serviceClient = createServiceClient();
    const filePath = `content-autopilot/${dealershipId}/${Date.now()}.png`;
    await serviceClient.storage.from("ad-creatives").upload(filePath, imageBuffer, { contentType: "image/png", upsert: true });
    const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
    imageUrl = publicUrlData.publicUrl;

    const result = await postPhotoToPage(dealership.fb_page_id, dealership.fb_page_access_token, imageUrl, caption);
    postId = result.id;

    await supabase.from("dealerships").update({ content_autopilot_last_posted_at: new Date().toISOString() }).eq("id", dealershipId);
  } catch (err: any) {
    success = false;
    error = err.message;
  }

  await supabase.from("content_autopilot_log").insert({
    dealership_id: dealershipId, caption, image_url: imageUrl, post_id: postId, success, error,
  });

  return { posted: success };
}
