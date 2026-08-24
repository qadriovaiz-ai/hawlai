import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

const VALID_EVENTS = ["view", "click", "chat_open", "form_submit", "whatsapp_click", "popup_shown"];

export async function POST(request: Request) {
  const { slug, eventType, xPct, yPct, variant, visitorId, utm_source, utm_medium, utm_campaign, consentGranted } = await request.json();
  if (!slug || !VALID_EVENTS.includes(eventType)) {
    return NextResponse.json({ error: "Invalid tracking event" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: page } = await supabase.from("landing_pages").select("dealership_id").eq("slug", slug).eq("published", true).maybeSingle();

  // Not a quick-launch landing page — check if it's a Website Builder
  // site instead (different slug namespace, same tracking contract).
  // Same fallback /api/public/leads/route.ts already uses.
  let dealershipId = page?.dealership_id;
  if (!dealershipId) {
    const { data: website } = await supabase.from("websites").select("dealership_id").eq("slug", slug).eq("published", true).maybeSingle();
    dealershipId = website?.dealership_id;
  }

  if (!dealershipId) return NextResponse.json({ ok: true }); // fail silently — tracking should never break the page

  await supabase.from("page_events").insert({
    dealership_id: dealershipId,
    event_type: eventType,
    x_pct: typeof xPct === "number" ? xPct : null,
    y_pct: typeof yPct === "number" ? yPct : null,
    variant: typeof variant === "string" ? variant : null,
    visitor_id: typeof visitorId === "string" ? visitorId : null,
    utm_source: typeof utm_source === "string" ? utm_source : null,
    utm_medium: typeof utm_medium === "string" ? utm_medium : null,
    utm_campaign: typeof utm_campaign === "string" ? utm_campaign : null,
    // Records what the visitor had consented to at the moment this
    // event fired (migration 152) — without it, a later withdrawal
    // leaves no way to tell which rows were collected lawfully.
    // Defensively re-derived from whether an identifier is actually
    // present, so a client claiming consent while sending no id can't
    // mark a row as consented.
    consent_granted: consentGranted === true && typeof visitorId === "string",
  });

  return NextResponse.json({ ok: true });
}
