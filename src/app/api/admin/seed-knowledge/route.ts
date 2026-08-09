import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { embedText } from "@/lib/knowledge/voyageClient";
import { MARKETING_KNOWLEDGE_SEED } from "@/lib/knowledge/marketingKnowledgeSeed";
import { MARKETING_KNOWLEDGE_SEED_2 } from "@/lib/knowledge/marketingKnowledgeSeed2";

const ALL_SEED_ENTRIES = [...MARKETING_KNOWLEDGE_SEED, ...MARKETING_KNOWLEDGE_SEED_2];

// 60s is the maximum Vercel allows on the Hobby plan regardless of
// what's set here — without this, the platform default (much
// shorter) was killing the function mid-run on 53 sequential
// embedding calls, which is what produced the "Unexpected end of
// JSON input" error (Vercel cuts the response off, leaving invalid
// JSON on the wire).
export const maxDuration = 60;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// One-time (or re-run-safe) seeding of the marketing knowledge base.
// Protected by a secret rather than normal user auth, since this has
// nothing to do with any dealership — it's a platform-level admin
// operation. Call once after VOYAGE_API_KEY is set, via
// hawlai.online/admin-seed-knowledge.
//
// Safe to re-run — clears and re-inserts rather than duplicating.
export async function POST(request: Request) {
  const secret = request.headers.get("x-seed-secret");
  const expected = process.env.ADMIN_SEED_SECRET;
  if (!expected) return NextResponse.json({ error: "ADMIN_SEED_SECRET not configured in environment" }, { status: 500 });
  if (secret !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json({ error: "VOYAGE_API_KEY not configured yet — add it in Vercel env vars first" }, { status: 500 });
  }

  const supabase = createServiceClient();
  await supabase.from("marketing_knowledge").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // clear existing so re-runs don't duplicate

  // 8 concurrent embedding requests at a time — fast enough to finish
  // well within the 60s limit for 53 entries, while staying well
  // under any reasonable Voyage rate limit.
  const results = await mapWithConcurrency(ALL_SEED_ENTRIES, 8, async (entry) => {
    const embedding = await embedText(`${entry.title}\n\n${entry.content}`, "document");
    if (!embedding) return { title: entry.title, success: false, error: "Embedding failed" };

    const { error } = await supabase.from("marketing_knowledge").insert({
      category: entry.category,
      title: entry.title,
      content: entry.content,
      embedding,
    });
    return { title: entry.title, success: !error, error: error?.message };
  });

  const succeeded = results.filter((r) => r.success).length;
  return NextResponse.json({ seeded: succeeded, total: ALL_SEED_ENTRIES.length, results });
}
