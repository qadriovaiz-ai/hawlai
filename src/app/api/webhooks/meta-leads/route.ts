import { createServiceClient } from "@/lib/supabase/service";
import { qualifyLead } from "@/lib/ai-engine";
import { NextResponse } from "next/server";
import { verifyMetaSignature, describeRejection } from "@/lib/webhooks/metaSignature";
import { sendSlackNotification } from "@/lib/agents/slackAgent";
import { handleAutoReplyEntry } from "@/lib/webhooks/autoReplyHandler";
import { triggerVapiCall } from "@/lib/agents/vapiCallAgent";
import { emitNotification } from "@/lib/notifications/emit";
import { recordFirstTouchpoint } from "@/lib/agents/touchpointAgent";

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
  // Read the RAW body, not request.json(). The signature is computed
  // over the exact bytes Meta sent; parsing and re-serialising changes
  // them and the digest will never match.
  const rawBody = await request.text();

  // This IS the authentication for this route. Webhook paths are
  // excluded from the auth middleware because Meta has no Hawlai
  // session, so there is no second layer behind this check. Without
  // it, anyone who learns the URL can insert fabricated leads AND
  // trigger handleAutoReplyEntry below, making the product send
  // messages on a dealer's behalf.
  //
  // Fails CLOSED, including when FACEBOOK_APP_SECRET is unset. An
  // unverifiable payload is not trustworthy just because the server is
  // misconfigured — and the log line for that case says explicitly
  // that leads will not arrive until it is set.
  const signature = verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"));
  if (!signature.valid) {
    console.error("[meta-leads]", describeRejection(signature));
    // 401 with no detail. A rejection must not tell an unauthenticated
    // caller anything about why, or it becomes an oracle.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Was JSON.stringify(body) — the entire payload, which carries lead
  // names, phone numbers and email addresses, into the platform logs
  // on every delivery. Reduced to the shape needed to debug routing.
  // Adjacent to this fix rather than part of it, and called out in the
  // commit rather than slipped in.
  console.log("[meta-leads] verified POST:", { entries: body?.entry?.length ?? 0 });

  const entries = body?.entry ?? [];
  const results = [];

  const supabase = createServiceClient();

  for (const entry of entries) {
    // DM/comment auto-reply — separate concern from leadgen below, but
    // has to live on this same URL since Meta only allows one Callback
    // URL per Page product. No-ops if the dealer hasn't enabled either
    // toggle or this entry has no messaging/feed payload.
    await handleAutoReplyEntry(entry, supabase);

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

        // Dedupe: same phone number for this dealership within the
        // last 30 days is almost certainly the same person re-submitting
        // the same or a different ad — skip instead of cluttering the
        // pipeline with duplicates.
        if (phone) {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const { data: existingLead } = await supabase
            .from("leads")
            .select("id")
            .eq("dealership_id", dealershipId)
            .eq("phone", phone)
            .gte("created_at", thirtyDaysAgo)
            .maybeSingle();
          if (existingLead) {
            // P2 27a-i — merge instead of silently dropping: a repeat
            // submission often carries fresher info (a different
            // vehicle interest, a budget not given the first time)
            // that was previously lost entirely. Doesn't touch status
            // (never regress a lead that's already progressed in the
            // pipeline) and doesn't re-fire the new-lead side effects
            // below (touchpoint, hot-lead alert, auto-call) — those
            // already ran for the original submission.
            await supabase.from("leads").update({
              name, email, vehicle, budget,
              ai_score: qualification.score, lead_temperature: qualification.temperature, qualification_reason: qualification.reason,
              meta_campaign_id: metaCampaignId, meta_ad_id: metaAdId,
            }).eq("id", existingLead.id);
            console.log("[meta-leads] Merged duplicate lead for phone:", phone);
            continue;
          }
        }

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

        if (data) {
          await recordFirstTouchpoint(supabase, { leadId: data.id, dealershipId, source: "meta_ads_paid" });
        }

        // Notify Slack for hot leads only — not every lead, to avoid
        // noise; only if the dealer has connected a webhook.
        let dealershipInfo: { slack_webhook_url?: string | null; dealership_name?: string | null; auto_call_new_leads?: boolean } | null = null;
        if (data) {
          const { data: fetched } = await supabase
            .from("dealerships").select("slack_webhook_url, dealership_name, auto_call_new_leads").eq("id", dealershipId).single();
          dealershipInfo = fetched;
        }

        if (data && qualification.temperature === "hot" && dealershipInfo?.slack_webhook_url) {
          await sendSlackNotification(
            dealershipInfo.slack_webhook_url,
            `🔥 New *Hot* lead for ${dealershipInfo.dealership_name}: *${name}* (${phone})${vehicle ? ` — interested in ${vehicle}` : ""}. Check it out in Hawlai's Call Queue.`
          );
        }

        // In-app record of the same signal. Previously the hot-lead
        // alert existed only as a Slack ping, so a business without
        // Slack connected got no notification at all — and even with
        // it, nothing was visible inside the product.
        if (data && qualification.temperature === "hot") {
          await emitNotification(supabase, {
            dealershipId,
            kind: "hot_lead",
            title: `New hot lead: ${name}`,
            body: vehicle ? `Interested in ${vehicle}` : (phone ?? null),
            href: `/dashboard/leads/${data.id}`,
            dedupeKey: `hot_lead:${data.id}`,
          });
        }

        // Opt-in automatic AI calling — off by default. Best-effort:
        // a failed/misconfigured call trigger should never take down
        // lead capture itself, so errors are logged and swallowed
        // rather than affecting the webhook's success response.
        if (data && phone && dealershipInfo?.auto_call_new_leads) {
          triggerVapiCall(supabase, { id: data.id, name, phone, dealership_id: dealershipId }).catch((err) =>
            console.error("[meta-leads] Auto-call trigger failed:", err.message)
          );
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
