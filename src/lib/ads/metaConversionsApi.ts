// ------------------------------------------------------------------
// Meta Conversions API — retargeting piece 3/7.
// ------------------------------------------------------------------
// Server-to-server conversion reporting. Browser pixels lose roughly
// 20-40% of events to ad blockers, iOS restrictions and network
// failures; the Conversions API doesn't, because it never touches the
// browser. Both paths report the same conversion and Meta
// deduplicates them by a shared event_id.
//
// Fired from applyOrderFulfillment's shared commit point — the same
// place order->lead linking already runs — so it covers BOTH payment
// paths (COD immediately, Razorpay only after signature verification)
// and can never fire for an abandoned or fake payment attempt.
//
// CONSENT (confirmed conservative default, pending CA review): when a
// visitor declined tracking, the event is still reported but WITHOUT
// customer-matching identifiers. Meta can then attribute the sale in
// aggregate without receiving hashed personal data from someone who
// refused. If the CA confirms a completed transaction is its own
// lawful basis, relaxing this is a one-line change here.
//
// UNVERIFIED AGAINST A LIVE PIXEL: built against Meta's documented
// Conversions API. No pixel/token exists in this environment, so
// first real delivery needs checking in Meta Events Manager.
// ------------------------------------------------------------------

import { GRAPH_VERSION } from "@/lib/adEngine";
import { hashEmail, hashPhone } from "@/lib/ads/audienceHashing";

export interface ConversionCustomer {
  email?: string | null;
  phone?: string | null;
  /** Whether this person consented to tracking. Gates identifier sharing, not the event itself. */
  consented: boolean;
}

export interface ConversionEventInput {
  pixelId: string;
  accessToken: string;
  eventName: string;
  /** Shared with the browser pixel so Meta counts one conversion, not two. */
  eventId: string;
  eventTime?: number; // unix seconds; defaults to now
  value?: number;
  currency?: string;
  contentIds?: string[];
  customer: ConversionCustomer;
  sourceUrl?: string | null;
}

export interface ConversionResult {
  success: boolean;
  error?: string;
}

export async function sendConversionEvent(input: ConversionEventInput): Promise<ConversionResult> {
  try {
    // Identifiers are shared ONLY with consent. Meta requires at least
    // one user_data field, so an event without identifiers still
    // carries the (non-identifying) action source — attribution
    // degrades rather than the event being dropped entirely.
    const userData: Record<string, any> = {};
    if (input.customer.consented) {
      const em = hashEmail(input.customer.email);
      const ph = hashPhone(input.customer.phone);
      if (em) userData.em = [em];
      if (ph) userData.ph = [ph];
    }

    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${input.pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: input.accessToken,
        data: [
          {
            event_name: input.eventName,
            event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
            event_id: input.eventId,
            action_source: "website",
            ...(input.sourceUrl ? { event_source_url: input.sourceUrl } : {}),
            user_data: userData,
            custom_data: {
              ...(input.value != null ? { value: input.value } : {}),
              currency: input.currency ?? "INR",
              ...(input.contentIds?.length ? { content_ids: input.contentIds, content_type: "product" } : {}),
            },
          },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok || data?.error) {
      const detail = data?.error?.error_user_msg ?? data?.error?.message ?? `HTTP ${res.status}`;
      return { success: false, error: String(detail).slice(0, 300) };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message?.slice(0, 300) ?? "Conversions API request failed" };
  }
}

/**
 * Sends a conversion and records the outcome.
 *
 * The conversion_events row is what makes failures visible at all —
 * Meta accepts the request and reports match quality asynchronously,
 * so without this a dealer with an expired token would silently lose
 * every server-side conversion. Its unique(dealership, event, event_id)
 * constraint doubles as the idempotency guard: a retried webhook or a
 * double-submit can't send the same purchase twice.
 *
 * Never throws — a reporting failure must not roll back a real order.
 */
export async function sendAndLogConversion(
  service: any,
  dealershipId: string,
  input: ConversionEventInput
): Promise<void> {
  try {
    // Claim the event first. If this insert conflicts, the conversion
    // was already sent and we skip the network call entirely rather
    // than double-reporting.
    const { error: claimError } = await service.from("conversion_events").insert({
      dealership_id: dealershipId,
      event_name: input.eventName,
      event_id: input.eventId,
      value_inr: input.value ?? null,
      status: "sent",
    });
    if (claimError) return; // unique violation = already reported

    const result = await sendConversionEvent(input);
    if (!result.success) {
      await service
        .from("conversion_events")
        .update({ status: "failed", error: result.error ?? "Unknown error" })
        .eq("dealership_id", dealershipId)
        .eq("event_name", input.eventName)
        .eq("event_id", input.eventId);
    }
  } catch (err: any) {
    console.error("[conversions-api] send failed:", err?.message);
  }
}
