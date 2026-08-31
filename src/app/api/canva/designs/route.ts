import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/canva/client";
import { createDesign, uploadAsset } from "@/lib/canva/designs";

// Design history for the signed-in user.
//
// Uses the session client, NOT the service-role client: canva_designs
// is protected by RLS (auth.uid() = user_id, migration 158), and going
// through the session client means that policy is doing the filtering.
// A service-role query would bypass RLS and leave correctness resting
// on remembering the .eq("user_id", ...) — exactly the kind of filter
// that gets dropped during a later refactor and silently leaks every
// user's designs.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("canva_designs")
    .select("id, canva_design_id, title, asset_type, exported_asset_url, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[canva] design history query failed:", error.message);
    return NextResponse.json({ error: "Couldn't load your designs." }, { status: 500 });
  }

  return NextResponse.json({ designs: data ?? [] });
}

// Creates a design in Canva and returns the link to edit it.
//
// The caller opens that link in a NEW TAB. Canva cannot be iframed —
// canva.com sends X-Frame-Options: SAMEORIGIN, so a browser refuses to
// render it inside Hawlai regardless of any account tier. The tab
// hand-off is Canva's supported pattern, not a workaround.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = await getValidAccessToken(supabase, user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Connect Canva first.", needsConnection: true }, { status: 400 });
  }

  const { title, width, height, assetType, sourceImageUrl } = await request.json();

  const w = Number(width) || 1080;
  const h = Number(height) || 1080;
  // Canva's own limits, checked here so an out-of-range size comes back
  // as a sentence rather than a raw API error the dealer can't read.
  if (w < 40 || h < 40 || w > 8000 || h > 8000) {
    return NextResponse.json({ error: "Each side must be between 40 and 8000 pixels." }, { status: 400 });
  }
  if (w * h > 25_000_000) {
    return NextResponse.json({ error: "That canvas is too large — width x height must be under 25 million pixels." }, { status: 400 });
  }
  if (assetType !== "image" && assetType !== "video") {
    return NextResponse.json({ error: "Pick either image or video." }, { status: 400 });
  }

  const safeTitle = typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : "Untitled design";

  try {
    let assetId: string | undefined;

    // Optional: start from an image already in Hawlai. Fetched
    // server-side and pushed to Canva, so the user never has to
    // download and re-upload their own asset.
    if (typeof sourceImageUrl === "string" && sourceImageUrl) {
      // Only our own storage — this URL comes from the browser, and
      // fetching arbitrary attacker-supplied URLs from the server is
      // an SSRF hole regardless of what we do with the bytes after.
      const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;
      let parsed: URL;
      try {
        parsed = new URL(sourceImageUrl);
      } catch {
        return NextResponse.json({ error: "That image link isn't valid." }, { status: 400 });
      }
      if (parsed.protocol !== "https:" || parsed.host !== supabaseHost) {
        return NextResponse.json({ error: "You can only start from an image already stored in Hawlai." }, { status: 400 });
      }

      const imgRes = await fetch(parsed.toString());
      if (!imgRes.ok) return NextResponse.json({ error: "Couldn't read that image." }, { status: 400 });
      assetId = await uploadAsset(accessToken, Buffer.from(await imgRes.arrayBuffer()), safeTitle);
    }

    const created = await createDesign(accessToken, { title: safeTitle, width: w, height: h, assetId });

    // Row written BEFORE the user leaves for Canva. Its id becomes the
    // correlation_state on the edit link, which is how the return trip
    // is matched back to this record — and it means a design is never
    // stranded in Canva with no trace here if the user closes the tab.
    const { data: row, error } = await supabase
      .from("canva_designs")
      .insert({
        user_id: user.id,
        canva_design_id: created.designId,
        title: safeTitle,
        asset_type: assetType,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    // correlation_state is capped at 50 characters by Canva; a uuid is
    // 36, so the row id fits directly with no lookup table.
    const editUrl = `${created.editUrl}${created.editUrl.includes("?") ? "&" : "?"}correlation_state=${row.id}`;

    return NextResponse.json({ id: row.id, designId: created.designId, editUrl });
  } catch (err: any) {
    console.error("[canva] design creation failed:", err?.message);
    return NextResponse.json({ error: err?.message ?? "Couldn't create that design." }, { status: 502 });
  }
}
