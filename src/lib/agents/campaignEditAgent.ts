// ------------------------------------------------------------------
// Campaign Edit Agent — conversational campaign editing
// ------------------------------------------------------------------
// The specific thing Cursor/Lovable-style tools do that a form-based
// dashboard doesn't: "pause my Swift ad", "increase budget on the
// Creta campaign to 2000" should just work as a sentence, without
// navigating to a settings page and finding the right toggle.
//
// Pause/resume execute directly (safe, reversible, no new spend).
// Budget changes go through the same Approval Layer everything else
// does — Ovaiz explicitly chose "always ask before any budget change"
// earlier, so this doesn't get a special exemption just because it
// arrived via chat instead of a form.
// ------------------------------------------------------------------

const GRAPH_VERSION = "v23.0";

interface CampaignSummary {
  id: string;
  headline: string;
  car_type: string | null;
  targeting_city: string | null;
  daily_budget: number | null;
  meta_status: string | null;
  meta_ad_id: string | null;
}

export async function matchCampaign(campaigns: CampaignSummary[], description: string): Promise<CampaignSummary | null> {
  if (campaigns.length === 0) return null;
  if (campaigns.length === 1) return campaigns[0]; // only one campaign — no ambiguity

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: `A dealer said: "${description}"\nWhich campaign are they most likely referring to? Campaigns:\n${campaigns.map((c, i) => `${i}: "${c.headline}" (${c.car_type ?? "no model"}, ${c.targeting_city ?? "no city"}, ₹${c.daily_budget}/day, ${c.meta_status})`).join("\n")}\nReturn JSON only: {"index": number or null if none clearly match}`,
          },
        ],
      }),
    });
    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse((jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim());
    if (parsed.index === null || parsed.index === undefined) return null;
    return campaigns[parsed.index] ?? null;
  } catch (err: any) {
    console.error("[campaign-edit-agent] matchCampaign error:", err.message);
    return null;
  }
}

export async function setCampaignStatus(
  supabase: any,
  dealershipId: string,
  campaign: CampaignSummary,
  status: "ACTIVE" | "PAUSED"
): Promise<{ success: boolean; error?: string }> {
  if (!campaign.meta_ad_id) return { success: false, error: "This campaign hasn't been launched on Meta yet" };

  const { data: dealership } = await supabase
    .from("dealerships").select("fb_page_access_token").eq("id", dealershipId).single();
  const token = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return { success: false, error: "Facebook Page isn't connected" };

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${campaign.meta_ad_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: token }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    return { success: false, error: data.error?.message ?? "Meta API error" };
  }

  await supabase.from("ad_creatives").update({ meta_status: status }).eq("id", campaign.id);
  return { success: true };
}
