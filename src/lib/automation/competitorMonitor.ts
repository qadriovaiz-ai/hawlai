// Real "New Product Alerts" monitoring — runs daily via the autopilot
// cron. For each competitor a dealer is watching, searches for recent
// news/launches and inserts only genuinely new items (deduped by
// exact title match against what's already been recorded for that
// competitor), so the alerts feed doesn't repeat the same story every
// day. Uses Claude's web_search tool — this is real search-grounded
// output, not fabricated "there's a new product" claims.

import { emitNotification } from "../notifications/emit";
import { recordSignal, fingerprintOf } from "@/lib/signals/signals";
import { getModel } from "../models";
import { callClaude, aiFailureNote, isPlatformOutage, type AiFailureNote } from "@/lib/ai/claude";

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
  // Said, not swallowed: "no new alerts" and "couldn't check" are different answers.
  let aiFailure: AiFailureNote | undefined;

  for (const watch of watches) {
    try {
      const r = await callClaude({
        model: getModel("standard"),
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `Search for recent news about "${watch.competitor_name}" (a ${dealership?.business_category ?? "business"} competitor) — new product launches, major announcements, or notable offers from the last few days. Return JSON only: {"items": [{"title": "short headline", "summary": "1-2 sentences", "sourceUrl": "the URL you found this from"}]} — up to 5 items. If you find nothing recent, return {"items": []}. Never invent items — only include what you actually found via search.`,
        }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }, { operation: "competitor_monitor", logContext: { supabase, dealershipId } });
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
        // The same finding, filed where the other departments can read
        // it (migration 198). The alert above is news for the owner; this
        // is input for strategy, positioning and content. Recorded as
        // `observed`, not `inferred`: it is a competitor's own
        // announcement, quoted, with the page it came from.
        await recordSignal(supabase, dealershipId, {
          source: "competitor_monitor",
          topic: watch.competitor_name,
          summary: `${watch.competitor_name}: ${item.title}`,
          evidence: { competitor: watch.competitor_name, headline: item.title, detail: item.summary ?? null },
          confidence: "observed",
          sourceUrl: item.sourceUrl ?? null,
          fingerprint: fingerprintOf(["competitor_monitor", watch.competitor_name, item.title]),
        });

        // Only reached for genuinely new alerts — the title dedupe
        // above already skipped anything seen before.
        await emitNotification(supabase, {
          dealershipId,
          kind: "competitor_alert",
          title: `${watch.competitor_name}: ${item.title}`,
          body: item.summary ?? null,
          href: "/dashboard/competitor-intel",
          dedupeKey: `competitor:${watch.competitor_name}:${item.title}`,
        });
        newAlerts++;
      }
    } catch (err: any) {
      console.error("[competitor-monitor] error for", watch.competitor_name, err.message);
    }
  }

  return { newAlerts, ...(aiFailure ? { aiFailure } : {}) };
}
