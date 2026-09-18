// News Monitoring — generalized version of the competitor-watch
// pattern (see lib/automation/competitorMonitor.ts) for any topic,
// not just a named competitor: industry news, a regulation, a
// location, anything the dealer wants to keep an eye on. Same dedup
// approach (only insert alerts whose title hasn't been seen before
// for that topic) so the feed doesn't repeat the same story daily.

import { emitNotification } from "../notifications/emit";
import { getModel } from "../models";
import { callClaude, aiFailureNote, isPlatformOutage, type AiFailureNote } from "@/lib/ai/claude";

export async function checkTopicAlerts(supabase: any, dealershipId: string) {
  const { data: watches } = await supabase
    .from("topic_watches")
    .select("topic")
    .eq("dealership_id", dealershipId);
  if (!watches || watches.length === 0) return { newAlerts: 0, skipped: "no watched topics" };

  let newAlerts = 0;
  // Said, not swallowed: "no new alerts" and "couldn't check" are different answers.
  let aiFailure: AiFailureNote | undefined;

  for (const watch of watches) {
    try {
      const r = await callClaude({
        model: getModel("standard"),
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `Search for recent news about "${watch.topic}" from the last few days. Return JSON only: {"items": [{"title": "short headline", "summary": "1-2 sentences", "sourceUrl": "the URL you found this from"}]} — up to 5 items. If nothing recent, return {"items": []}. Never invent items — only include what you actually found via search.`,
        }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }, { operation: "topic_monitor", logContext: { supabase, dealershipId } });
      if (!r.ok) {
        aiFailure = aiFailureNote(r.failure);
        // Down for everyone: every other watch would fail the same way.
        if (isPlatformOutage(r.failure.kind)) break;
        continue;
      }
      // Web-search replies interleave text blocks with search results.
      const text = (r.data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
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
        // Only reached for genuinely new alerts — the title dedupe
        // above already skipped anything seen before.
        await emitNotification(supabase, {
          dealershipId,
          kind: "topic_alert",
          title: `${watch.topic}: ${item.title}`,
          body: item.summary ?? null,
          href: "/dashboard/research-agent",
          dedupeKey: `topic:${watch.topic}:${item.title}`,
        });
        newAlerts++;
      }
    } catch (err: any) {
      console.error("[topic-monitor] error for", watch.topic, err.message);
    }
  }

  return { newAlerts, ...(aiFailure ? { aiFailure } : {}) };
}
