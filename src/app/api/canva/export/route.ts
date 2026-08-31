import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/canva/client";
import { startExport, getExportStatus, MIME_BY_FORMAT, type ExportFormat } from "@/lib/canva/designs";

// Export a finished Canva design back into Hawlai.
//
// Split into start (POST) and poll (PUT) because Canva has NO export
// webhook — polling is the only completion signal they offer, and an
// MP4 can take well past any serverless request timeout. Doing it in
// one long-running call would fail at the platform level with nothing
// useful to show the user.
//
// The job id is deliberately NOT persisted. It lives in the browser
// between the two calls, which keeps this off migration 158's schema.
// The trade-off, stated rather than hidden: if the user closes the tab
// mid-export the row stays in "exporting" and they re-export from the
// design list. Cheaper than a column and a cleanup job for a state
// that lasts seconds.

function formatFor(assetType: string): ExportFormat {
  return assetType === "video" ? "mp4" : "png";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = await getValidAccessToken(supabase, user.id);
  if (!accessToken) return NextResponse.json({ error: "Connect Canva first.", needsConnection: true }, { status: 400 });

  const { designRowId } = await request.json();

  // Selected through the session client so RLS confirms ownership —
  // not a service-role read with a .eq() we'd have to trust.
  const { data: row } = await supabase
    .from("canva_designs")
    .select("id, canva_design_id, asset_type")
    .eq("id", designRowId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "That design isn't yours or no longer exists." }, { status: 404 });

  try {
    const jobId = await startExport(accessToken, row.canva_design_id, formatFor(row.asset_type));
    await supabase.from("canva_designs").update({ status: "exporting" }).eq("id", row.id);
    return NextResponse.json({ jobId });
  } catch (err: any) {
    console.error("[canva] export start failed:", err?.message);
    await supabase.from("canva_designs").update({ status: "failed" }).eq("id", row.id);
    return NextResponse.json({ error: "Couldn't start that export." }, { status: 502 });
  }
}

// Poll an in-flight export. On success the file is copied into Supabase
// Storage immediately — Canva's download URLs expire after 24 hours, so
// storing their URL would leave the library full of links that work in
// testing and are dead the next day.
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = await getValidAccessToken(supabase, user.id);
  if (!accessToken) return NextResponse.json({ error: "Connect Canva first.", needsConnection: true }, { status: 400 });

  const { designRowId, jobId } = await request.json();
  if (!jobId) return NextResponse.json({ error: "No export to check." }, { status: 400 });

  const { data: row } = await supabase
    .from("canva_designs")
    .select("id, canva_design_id, asset_type, title")
    .eq("id", designRowId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "That design isn't yours or no longer exists." }, { status: 404 });

  let status;
  try {
    status = await getExportStatus(accessToken, jobId);
  } catch (err: any) {
    console.error("[canva] export status check failed:", err?.message);
    return NextResponse.json({ status: "in_progress" });
  }

  if (status.status === "in_progress") return NextResponse.json({ status: "in_progress" });

  if (status.status === "failed" || !status.urls?.length) {
    await supabase.from("canva_designs").update({ status: "failed" }).eq("id", row.id);
    return NextResponse.json({
      status: "failed",
      // Canva's reason is passed through when there is one: these are
      // often fixable by the user (an unlicensed stock element, a
      // design pending team approval) and "export failed" alone would
      // send them guessing.
      error: status.error ?? "Canva couldn't export that design.",
    });
  }

  const format = formatFor(row.asset_type);
  try {
    // Only the first URL. Canva returns one per page, and a
    // multi-page design isn't something this flow creates — a design
    // here is one image or one video.
    const fileRes = await fetch(status.urls[0]);
    if (!fileRes.ok) throw new Error(`download returned ${fileRes.status}`);
    const bytes = Buffer.from(await fileRes.arrayBuffer());

    const service = createServiceClient();
    const path = `canva/${user.id}/${row.id}.${format}`;
    const { error: uploadError } = await service.storage
      .from("ad-creatives")
      .upload(path, bytes, { contentType: MIME_BY_FORMAT[format], upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrl } = service.storage.from("ad-creatives").getPublicUrl(path);

    // Written only after the bytes are safely in Storage, so a row can
    // never claim "ready" while pointing at nothing.
    await supabase
      .from("canva_designs")
      .update({ exported_asset_url: publicUrl.publicUrl, status: "ready" })
      .eq("id", row.id);

    return NextResponse.json({ status: "ready", url: publicUrl.publicUrl });
  } catch (err: any) {
    console.error("[canva] export copy failed:", err?.message);
    await supabase.from("canva_designs").update({ status: "failed" }).eq("id", row.id);
    return NextResponse.json({ status: "failed", error: "The design exported but couldn't be saved into Hawlai." });
  }
}
