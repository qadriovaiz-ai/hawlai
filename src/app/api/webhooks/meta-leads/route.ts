import { createServiceClient } from "@/lib/supabase/service";
import { qualifyLead } from "@/lib/ai-engine";
import { NextResponse } from "next/server";

async function fetchLeadFromMeta(leadgenId: string) {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("META_PAGE_ACCESS_TOKEN not set");
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

  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const leadgenId = change?.value?.leadgen_id;
      if (!leadgenId) continue;
      try {
        const metaLead = await fetchLeadFromMeta(leadgenId);
        const fields = parseFieldData(metaLead.field_data ?? []);
        console.log("[meta-leads] Lead fetched:", { leadgenId, fields });

        const name = fields["full_name"] ?? fields["name"] ?? "Unknown";
        const phone = fields["phone_number"] ?? fields["phone"] ?? "";
        const email = fields["email"] ?? null;
        const vehicle = fields["vehicle_type"] ?? fields["car_model"] ?? null;
        const budget = fields["budget"] ? Number(fields["budget"]) : null;

        const dealershipId = process.env.META_DEFAULT_DEALERSHIP_ID;
        if (!dealershipId) {
          console.error("[meta-leads] META_DEFAULT_DEALERSHIP_ID not set");
          continue;
        }

        const qualification = qualifyLead({
          purchaseYear: null,
          budget,
          phone,
        });

        const supabase = createServiceClient();
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
