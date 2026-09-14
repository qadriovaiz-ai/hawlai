// What happened to an email after Resend accepted it — delivered,
// delayed, bounced, marked as spam, failed, suppressed — recorded on the
// send, acted on, and told to the owner.
//
// WHY: a promo Hawlai reported as sent never reached the inbox, and
// nothing in the app could say whether it was delivered or rejected — the
// webhook recorded only opens and clicks, and accepted any request
// without checking it came from Resend.
//
// No secret is ever copied by hand. Hawlai registers its own webhook
// through the Resend API (ensureResendWebhook, run daily) and reads the
// signing secret back from the same API when verifying — held in memory,
// never stored in the database or the repo.
//
// A forged "bounced" event would unsubscribe a real customer, so events
// are only acted on after the signature checks out.

import { Resend } from "resend";
import { siteUrl, suppressEmail } from "@/lib/email/consent";
import { emitNotification } from "@/lib/notifications/emit";

export const WEBHOOK_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
  "email.opened",
  "email.clicked",
] as const;

export function webhookEndpoint(): string {
  return `${siteUrl()}/api/webhooks/resend`;
}

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

async function findWebhook(resend: Resend): Promise<{ id: string; events: string[] | null } | null> {
  const { data, error } = await resend.webhooks.list();
  if (error) throw new Error(error.message);
  const hook = (data?.data ?? []).find((w: any) => w.endpoint === webhookEndpoint());
  return hook ? { id: hook.id, events: hook.events } : null;
}

/** Makes sure Resend sends Hawlai every delivery event. Creates the webhook, or adds missing events to it. */
export async function ensureResendWebhook(): Promise<{ status: "created" | "updated" | "ok"; id: string } | { error: string }> {
  const resend = client();
  if (!resend) return { error: "RESEND_API_KEY isn't set" };
  try {
    const existing = await findWebhook(resend);
    if (!existing) {
      const { data, error } = await resend.webhooks.create({ endpoint: webhookEndpoint(), events: [...WEBHOOK_EVENTS] });
      if (error || !data) return { error: `couldn't create the Resend webhook: ${error?.message ?? "no response"}` };
      cachedSecret = null;
      return { status: "created", id: data.id };
    }
    const missing = WEBHOOK_EVENTS.filter((e) => !(existing.events ?? []).includes(e));
    if (missing.length) {
      const { error } = await resend.webhooks.update(existing.id, { events: [...WEBHOOK_EVENTS], status: "enabled" });
      if (error) return { error: `couldn't update the Resend webhook: ${error.message}` };
      return { status: "updated", id: existing.id };
    }
    return { status: "ok", id: existing.id };
  } catch (err: any) {
    return { error: `couldn't read Resend webhooks: ${err.message}` };
  }
}

let cachedSecret: string | null = null;

async function signingSecret(refresh: boolean): Promise<string | null> {
  if (cachedSecret && !refresh) return cachedSecret;
  const resend = client();
  if (!resend) return null;
  const hook = await findWebhook(resend);
  if (!hook) return null;
  const { data, error } = await resend.webhooks.get(hook.id);
  if (error || !data?.signing_secret) return null;
  cachedSecret = data.signing_secret;
  return cachedSecret;
}

/** Test hook: forget the cached secret. */
export function resetWebhookSecretCache() {
  cachedSecret = null;
}

/**
 * The event, if it really came from Resend; null if it didn't (or can't
 * be checked). A failed check re-reads the secret once, in case it was
 * rotated since it was cached.
 */
export async function verifyResendEvent(rawBody: string, headers: Headers): Promise<any | null> {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signature = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return null;
  const resend = client();
  if (!resend) return null;

  for (const refresh of [false, true]) {
    let secret: string | null;
    try {
      secret = await signingSecret(refresh);
    } catch {
      return null;
    }
    if (!secret) return null;
    try {
      return resend.webhooks.verify({ payload: rawBody, headers: { id, timestamp, signature }, webhookSecret: secret });
    } catch {
      // try once more with a fresh secret
    }
  }
  return null;
}

const RANK: Record<string, number> = { sent: 1, delayed: 2, delivered: 3, bounced: 10, complained: 10, failed: 10, suppressed: 10 };
const STATUS_FOR: Record<string, string> = {
  "email.sent": "sent",
  "email.delivery_delayed": "delayed",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

/**
 * Records a verified event on the send it belongs to, and acts on it:
 *  - a permanent bounce, a spam complaint or a Resend suppression takes
 *    the address off the business's marketing list (and marks the lead
 *    do-not-contact) — sending again would hurt the business's reputation
 *    and ignore the recipient;
 *  - anything that means the email didn't arrive tells the owner.
 * A late "sent" never overwrites "delivered", and nothing overwrites a
 * bounce, complaint, failure or suppression.
 */
export async function applyResendEvent(service: any, event: any): Promise<{ handled: boolean; reason?: string }> {
  const type = String(event?.type ?? "");
  const messageId = event?.data?.email_id as string | undefined;
  if (!messageId) return { handled: false, reason: "no email id" };

  const { data: send, error } = await service
    .from("email_sends")
    .select("id, dealership_id, to_email, subject, delivery_status, open_count, click_count")
    .eq("resend_message_id", messageId)
    .maybeSingle();
  if (error) throw new Error(`couldn't read the send: ${error.message}`);
  if (!send) return { handled: false, reason: "not a Hawlai send" };

  const now = new Date().toISOString();
  if (type === "email.opened") {
    await service.from("email_sends").update({ opened: true, open_count: (send.open_count ?? 0) + 1, last_event_at: now }).eq("id", send.id);
    return { handled: true };
  }
  if (type === "email.clicked") {
    await service.from("email_sends").update({ clicked: true, click_count: (send.click_count ?? 0) + 1, last_event_at: now }).eq("id", send.id);
    return { handled: true };
  }

  const status = STATUS_FOR[type];
  if (!status) return { handled: false, reason: `ignored ${type}` };

  const problem =
    type === "email.bounced" ? event.data?.bounce?.message ?? "bounced"
    : type === "email.failed" ? event.data?.failed?.reason ?? "failed"
    : type === "email.suppressed" ? event.data?.suppressed?.message ?? "suppressed by Resend"
    : type === "email.complained" ? "the recipient marked it as spam"
    : null;

  if ((RANK[status] ?? 0) >= (RANK[send.delivery_status] ?? 0)) {
    const { error: updateError } = await service
      .from("email_sends")
      .update({
        delivery_status: status,
        last_event_at: now,
        ...(problem ? { delivery_error: String(problem).slice(0, 500) } : {}),
        ...(status === "delivered" ? { delivered_at: event.created_at ?? now } : {}),
      })
      .eq("id", send.id);
    if (updateError) throw new Error(`couldn't record the delivery status: ${updateError.message}`);
  }

  const to = String(send.to_email ?? event.data?.to?.[0] ?? "");
  const permanentBounce = type === "email.bounced" && /permanent|hard/i.test(String(event.data?.bounce?.type ?? ""));
  if (to && (permanentBounce || type === "email.complained" || type === "email.suppressed")) {
    const result = await suppressEmail(service, send.dealership_id, to, type === "email.complained" ? "complained" : "bounced", `resend:${type}`);
    if (!result.ok) throw new Error(`couldn't add ${to} to the unsubscribe list: ${result.error}`);
  }

  if (problem) {
    const what =
      type === "email.complained" ? `${to} marked your email "${send.subject}" as spam`
      : type === "email.bounced" ? `Your email "${send.subject}" to ${to} bounced`
      : type === "email.suppressed" ? `Your email "${send.subject}" to ${to} wasn't sent — the address is blocked`
      : `Your email "${send.subject}" to ${to} failed`;
    const followUp =
      permanentBounce || type === "email.complained" || type === "email.suppressed"
        ? " Hawlai won't send marketing email to this address again."
        : type === "email.bounced"
          ? " This looks temporary — it may go through if sent again later."
          : "";
    await emitNotification(service, {
      dealershipId: send.dealership_id,
      kind: "email_delivery_problem",
      title: what,
      body: `${String(problem).slice(0, 200)}.${followUp}`,
      href: "/dashboard/email",
      dedupeKey: `email_problem:${messageId}:${type}`,
    });
  }
  return { handled: true };
}
