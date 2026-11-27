// Every integration a business can connect, in one list — H1 of
// docs/AUDIT-INTEGRATION-HEALTH.md, 27 November 2026.
//
// WHY A LIST: the same failure was found twice in two days, in two
// unrelated integrations, because each card computed its own "connected"
// from whatever it stored. A list that every card reads — pinned by
// tests/integrationHealthRegistry.test.ts — is what stops a third.
//
// EACH ENTRY SAYS HOW IT IS CHECKED, and "not yet" is an allowed answer
// only with a reason. Nothing here may claim a check that does not run.

import { hasToken } from "@/lib/crypto/oauthSecrets";
import type { Health } from "@/lib/integrations/healthState";

type Row = Record<string, any> | null | undefined;

export type IntegrationEntry = {
  key: string;
  label: string;
  /** Is anything stored for it? "Linked" — never by itself "Connected". */
  linked: (row: Row) => boolean;
  /**
   * The columns `linked` and `incomplete` read from `dealerships`, so the
   * Integrations page selects exactly what the registry needs. NEVER a
   * token column for display: presence is answered without decrypting.
   */
  columns: readonly string[];
  /**
   * How it is checked. Exactly one of these is set, and the test holds
   * that:
   *   probe          a read-only call exists (H2 onward)
   *   noProbeYet     none yet, and which piece of the plan adds it
   *   unverifiable   none is possible without a side effect, and why
   */
  probe?: true;
  noProbeYet?: string;
  unverifiable?: string;
  /**
   * Stored evidence that the connection works but is NOT SET UP to do
   * its job — read without any call. Null when it is set up.
   */
  incomplete?: (row: Row) => string | null;
  /** Where its card is. Everything is on the Integrations page unless named. */
  shownOn?: string;
};

/** Webhook subscription, recorded by the connect callbacks (migration 227). */
function notSubscribed(at: unknown, error: unknown, what: string): string | null {
  if (at) return null;
  if (error) return `${what} can't receive messages: ${String(error)}`;
  return `${what} was never set up to receive messages — reconnect it once to fix this`;
}

export const INTEGRATIONS: readonly IntegrationEntry[] = [
  {
    key: "meta_page",
    label: "Facebook Page",
    columns: ["fb_page_id", "fb_webhook_subscribed_at", "fb_webhook_error"],
    linked: (r) => !!r?.fb_page_id,
    incomplete: (r) => notSubscribed(r?.fb_webhook_subscribed_at, r?.fb_webhook_error, "The Facebook Page"),
    noProbeYet: "H2 — page read and subscribed_apps",
  },
  {
    key: "instagram",
    label: "Instagram",
    columns: ["instagram_business_id", "ig_webhook_subscribed_at", "ig_webhook_error"],
    linked: (r) => !!r?.instagram_business_id,
    incomplete: (r) => notSubscribed(r?.ig_webhook_subscribed_at, r?.ig_webhook_error, "Instagram"),
    noProbeYet: "H2 — /me and /me/subscribed_apps",
  },
  {
    key: "search_console",
    label: "Google Search Console",
    columns: ["search_console_email", "search_console_site_url"],
    linked: (r) => !!r?.search_console_email,
    incomplete: (r) =>
      r?.search_console_site_url ? null : "No verified property matched this business yet — add your site in Search Console, then press Reconnect",
    noProbeYet: "H2 — the sites list, with the selected property in it",
  },
  { key: "gmail", label: "Gmail", columns: ["gmail_email"], linked: (r) => !!r?.gmail_email, noProbeYet: "H4 — the Gmail profile read" },
  { key: "google_ads", label: "Google Ads", columns: ["google_ads_email"], linked: (r) => !!r?.google_ads_email, noProbeYet: "H4 — listAccessibleCustomers" },
  { key: "youtube", label: "YouTube", columns: ["youtube_channel_title"], linked: (r) => !!r?.youtube_channel_title, noProbeYet: "H4 — channels?mine=true" },
  {
    key: "pinterest",
    label: "Pinterest Ads",
    columns: ["pinterest_access_token", "pinterest_access_token_encrypted"],
    linked: (r) => hasToken(r, "pinterest"),
    noProbeYet: "H4 — the current-user read",
  },
  {
    key: "snapchat",
    label: "Snapchat Ads",
    columns: ["snapchat_access_token", "snapchat_access_token_encrypted"],
    linked: (r) => hasToken(r, "snapchat"),
    noProbeYet: "H4 — the current-user read",
  },
  {
    key: "linkedin",
    label: "LinkedIn Ads",
    columns: ["linkedin_access_token", "linkedin_access_token_encrypted"],
    linked: (r) => hasToken(r, "linkedin"),
    noProbeYet: "H4 — the current-user read",
  },
  {
    key: "whatsapp_owner",
    label: "WhatsApp (your number)",
    columns: ["owner_whatsapp_verified"],
    linked: (r) => !!r?.owner_whatsapp_verified,
    unverifiable:
      "This is your own verified phone number, not a login, so there is nothing to check without messaging you. The WhatsApp line itself is Hawlai's.",
  },
  { key: "wordpress", label: "WordPress", columns: ["wordpress_site_url"], linked: (r) => !!r?.wordpress_site_url, noProbeYet: "H3 — users/me with the app password" },
  {
    key: "slack",
    label: "Slack",
    columns: ["slack_webhook_url"],
    linked: (r) => !!r?.slack_webhook_url,
    unverifiable: "Any call to a Slack incoming webhook posts a message in your channel, so it can only be checked by its real use.",
  },
  // Shopify and WooCommerce are checked LIVE by their own status routes
  // (H0), which record what they find here.
  { key: "shopify", label: "Shopify", columns: ["shopify_store_url"], linked: (r) => !!r?.shopify_store_url, probe: true },
  { key: "woocommerce", label: "WooCommerce", columns: ["woocommerce_store_url"], linked: (r) => !!r?.woocommerce_store_url, probe: true },
  { key: "google_reviews", label: "Google Reviews", columns: ["google_place_id"], linked: (r) => !!r?.google_place_id, noProbeYet: "H4 — the reviews snapshot's own read" },
  // NOT READ ON THE INTEGRATIONS PAGE. Their cards live elsewhere, and
  // their columns are not safe to name in the page's select: Razorpay's
  // Connect columns arrive with migration 178, which is not confirmed in
  // production, and a select naming a missing column fails the whole
  // page. `linked` throws rather than answering, so nothing can read
  // "false" here as "not connected". Their own screens get the shared
  // status in H3 and H4.
  {
    key: "razorpay",
    label: "Razorpay",
    columns: [],
    linked: () => {
      throw new Error("razorpay is shown on Website Builder → Payments, not read from the Integrations page");
    },
    noProbeYet: "H3 — the /v1/orders read used at save",
    shownOn: "Website Builder → Payments",
  },
  {
    key: "canva",
    label: "Canva",
    columns: [],
    linked: () => {
      throw new Error("canva is shown on Design & Edit, not read from the Integrations page");
    },
    noProbeYet: "H4 — users/me",
    shownOn: "Design & Edit",
  },
];

export function integration(key: string): IntegrationEntry {
  const found = INTEGRATIONS.find((i) => i.key === key);
  if (!found) throw new Error(`"${key}" is not in the integrations registry`);
  return found;
}

/** Every `dealerships` column the Integrations page needs, de-duplicated. */
export function registryColumns(): string[] {
  return [...new Set(INTEGRATIONS.flatMap((i) => i.columns))];
}

export type StoredHealth = { state: Health["state"]; reason: string | null; checked_at: string | null };

/**
 * What the owner is shown for one integration — the ONE rule.
 *
 *   not linked                    → null (the card shows its Connect button)
 *   a stored BROKEN result        → that result, whatever else is true
 *   stored evidence it is not set
 *   up to work (no subscription,
 *   no property)                  → incomplete, with the reason
 *   a stored WORKING result       → working
 *   no way to check it            → unverifiable, with the reason
 *   nothing checked yet           → unchecked — NEVER "Connected"
 */
export function statusFor(
  key: string,
  row: Row,
  stored: StoredHealth | null | undefined
): (Health & { checkedAt: string | null }) | null {
  const entry = integration(key);
  if (!entry.linked(row)) return null;
  const checkedAt = stored?.checked_at ?? null;
  if (stored && (stored.state === "needs_reconnect" || stored.state === "not_responding")) {
    return { state: stored.state, reason: stored.reason, checkedAt };
  }
  const notSetUp = entry.incomplete?.(row) ?? null;
  if (notSetUp) return { state: "incomplete", reason: notSetUp, checkedAt };
  if (stored?.state === "working") return { state: "working", reason: null, checkedAt };
  if (entry.unverifiable) return { state: "unverifiable", reason: entry.unverifiable, checkedAt: null };
  return { state: "unchecked", reason: null, checkedAt: null };
}
