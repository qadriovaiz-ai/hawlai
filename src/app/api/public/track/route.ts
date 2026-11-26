import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { ownedPieceId } from "@/lib/attribution/pieces";
import { createClient } from "@/lib/supabase/server";
import { visitPath } from "@/lib/utils";
import { resolvePublicSite } from "@/lib/publicSite";

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

// `form_start` added 13 Nov 2026 (V1): there was a form_submit and
// nothing for a form begun and abandoned, so the commonest way a
// visitor shows intent and then leaves was invisible.
// `chat_message` added 13 Nov 2026 (V4c): `chat_open` fired once when
// the widget opened and nothing after it, so a visitor who opened the
// chat and left was indistinguishable from one who asked six
// questions. The event carries no message text — only that a turn
// happened.
const VALID_EVENTS = ["view", "click", "chat_open", "chat_message", "form_submit", "form_start", "whatsapp_click", "popup_shown"];

export async function POST(request: Request) {
  const { slug, eventType, path, xPct, yPct, variant, visitorId, utm_source, utm_medium, utm_campaign, consentGranted, contentPieceId, internal: internalFlag } = await request.json();
  if (!slug || !VALID_EVENTS.includes(eventType)) {
    return NextResponse.json({ error: "Invalid tracking event" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // A slug is a landing page OR a Website Builder site, and the
  // fallback between them now lives in one place (lib/publicSite) —
  // this route and /api/public/leads had each written it out by hand.
  const site = await resolvePublicSite(supabase, slug);
  const dealershipId = site?.dealershipId;

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

  // A REFUSED INSERT USED TO SAY NOTHING, and on 26 November 2026 that
  // cost a day. `with_a_path` read 0 across 163 rows, and the first
  // question — is the column missing in production, or has no visit
  // happened since it was added — could not be answered from anything
  // this route produced, because the result of this insert was never
  // captured. A missing column makes PostgREST refuse the WHOLE row, so
  // the failure mode is every page event silently dropped.
  //
  // THIS IS THE USAGE-LOG BUG'S EXACT SHAPE. That one recorded almost
  // nothing for ninety days behind a missing policy and an unchecked
  // error, and was found by looking rather than by an alarm. logUsage.ts
  // answered it the same way this does.
  //
  // IT STILL RETURNS ok. Tracking must never break the page — that rule
  // is older than this fix and is not being traded away. The log line is
  // the whole change: the row is still lost, but not in silence.
  const { error: trackError } = await supabase.from("page_events").insert({
    is_internal: internal,
    // THE PAGE, RE-SANITISED HERE — V1. visitPath also runs in the
    // browser, but that one is a convenience and this one is the
    // guarantee: a caller that posts "/thanks?email=x@y.com" directly
    // must not be able to store it. Migration 228's last verify query
    // is a count of rows containing "?" and expects zero, always.
    path: visitPath(typeof path === "string" ? path : null),
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

  // THE CODE IS WHAT NAMES THE CAUSE: 42703 / PGRST204 is a column this
  // route writes and production does not have, which means a migration
  // was committed and never run. Anything else is a row lost for its own
  // reason. Both are worth a line; only one is worth a migration.
  if (trackError) {
    console.error(
      `[public/track] page_events insert refused (${trackError.code ?? "no code"}): ${trackError.message}`
    );
  }

  return NextResponse.json({ ok: true });
}
