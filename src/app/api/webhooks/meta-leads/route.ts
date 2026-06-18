import { createServiceClient } from "@/lib/supabase/service";
import { qualifyLead } from "@/lib/ai-engine";
import { NextResponse } from "next/server";

/**
 * Meta Lead Ads Webhook
 * ---------------------
 * Receives new customer leads from Meta (Facebook/Instagram) Lead Ads
 * and inserts them into the `leads` table tagged with source = "meta_ads_paid".
 *
 * SETUP REQUIRED (do these before this works end-to-end):
 * 1. Set env vars in Vercel: SUPABASE_SERVICE_ROLE_KEY, META_WEBHOOK_VERIFY_TOKEN
 * 2. In Meta Developer Console, register this URL as the webhook callback:
 *      https://<your-vercel-domain>/api/webhooks/meta-leads
 * 3. Meta will call GET first to verify the webhook (handled below).
 * 4. Meta sends a lightweight notification on lead creation — this code
 *    assumes you've already resolved that into full lead field data
 *    (name/phone/etc.) via the Meta Graph API "leadgen" lookup. If you're
 *    using a no-code bridge (Zapier/Make/Pabbly) instead of raw Meta API,
 *    point that bridge's outgoing webhook at this same URL with a JSON
 *    body matching the shape in parseIncomingLead() below.
 *
 * IMPORTANT: dealership_id must be passed in the request — typically via
 * the ad's tracked "form_id" or a custom field mapped to a dealership in
 * your own lookup table. For now this expects it directly in the payload;
 * tighten this once you have a form_id -> dealership_id mapping table.
 */

interface IncomingMetaLead {
  dealership_id: string;
  full_name: string;
  phone_number: string;
  email?: string | null;
  vehicle_interest?: string | null;
  budget?: number | null;
}

function parseIncomingLead(body: any): IncomingMetaLead | null {
  if (!body?.dealership_id || !body?.full_name || !body?.phone_number) {
    return null;
  }
  return {
    dealership_id: body.dealership_id,
    full_name: body.full_name,
    phone_number: body.phone_number,
    email: body.email ?? null,
    vehicle_interest: body.vehicle_interest ?? null,
    budget: body.budget ? Number(body.budget) : null,
  };
}

// Meta calls GET once to verify webhook ownership when you first register the URL.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === expectedToken) {
    return new NextResponse(challenge, { status: 200 });
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

  const parsed = parseIncomingLead(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Missing required fields: dealership_id, full_name, phone_number" },
      { status: 400 }
    );
  }

  // Score the lead. NOTE: ai-engine's qualifyLead() was designed for
  // "replace my old car" leads (purchase_year/budget). Fresh ad leads
  // won't have purchase_year, so this will score lower than CSV leads
  // by default — budget is the main signal available here. Revisit
  // scoring weights once real ad-lead data comes in.
  const qualification = qualifyLead({
    purchaseYear: null,
    budget: parsed.budget ?? null,
    phone: parsed.phone_number,
  });

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("leads")
    .insert({
      dealership_id: parsed.dealership_id,
      name: parsed.full_name,
      phone: parsed.phone_number,
      email: parsed.email,
      vehicle: parsed.vehicle_interest,
      budget: parsed.budget,
      source: "meta_ads_paid",
      ai_score: qualification.score,
      lead_temperature: qualification.temperature,
      status: "ready_to_call",
      qualification_reason: qualification.reason,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // TODO: trigger Vapi outbound call here so the lead gets called
  // within ~60 seconds of arriving, e.g.:
  // await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/calls/trigger`, {
  //   method: "POST",
  //   body: JSON.stringify({ lead_id: data.id }),
  // });

  return NextResponse.json({ success: true, lead: data });
}
