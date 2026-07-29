import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  // Guard against path traversal — only allow the exact filename shape lucide-static uses.
  if (!/^[a-z0-9-]+$/.test(name)) return NextResponse.json({ error: "Invalid icon name" }, { status: 400 });

  try {
    const filePath = path.join(process.cwd(), "node_modules", "lucide-static", "icons", `${name}.svg`);
    const svg = await readFile(filePath, "utf-8");
    const raw = new URL(request.url).searchParams.get("raw");
    if (raw) return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml" } });
    return NextResponse.json({ svg });
  } catch {
    return NextResponse.json({ error: "Icon not found" }, { status: 404 });
  }
}
