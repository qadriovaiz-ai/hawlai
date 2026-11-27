// "CONNECTED" MEANS A REAL CALL SAID SO — 27 November 2026, H1 of
// docs/AUDIT-INTEGRATION-HEALTH.md.
//
// Found twice in two days: Search Console "Connected" on a token dead for
// 23 days, Instagram "connected" on an invalidated token whose webhook
// was never subscribed. All seventeen integrations decided "connected"
// from a stored value. This file pins the one rule that replaces that,
// and the registry that makes a third integration unable to skip it.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { code } from "./helpers/source";

const notified: any[] = [];
vi.mock("@/lib/notifications/emit", () => ({
  emitNotification: async (_s: any, input: any) => {
    notified.push(input);
  },
}));

import { INTEGRATIONS, statusFor, integration, registryColumns } from "@/lib/integrations/registry";
import { recordHealth, readHealth } from "@/lib/integrations/health";

beforeEach(() => {
  notified.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------------------------------------------------------------------
describe("1. THE ONE RULE: what the owner is shown", () => {
  it("NOT LINKED SHOWS NOTHING — the card offers its Connect button", () => {
    expect(statusFor("gmail", { gmail_email: null }, null)).toBeNull();
  });

  it("LINKED AND NEVER CHECKED IS 'UNCHECKED' — NEVER 'working'", () => {
    expect(statusFor("gmail", { gmail_email: "a@b.c" }, null)).toEqual({ state: "unchecked", reason: null, checkedAt: null });
  });

  it("A STORED REFUSAL IS SHOWN, with the provider's words", () => {
    const s = statusFor("gmail", { gmail_email: "a@b.c" }, { state: "needs_reconnect", reason: "invalid_grant", checked_at: "2026-11-27T00:00:00Z" });
    expect(s).toEqual({ state: "needs_reconnect", reason: "invalid_grant", checkedAt: "2026-11-27T00:00:00Z" });
  });

  it("A STORED SUCCESS IS 'working'", () => {
    expect(statusFor("gmail", { gmail_email: "a@b.c" }, { state: "working", reason: null, checked_at: "t" })?.state).toBe("working");
  });

  it("INSTAGRAM NEVER SUBSCRIBED TO WEBHOOKS IS 'INCOMPLETE' — the exact production case", () => {
    const s = statusFor("instagram", { instagram_business_id: "17841", ig_webhook_subscribed_at: null, ig_webhook_error: null }, null);
    expect(s?.state).toBe("incomplete");
    expect(s?.reason).toMatch(/never set up to receive messages/);
  });

  it("AND A RECORDED SUBSCRIPTION FAILURE SAYS WHAT IT WAS", () => {
    const s = statusFor("instagram", { instagram_business_id: "17841", ig_webhook_error: "(#200) permission denied" }, null);
    expect(s?.reason).toContain("(#200) permission denied");
  });

  it("A WORKING CHECK DOES NOT HIDE A MISSING SUBSCRIPTION — it still can't receive", () => {
    const s = statusFor("meta_page", { fb_page_id: "p1", fb_webhook_subscribed_at: null }, { state: "working", reason: null, checked_at: "t" });
    expect(s?.state).toBe("incomplete");
  });

  it("BUT A REFUSAL OUTRANKS EVERYTHING — the fix is the reconnect", () => {
    const s = statusFor("instagram", { instagram_business_id: "17841" }, { state: "needs_reconnect", reason: "session has been invalidated", checked_at: "t" });
    expect(s?.state).toBe("needs_reconnect");
  });

  it("SEARCH CONSOLE WITH NO PROPERTY IS 'INCOMPLETE'", () => {
    expect(statusFor("search_console", { search_console_email: "a@b.c", search_console_site_url: null }, null)?.state).toBe("incomplete");
    expect(statusFor("search_console", { search_console_email: "a@b.c", search_console_site_url: "sc-domain:x" }, null)?.state).toBe("unchecked");
  });

  it("SLACK AND THE OWNER'S WHATSAPP SAY THEY CANNOT BE CHECKED, and why", () => {
    for (const [key, row] of [["slack", { slack_webhook_url: "https://hooks" }], ["whatsapp_owner", { owner_whatsapp_verified: true }]] as const) {
      const s = statusFor(key, row, null);
      expect(s?.state, key).toBe("unverifiable");
      expect(String(s?.reason).length, key).toBeGreaterThan(20);
    }
  });

  it("AN INTEGRATION SHOWN ELSEWHERE REFUSES TO ANSWER 'linked' rather than saying false", () => {
    expect(() => integration("razorpay").linked({})).toThrow(/Payments/);
    expect(() => integration("canva").linked({})).toThrow(/Design/);
  });
});

// ---------------------------------------------------------------------
describe("2. THE REGISTRY IS COMPLETE AND HONEST", () => {
  it("ALL SEVENTEEN INTEGRATIONS FROM THE AUDIT ARE IN IT", () => {
    expect(INTEGRATIONS.map((i) => i.key).sort()).toEqual(
      [
        "canva", "gmail", "google_ads", "google_reviews", "instagram", "linkedin", "meta_page", "pinterest", "razorpay",
        "search_console", "shopify", "slack", "snapchat", "whatsapp_owner", "woocommerce", "wordpress", "youtube",
      ].sort()
    );
  });

  it("EVERY ENTRY SAYS HOW IT IS CHECKED — exactly one of probe, not-yet-with-a-reason, or impossible-with-a-reason", () => {
    for (const i of INTEGRATIONS) {
      const ways = [i.probe === true, !!i.noProbeYet?.trim(), !!i.unverifiable?.trim()].filter(Boolean);
      expect(ways.length, `${i.key} must name exactly one way it is checked`).toBe(1);
    }
  });

  it("THE PAGE'S COLUMNS COME FROM THE REGISTRY, de-duplicated", () => {
    const cols = registryColumns();
    expect(new Set(cols).size).toBe(cols.length);
    expect(cols).toContain("ig_webhook_subscribed_at");
    expect(cols).toContain("fb_webhook_error");
  });
});

// ---------------------------------------------------------------------
type Prev = { state: string } | null;
function healthDb(opts: { previous?: Prev; readError?: string; writeError?: string }) {
  const writes: any[] = [];
  const client = {
    from: () => {
      const api: any = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: opts.previous ?? null, error: opts.readError ? { message: opts.readError } : null }),
        upsert: async (row: any) => {
          writes.push(row);
          return { error: opts.writeError ? { message: opts.writeError } : null };
        },
      };
      return api;
    },
  };
  return { client, writes };
}

describe("3. RECORDING — AND THE OWNER IS TOLD ONCE, ON THE WAY DOWN", () => {
  const NOW = new Date("2026-11-27T10:00:00Z");

  it("A WORKING RESULT IS STORED WITH last_ok_at, and tells nobody", async () => {
    const db = healthDb({});
    const r = await recordHealth(db.client, "d1", "shopify", { state: "working", reason: null }, NOW);
    expect(r).toEqual({ recorded: true, notified: false });
    expect(db.writes[0]).toMatchObject({ dealership_id: "d1", integration: "shopify", state: "working", reason: null, last_ok_at: NOW.toISOString() });
    expect(notified).toEqual([]);
  });

  it("THE FIRST BREAK TELLS THE OWNER, with the provider's own reason", async () => {
    const db = healthDb({ previous: { state: "working" } });
    const r = await recordHealth(db.client, "d1", "shopify", { state: "needs_reconnect", reason: "Invalid API key or access token" }, NOW);
    expect(r.notified).toBe(true);
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ dealershipId: "d1", kind: "integration_disconnected", href: "/dashboard/settings/integrations" });
    expect(notified[0].title).toBe("Shopify needs reconnecting");
    expect(notified[0].body).toContain("Invalid API key or access token");
    // A broken result does not move "last worked".
    expect(db.writes[0].last_ok_at).toBeUndefined();
  });

  it("ALREADY BROKEN IS ALREADY TOLD — a dead store checked every morning is one message", async () => {
    const db = healthDb({ previous: { state: "needs_reconnect" } });
    expect((await recordHealth(db.client, "d1", "shopify", { state: "not_responding", reason: "503" }, NOW)).notified).toBe(false);
    expect(notified).toEqual([]);
  });

  it("NEVER CHECKED BEFORE AND BROKEN NOW IS TOLD — silence is the expensive mistake", async () => {
    const db = healthDb({ previous: null });
    expect((await recordHealth(db.client, "d1", "woocommerce", { state: "not_responding", reason: "fetch failed" }, NOW)).notified).toBe(true);
  });

  it("A WRITE THAT FAILED NOTIFIES NOBODY — or every page load would send another", async () => {
    // The migration not yet run: the table is not there.
    const db = healthDb({ readError: "relation does not exist", writeError: "relation does not exist" });
    const r = await recordHealth(db.client, "d1", "shopify", { state: "needs_reconnect", reason: "401" }, NOW);
    expect(r).toEqual({ recorded: false, notified: false });
    expect(notified).toEqual([]);
  });

  it("INCOMPLETE OR UNCHECKED IS NOT A DISCONNECTION, and is not sent as one", async () => {
    for (const state of ["incomplete", "unchecked", "unverifiable"] as const) {
      const db = healthDb({ previous: { state: "working" } });
      await recordHealth(db.client, "d1", "instagram", { state, reason: "x" }, NOW);
    }
    expect(notified).toEqual([]);
  });

  it("IT NEVER THROWS INTO THE WORK BESIDE IT", async () => {
    const exploding = { from: () => { throw new Error("boom"); } };
    await expect(recordHealth(exploding, "d1", "shopify", { state: "needs_reconnect", reason: "x" }, NOW)).resolves.toEqual({ recorded: false, notified: false });
  });

  it("AN UNREADABLE STATE IS AN EMPTY MAP — shown as 'not checked yet', never as Connected", async () => {
    const failing = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: "denied" } }) }) }) };
    expect((await readHealth(failing, "d1")).size).toBe(0);
  });
});

// ---------------------------------------------------------------------
// THE GUARD THAT STOPS A THIRD TIME. Read with comments stripped (Rule 8).
const PAGE = "src/app/dashboard/settings/integrations/page.tsx";
const CARDS = [
  "src/components/settings/SearchConsoleActions.tsx",
  "src/components/settings/ConnectWhatsAppCard.tsx",
  "src/components/settings/WordPressConnect.tsx",
  "src/components/settings/SlackConnect.tsx",
  "src/components/settings/InstagramBusinessLoginConnect.tsx",
  "src/components/settings/GoogleReviewsConnect.tsx",
  "src/components/settings/ShopifyConnect.tsx",
  "src/components/settings/WooCommerceConnect.tsx",
];
// Checked LIVE by their own status routes (H0), not read from the page.
const LIVE_ON_THEIR_OWN_CARD = new Set(["shopify", "woocommerce"]);

describe("4. NO CARD DRAWS ITS OWN 'Connected' AGAIN", () => {
  it("EVERY INTEGRATION ON THE PAGE IS SHOWN THROUGH THE REGISTRY", () => {
    const page = code(PAGE);
    for (const i of INTEGRATIONS) {
      if (i.shownOn || LIVE_ON_THEIR_OWN_CARD.has(i.key)) continue;
      expect(page, `${i.key} is on the Integrations page but not shown through statusFor`).toContain(`shown("${i.key}")`);
    }
  });

  it("THE PAGE READS WHAT WAS FOUND, not only what was stored", () => {
    const page = code(PAGE);
    expect(page).toMatch(/await readHealth\(supabase, dealershipId\)/);
    expect(page).toMatch(/statusFor\(key, dealership, stored\.get\(key\)\)/);
  });

  it("NO HAND-DRAWN 'Connected' — on the page or on any card", () => {
    for (const file of [PAGE, ...CARDS]) {
      const src = code(file);
      // An icon followed by the word, or the word as bare JSX text.
      expect(src, file).not.toMatch(/\/>\s*Connected\b/);
      expect(src, file).not.toMatch(/>\s*Connected\b/);
    }
  });

  it("EVERY CARD THAT SHOWS A CONNECTION USES THE SHARED LINE", () => {
    for (const file of CARDS) expect(code(file), file).toContain("<IntegrationHealthLine");
  });

  it("SHOPIFY AND WOOCOMMERCE RECORD WHAT THEIR LIVE CALL FOUND", () => {
    for (const [file, key] of [["src/app/api/integrations/shopify/route.ts", "shopify"], ["src/app/api/integrations/woocommerce/route.ts", "woocommerce"]]) {
      expect(code(file), file).toMatch(new RegExp(`if \\(health\\) await recordHealthAsService\\(dealershipId, "${key}", health\\)`));
    }
  });
});
