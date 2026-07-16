import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { handleAutoReplyEntry } from "@/lib/webhooks/autoReplyHandler";

// Kept as a standalone endpoint in case a separate Callback URL is
// ever configured for this specifically, but in practice Meta only
// allows ONE Callback URL per "Page" product — so the same logic
// (handleAutoReplyEntry) also runs from /api/webhooks/meta-leads,
// which is the URL actually registered in the Meta App dashboard
// alongside leadgen. This route is safe to leave unconfigured.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && token && token === expectedToken) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createServiceClient();
  for (const entry of body?.entry ?? []) {
    await handleAutoReplyEntry(entry, supabase);
  }

  return NextResponse.json({ success: true });
}
