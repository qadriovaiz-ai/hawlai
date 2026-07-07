import { createServiceClient } from "@/lib/supabase/service";
import { qualifyLead } from "@/lib/ai-engine";
import { NextResponse } from "next/server";

async function fetchLeadFromMeta(leadgenId: string, token: string) {
  const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? "Failed to fetch lead from Meta");
  }
  return data;
}

function parseFieldData(fieldData: any[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fieldData ?? []) {
    result[field.name] = field.values?.[0] ?? "";
  }
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && token && token === expectedToken) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
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

  console.log("[meta-leads] Incoming POST:", JSON.stringify(body, null, 2));

  const entries = body?.entry ?? [];
  const results = [];

  const supabase = createServiceClient();

  for (const entry of entries) {
    // entry.id is the Facebook Page ID this event came from — use it to
    // find which dealership owns this page, so leads from different
    // dealers' pages land in the right place with the right token.
    const pageId: string | undefined = entry?.id;
    const { data: dealership } = pageId
      ? await supabase.from("dealerships").select("id, fb_page_access_token").eq("fb_page_id", pageId).maybeSingle()
      : { data: null };

    const dealershipId: string | undefined = dealership?.id ?? process.env.META_DEFAULT_DEALERSHIP_ID;
    const pageAccessToken: string | undefined = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;

    if (!dealershipId) {
      console.error("[meta-leads] Could not resolve a dealership for page:", pageId);
      continue;
    }
    if (!pageAccessToken) {
      console.error("[meta-leads] No access token available for dealership:", dealershipId);
      continue;
    }

    for (const change of entry?.changes ?? []) {
      const leadgenId = change?.value?.leadgen_id;
      if (!leadgenId) continue;
      try {
        const metaLead = await fetchLeadFromMeta(leadgenId, pageAccessToken);
        const fields = parseFieldData(metaLead.field_data ?? []);
        console.log("[meta-leads] Lead fetched:", { leadgenId, fields });

        const name = fields["full_name"] ?? fields["name"] ?? "Unknown";
        const phone = fields["phone_number"] ?? fields["phone"] ?? "";
        const email = fields["email"] ?? null;
        const vehicle = fields["vehicle_type"] ?? fields["car_model"] ?? null;
        const budget = fields["budget"] ? Number(fields["budget"]) : null;

        // Which ad/campaign actually generated this lead — needed to
        // compute cost-per-lead per campaign on the Campaigns page.
        const metaCampaignId = change?.value?.campaign_id ?? metaLead.campaign_id ?? null;
        const metaAdId = change?.value?.ad_id ?? metaLead.ad_id ?? null;

        const qualification = qualifyLead({
          purchaseYear: null,
          budget,
          phone,
        });

        const { data, error } = await supabase
          .from("leads")
          .insert({
            dealership_id: dealershipId,
            name,
            phone,
            email,
            vehicle,
            budget,
            source: "meta_ads_paid",
            ai_score: qualification.score,
            lead_temperature: qualification.temperature,
            status: "ready_to_call",
            qualification_reason: qualification.reason,
            meta_campaign_id: metaCampaignId,
            meta_ad_id: metaAdId,
          })
          .select()
          .single();

        if (error) {
          console.error("[meta-leads] Supabase error:", error.message);
          continue;
        }

        console.log("[meta-leads] Lead saved:", data.id);
        results.push(data.id);
      } catch (err: any) {
        console.error("[meta-leads] Error:", leadgenId, err.message);
      }
    }
  }

  return NextResponse.json({ success: true, processed: results.length });
}
