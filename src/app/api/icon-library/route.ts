import { NextResponse } from "next/server";
import iconNodes from "lucide-static/icon-nodes.json";

// Full icon library for the Canvas Editor — 1750+ free, MIT-licensed
// icons (lucide-static, the same set already used for every icon in
// this app's own UI, just exposed here as selectable design
// elements). Not a curated subset — genuinely the whole set, searched
// by name.
const ALL_NAMES = Object.keys(iconNodes);

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.toLowerCase().trim() ?? "";
  const matches = (q ? ALL_NAMES.filter((n) => n.includes(q)) : ALL_NAMES.slice(0, 60)).slice(0, 60);
  return NextResponse.json({ icons: matches });
}
