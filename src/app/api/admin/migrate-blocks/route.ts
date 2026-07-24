import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { legacyToBlocks, isAlreadyBlockShaped } from "@/lib/blocks/convertLegacy";

// One-off maintenance endpoint — sweeps up the "long tail" of
// website_pages rows still in the old fixed-section-type shape that
// nobody has re-saved through the new block canvas yet (every save
// from that canvas already writes block-shaped JSON, so this is only
// ever mopping up pages nobody has opened since the Phase 7 cutover).
//
// Deliberately NOT wired into any UI, and gated behind a secret rather
// than a dealer session — it uses the service-role client to write
// across every dealership, which no ordinary authenticated request
// should ever be able to trigger. Set MIGRATE_BLOCKS_SECRET in the
// environment, then:
//   GET  /api/admin/migrate-blocks   (with the header below) — dry run,
//        lists every page that still needs converting, writes nothing.
//   POST /api/admin/migrate-blocks   (same header) — actually converts
//        and saves them.
// Both require: x-migrate-secret: <MIGRATE_BLOCKS_SECRET>
//
// Take a backup (Supabase dashboard -> Database -> Backups, or export
// the website_pages table) before running the POST for real — this
// writes to every dealership's live pages at once.

function checkAuth(request: Request): NextResponse | null {
  const secret = process.env.MIGRATE_BLOCKS_SECRET;
  if (!secret) return NextResponse.json({ error: "MIGRATE_BLOCKS_SECRET is not configured — refusing to run" }, { status: 403 });
  if (request.headers.get("x-migrate-secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

async function findUnmigratedPages(supabase: any) {
  const { data: pages, error } = await supabase.from("website_pages").select("id, website_id, slug, title, sections");
  if (error) throw new Error(error.message);
  return (pages ?? []).filter((p: any) => !isAlreadyBlockShaped(p.sections));
}

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const supabase = createServiceClient();
  try {
    const unmigrated = await findUnmigratedPages(supabase);
    return NextResponse.json({
      dryRun: true,
      totalUnmigrated: unmigrated.length,
      pages: unmigrated.map((p: any) => ({ id: p.id, websiteId: p.website_id, slug: p.slug, title: p.title })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const supabase = createServiceClient();
  try {
    const unmigrated = await findUnmigratedPages(supabase);
    const results: { id: string; slug: string; ok: boolean; error?: string }[] = [];

    for (const page of unmigrated) {
      const blocks = legacyToBlocks(page.sections);
      const { error } = await supabase.from("website_pages").update({ sections: blocks }).eq("id", page.id);
      results.push({ id: page.id, slug: page.slug, ok: !error, error: error?.message });
    }

    const succeeded = results.filter((r) => r.ok).length;
    return NextResponse.json({ dryRun: false, totalFound: unmigrated.length, succeeded, failed: unmigrated.length - succeeded, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
