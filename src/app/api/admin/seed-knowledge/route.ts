import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { embedText } from "@/lib/knowledge/voyageClient";
import { MARKETING_KNOWLEDGE_SEED } from "@/lib/knowledge/marketingKnowledgeSeed";
import { MARKETING_KNOWLEDGE_SEED_2 } from "@/lib/knowledge/marketingKnowledgeSeed2";
import { MARKETING_KNOWLEDGE_SEED_3 } from "@/lib/knowledge/marketingKnowledgeSeed3";
import { MARKETING_KNOWLEDGE_SEED_4 } from "@/lib/knowledge/marketingKnowledgeSeed4";
import { MARKETING_KNOWLEDGE_SEED_5 } from "@/lib/knowledge/marketingKnowledgeSeed5";
import { MARKETING_KNOWLEDGE_SEED_6 } from "@/lib/knowledge/marketingKnowledgeSeed6";
import { MARKETING_KNOWLEDGE_SEED_7 } from "@/lib/knowledge/marketingKnowledgeSeed7";
import { MARKETING_KNOWLEDGE_SEED_8 } from "@/lib/knowledge/marketingKnowledgeSeed8";

const ALL_SEED_ENTRIES = [...MARKETING_KNOWLEDGE_SEED, ...MARKETING_KNOWLEDGE_SEED_2, ...MARKETING_KNOWLEDGE_SEED_3, ...MARKETING_KNOWLEDGE_SEED_4, ...MARKETING_KNOWLEDGE_SEED_5, ...MARKETING_KNOWLEDGE_SEED_6, ...MARKETING_KNOWLEDGE_SEED_7, ...MARKETING_KNOWLEDGE_SEED_8];

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

// One-time (or resumable) seeding of the marketing knowledge base.
// Protected by a secret rather than normal user auth, since this has
// nothing to do with any dealership — it's a platform-level admin
// operation. Call once after VOYAGE_API_KEY is set, via
// hawlai.online/admin-seed-knowledge.
//
// Safe to call repeatedly — skips entries already present by title
// rather than deleting and re-inserting everything, so it makes
// forward progress across multiple runs if rate-limited partway
// through (see the 3 RPM note below).
export async function POST(request: Request) {
  const secret = request.headers.get("x-seed-secret");
  const expected = process.env.ADMIN_SEED_SECRET;
  if (!expected) return NextResponse.json({ error: "ADMIN_SEED_SECRET not configured in environment" }, { status: 500 });
  if (secret !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json({ error: "VOYAGE_API_KEY not configured yet — add it in Vercel env vars first" }, { status: 500 });
  }

  const supabase = createServiceClient();

  // Skip entries already seeded — makes this genuinely resumable
  // under Voyage's reduced 3 RPM/10K TPM limit (applies until a
  // payment method is added on the MongoDB Atlas account). Without
  // this, every click re-wastes quota re-embedding entries that
  // already succeeded last time, instead of making forward progress.
  // Trade-off: this matches by TITLE only, so if an entry's CONTENT
  // is edited later without changing its title, this won't re-seed
  // it — a manual `delete from marketing_knowledge` would be needed
  // first in that case.
  const { data: existing } = await supabase.from("marketing_knowledge").select("title");
  const alreadySeeded = new Set((existing ?? []).map((r: any) => r.title));
  const remaining = ALL_SEED_ENTRIES.filter((e) => !alreadySeeded.has(e.title));

  if (remaining.length === 0) {
    return NextResponse.json({ seeded: 0, total: ALL_SEED_ENTRIES.length, alreadySeededBefore: alreadySeeded.size, results: [], note: "Everything is already seeded." });
  }

  // 3 concurrent requests — matches Voyage's reduced-limit tier (3 RPM)
  // rather than the earlier 8, which was far above that limit and is
  // exactly why most of the last run failed with 429s. Once a payment
  // method is added on the MongoDB Atlas account, this can safely go
  // back up for faster seeding, but 3 is the honest safe default
  // until then.
  const results = await mapWithConcurrency(remaining, 3, async (entry) => {
    const result = await embedText(`${entry.title}\n\n${entry.content}`, "document");
    if ("error" in result) return { title: entry.title, success: false, error: result.error };

    const { error } = await supabase.from("marketing_knowledge").insert({
      category: entry.category,
      title: entry.title,
      content: entry.content,
      embedding: result.embedding,
    });
    return { title: entry.title, success: !error, error: error?.message };
  });

  const succeeded = results.filter((r) => r.success).length;
  return NextResponse.json({
    seeded: succeeded,
    total: ALL_SEED_ENTRIES.length,
    alreadySeededBefore: alreadySeeded.size,
    remainingAfterThisRun: remaining.length - succeeded,
    results,
  });
}
