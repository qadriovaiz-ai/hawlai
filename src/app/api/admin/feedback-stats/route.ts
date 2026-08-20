import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Platform-level evaluation view — not scoped to one dealership,
// since the point is seeing AI response quality across every
// business using Master Chat. Same auth pattern as /api/admin/spend
// (real user session + is_platform_admin flag), not the shared-secret
// pattern used by seed-knowledge, since this surfaces real
// conversation content across dealerships and should be tied to a
// real authenticated admin identity, not just anyone holding a secret.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const service = createServiceClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: messages } = await service
    .from("chat_messages")
    .select("id, content, feedback, tools_used, created_at, conversation_id")
    .eq("role", "assistant")
    .not("feedback", "is", null)
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false });

  // P2 17a — AI self-generated quality signals, distinct from the
  // human feedback above: how often the AI's own advisory checks
  // (brand voice, advertising-claim compliance) actually flag
  // something, and how confident the AI reports being in its own ad
  // copy. Both already exist in the schema (chat_messages.artifacts,
  // migration 081; ad_creatives.creative_score) but were never
  // surfaced together anywhere — no new logging, no new table.
  const { data: allAssistantMessages } = await service
    .from("chat_messages")
    .select("artifacts")
    .eq("role", "assistant")
    .gte("created_at", thirtyDaysAgo)
    .not("artifacts", "is", null);
  let flaggedCount = 0;
  let artifactCount = 0;
  for (const m of allAssistantMessages ?? []) {
    for (const a of (m.artifacts as any[]) ?? []) {
      artifactCount++;
      if ((a?.brandVoiceFlags?.length ?? 0) > 0 || (a?.complianceFlags?.length ?? 0) > 0) flaggedCount++;
    }
  }

  const { data: creatives } = await service
    .from("ad_creatives")
    .select("creative_score")
    .gte("created_at", thirtyDaysAgo)
    .not("creative_score", "is", null);
  const scores = (creatives ?? []).map((c) => c.creative_score as number);
  const creativeScoreStats = scores.length > 0 ? {
    count: scores.length,
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    low: scores.filter((s) => s < 50).length,
    mid: scores.filter((s) => s >= 50 && s < 75).length,
    high: scores.filter((s) => s >= 75).length,
  } : null;

  const all = messages ?? [];
  const up = all.filter((m) => m.feedback === "up").length;
  const down = all.filter((m) => m.feedback === "down").length;

  // Pull dealership names for the down-voted ones specifically, since
  // that's the list worth actually reading — up-voted responses don't
  // need review.
  const downVoted = all.filter((m) => m.feedback === "down").slice(0, 30);
  const conversationIds = [...new Set(downVoted.map((m) => m.conversation_id))];
  const { data: conversations } = await service.from("chat_conversations").select("id, dealership_id, dealerships(dealership_name)").in("id", conversationIds);
  const dealershipByConversation = new Map((conversations ?? []).map((c: any) => [c.id, c.dealerships?.dealership_name ?? "Unknown"]));

  const recentDownVoted = downVoted.map((m) => ({
    id: m.id,
    content: m.content,
    toolsUsed: m.tools_used ?? [],
    createdAt: m.created_at,
    dealershipName: dealershipByConversation.get(m.conversation_id) ?? "Unknown",
  }));

  // Which tools show up disproportionately in down-voted responses —
  // a real signal for where the knowledge base or a specific agent
  // might need attention, versus overall noise.
  const toolCounts: Record<string, number> = {};
  for (const m of downVoted) {
    for (const t of m.tools_used ?? []) toolCounts[t] = (toolCounts[t] ?? 0) + 1;
  }
  const toolsInDownVoted = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tool, count]) => ({ tool, count }));

  return NextResponse.json({
    totalRated: all.length,
    up,
    down,
    upRate: all.length > 0 ? Math.round((up / all.length) * 1000) / 10 : null,
    recentDownVoted,
    toolsInDownVoted,
    flagRate: {
      artifactCount,
      flaggedCount,
      pct: artifactCount > 0 ? Math.round((flaggedCount / artifactCount) * 1000) / 10 : null,
    },
    creativeScoreStats,
  });
}
