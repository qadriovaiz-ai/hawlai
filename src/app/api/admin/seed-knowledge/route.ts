import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rateLimit";
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

/**
 * Constant-time secret comparison.
 *
 * The previous `secret !== expected` leaked the length of the match
 * through timing. That is a weak oracle against a high-entropy secret
 * over a network, and no real attack was likely — but this codebase
 * already does the right thing in verifyMetaSignature and
 * verifyRazorpaySignature, and a route that visibly does it DIFFERENTLY
 * teaches the next reader the wrong lesson about which comparisons
 * matter here.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on a length mismatch, so this is required
  // for correctness, not as an optimisation — the same note
  // metaSignature.ts carries.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// One-time (or resumable) seeding of the marketing knowledge base.
//
// WHAT THIS CAN AND CANNOT DO, since "admin seeding endpoint" sounds
// far more dangerous than it is: it reads NO request body. The content
// is the hardcoded ALL_SEED_ENTRIES above. There is no way to inject
// arbitrary text into the knowledge base through it, and nothing here
// is dealership-scoped.
//
// THREE GATES, in order, cheapest first:
//   1. A real logged-in session with profiles.is_platform_admin —
//      matching /api/admin/spend and /api/admin/feedback-stats. This
//      is new: the route previously accepted anyone holding the
//      shared secret, with no identity attached at all.
//   2. The shared secret, kept as a second factor and now compared in
//      constant time. It is deliberately NOT dropped now that there
//      is a session gate: this runs 300+ paid embedding calls under
//      the service role, and a compromised admin session alone
//      should not be enough to start that.
//   3. A rate limit keyed on the admin's user id, because each run
//      costs real money at Voyage and the failure mode of a
//      double-click is a duplicated bill, not a security breach.
//
// Safe to call repeatedly — skips entries already present by title
// rather than deleting and re-inserting everything, so it makes
// forward progress across multiple runs if rate-limited partway
// through (see the 3 RPM note below).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  if (!profile?.is_platform_admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  // Keyed on the authenticated user id, not an IP — IPs are shared,
  // spoofable, and meaningless once a session is already required.
  const limit = checkRateLimit(`seed-knowledge:${user.id}`, 3, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many seeding runs. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const expected = process.env.ADMIN_SEED_SECRET;
  if (!expected) return NextResponse.json({ error: "ADMIN_SEED_SECRET not configured in environment" }, { status: 500 });
  if (!secretMatches(request.headers.get("x-seed-secret"), expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json({ error: "VOYAGE_API_KEY not configured yet — add it in Vercel env vars first" }, { status: 500 });
  }

  // Service role for the writes: the seed table is platform-level and
  // not reachable through the admin's own RLS context. Reached only
  // after all three gates above.
  const service = createServiceClient();

  // Skip entries already seeded — makes this genuinely resumable
  // under Voyage's reduced 3 RPM/10K TPM limit (applies until a
  // payment method is added on the MongoDB Atlas account). Without
  // this, every click re-wastes quota re-embedding entries that
  // already succeeded last time, instead of making forward progress.
  // Trade-off: this matches by TITLE only, so if an entry's CONTENT
  // is edited later without changing its title, this won't re-seed
  // it — a manual `delete from marketing_knowledge` would be needed
  // first in that case.
  const { data: existing } = await service.from("marketing_knowledge").select("title");
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

    const { error } = await service.from("marketing_knowledge").insert({
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
