// News Monitoring — generalized version of the competitor-watch
// pattern (see lib/automation/competitorMonitor.ts) for any topic,
// not just a named competitor: industry news, a regulation, a
// location, anything the dealer wants to keep an eye on. Same dedup
// approach (only insert alerts whose title hasn't been seen before
// for that topic) so the feed doesn't repeat the same story daily.

export async function checkTopicAlerts(supabase: any, dealershipId: string) {
  const { data: watches } = await supabase
    .from("topic_watches")
    .select("topic")
    .eq("dealership_id", dealershipId);
  if (!watches || watches.length === 0) return { newAlerts: 0, skipped: "no watched topics" };

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
            content: `Search for recent news about "${watch.topic}" from the last few days. Return JSON only: {"items": [{"title": "short headline", "summary": "1-2 sentences", "sourceUrl": "the URL you found this from"}]} — up to 5 items. If nothing recent, return {"items": []}. Never invent items — only include what you actually found via search.`,
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
          .from("topic_alerts")
          .select("id")
          .eq("dealership_id", dealershipId)
          .eq("topic", watch.topic)
          .eq("title", item.title)
          .maybeSingle();
        if (existing) continue;

        await supabase.from("topic_alerts").insert({
          dealership_id: dealershipId,
          topic: watch.topic,
          title: item.title,
          summary: item.summary ?? null,
          source_url: item.sourceUrl ?? null,
        });
        newAlerts++;
      }
    } catch (err: any) {
      console.error("[topic-monitor] error for", watch.topic, err.message);
    }
  }

  return { newAlerts };
}
