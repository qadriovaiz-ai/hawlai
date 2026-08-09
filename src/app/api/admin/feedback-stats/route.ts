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
  });
}
