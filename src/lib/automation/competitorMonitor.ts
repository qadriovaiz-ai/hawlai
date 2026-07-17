// Real "New Product Alerts" monitoring — runs daily via the autopilot
// cron. For each competitor a dealer is watching, searches for recent
// news/launches and inserts only genuinely new items (deduped by
// exact title match against what's already been recorded for that
// competitor), so the alerts feed doesn't repeat the same story every
// day. Uses Claude's web_search tool — this is real search-grounded
// output, not fabricated "there's a new product" claims.

export async function checkCompetitorAlerts(supabase: any, dealershipId: string) {
  const { data: watches } = await supabase
    .from("competitor_watches")
    .select("competitor_name")
    .eq("dealership_id", dealershipId);
  if (!watches || watches.length === 0) return { newAlerts: 0, skipped: "no watched competitors" };

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("business_category")
    .eq("id", dealershipId)
    .single();

  let newAlerts = 0;

  for (const watch of watches) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: `Search for recent news about "${watch.competitor_name}" (a ${dealership?.business_category ?? "business"} competitor) — new product launches, major announcements, or notable offers from the last few days. Return JSON only: {"items": [{"title": "short headline", "summary": "1-2 sentences", "sourceUrl": "the URL you found this from"}]} — up to 5 items. If you find nothing recent, return {"items": []}. Never invent items — only include what you actually found via search.`,
          }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      if (!response.ok) continue;
      const bodyText = await response.text();
      if (!bodyText.trim()) continue;
      const data = JSON.parse(bodyText);
      const text = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
      if (!clean) continue;
      const parsed = JSON.parse(clean);

      for (const item of parsed.items ?? []) {
        if (!item.title) continue;
        const { data: existing } = await supabase
          .from("competitor_alerts")
          .select("id")
          .eq("dealership_id", dealershipId)
          .eq("competitor_name", watch.competitor_name)
          .eq("title", item.title)
          .maybeSingle();
        if (existing) continue;

        await supabase.from("competitor_alerts").insert({
          dealership_id: dealershipId,
          competitor_name: watch.competitor_name,
          title: item.title,
          summary: item.summary ?? null,
          source_url: item.sourceUrl ?? null,
        });
        newAlerts++;
      }
    } catch (err: any) {
      console.error("[competitor-monitor] error for", watch.competitor_name, err.message);
    }
  }

  return { newAlerts };
}
