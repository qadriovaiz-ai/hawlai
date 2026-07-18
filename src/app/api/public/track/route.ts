import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

const VALID_EVENTS = ["view", "click", "chat_open", "form_submit", "whatsapp_click", "popup_shown"];

export async function POST(request: Request) {
  const { slug, eventType, xPct, yPct, variant } = await request.json();
  if (!slug || !VALID_EVENTS.includes(eventType)) {
    return NextResponse.json({ error: "Invalid tracking event" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: page } = await supabase.from("landing_pages").select("dealership_id").eq("slug", slug).eq("published", true).maybeSingle();
  if (!page) return NextResponse.json({ ok: true }); // fail silently — tracking should never break the page

  await supabase.from("page_events").insert({
    dealership_id: page.dealership_id,
    event_type: eventType,
    x_pct: typeof xPct === "number" ? xPct : null,
    y_pct: typeof yPct === "number" ? yPct : null,
    variant: typeof variant === "string" ? variant : null,
  });

  return NextResponse.json({ ok: true });
}
