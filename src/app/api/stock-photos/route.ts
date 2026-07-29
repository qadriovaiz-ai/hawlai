import { NextResponse } from "next/server";

// Free stock photos via Pexels — used inside the Canvas Editor's
// "Stock Photo" panel. Requires PEXELS_API_KEY (free, no cost —
// pexels.com/api, generous rate limits, no billing required at all,
// unlike Unsplash which needs app review for production use).
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q");
  if (!query) return NextResponse.json({ error: "Missing search query" }, { status: 400 });

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Stock photos aren't connected yet — add PEXELS_API_KEY to enable this." }, { status: 400 });

  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) throw new Error(`Pexels returned ${res.status}`);
    const data = await res.json();
    const photos = (data.photos ?? []).map((p: any) => ({
      id: String(p.id),
      thumb: p.src.medium,
      full: p.src.large2x ?? p.src.original,
    }));
    return NextResponse.json({ photos });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Stock photo search failed" }, { status: 502 });
  }
}
