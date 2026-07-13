import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Fetches an external product image server-side and returns it as a
// base64 data URI — the Launch Ad flow needs the photo as base64
// (same as a manual upload), and fetching a Shopify/WooCommerce CDN
// image directly from the browser can hit CORS restrictions.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");
  if (!imageUrl) return NextResponse.json({ error: "url is required" }, { status: 400 });

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Image fetch returned ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    const base64 = `data:${contentType};base64,${buffer.toString("base64")}`;
    return NextResponse.json({ base64 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
