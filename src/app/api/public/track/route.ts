import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { ownedPieceId } from "@/lib/attribution/pieces";
import { createClient } from "@/lib/supabase/server";

/**
 * Whether the caller is signed in as the owner or active staff of this
 * business — read from their own session, never from the request body.
 *
 * Never throws: a visitor with no session is the normal case, and a
 * failure here must not stop a page tracking its visit.
 */
async function isOwnerSession(dealershipId: string): Promise<boolean> {
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return false;
    const { data: profile } = await session.from("profiles").select("dealership_id").eq("id", user.id).maybeSingle();
    if (profile?.dealership_id === dealershipId) return true;
    const { data: member } = await session
      .from("team_members").select("id").eq("user_id", user.id).eq("dealership_id", dealershipId).eq("status", "active").maybeSingle();
    return Boolean(member);
  } catch {
    return false;
  }
}

const VALID_EVENTS = ["view", "click", "chat_open", "form_submit", "whatsapp_click", "popup_shown"];

export async function POST(request: Request) {
  const { slug, eventType, xPct, yPct, variant, visitorId, utm_source, utm_medium, utm_campaign, consentGranted, contentPieceId, internal: internalFlag } = await request.json();
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

  // Which piece of content sent this visitor (?hw=, Phase 0). Anyone can
  // put any id in a URL, and this route runs on the service client with
  // RLS off, so the id is only kept once it is confirmed to be a piece
  // belonging to THIS business — otherwise one business's page could
  // write rows against another's content.
  const piece = await ownedPieceId(supabase, dealershipId, contentPieceId);

  // IS THIS THE OWNER LOOKING AT THEIR OWN SITE?
  //
  // Visits went 28 → 31 while the owner tested his shop. At that volume
  // his own clicks are most of the signal, and Diagnosis reads these
  // rows for the funnel and the conversion rate.
  //
  // Two signals, deliberately different in kind. The session is the
  // authority: the storefront is on the same domain as the dashboard, so
  // a logged-in owner arrives with their cookie and the server can ask
  // whether they belong to THIS business. The hw=owner flag is the
  // fallback for a browser whose session has lapsed, and trusting a
  // client there is safe in a way it usually is not — the only thing it
  // can do is exclude the sender's own visit from the sender's own
  // counts, which costs an attacker nothing to gain.
  //
  // Neither catches the owner on a different device or a private window.
  // That limit is stated on the dashboard rather than papered over.
  const internal = (await isOwnerSession(dealershipId)) || internalFlag === true;

  await supabase.from("page_events").insert({
    is_internal: internal,
    marketing_piece_id: piece,
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
