import { NextResponse } from "next/server";
import { listVideoModels } from "@/lib/videoModels";

export async function GET() {
  return NextResponse.json({ models: listVideoModels() });
}
