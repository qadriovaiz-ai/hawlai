// Dashboard channel mapping and connection detection — restored from
// the harness written with the data layer (commit b5e6ecf).
//
// The assertion worth keeping above all others is the last one in
// "channel breakdown": Google must never appear. Nothing in this
// codebase writes a Google lead source, so a Google bar would sit at
// zero permanently and read as "Google sends you nothing" rather than
// "we don't track it".

import { describe, it, expect } from "vitest";
import { channelBreakdown, readConnections, UNTRACKED_CHANNELS } from "@/lib/dashboard/dashboardData";

describe("channel breakdown", () => {
  const sources = [
    "instagram", "dm_instagram",
    "whatsapp", "dm_whatsapp",
    "meta_ads_paid",
    "website", "shopify",
    null, "weird_new_source",
  ];
  const counts = channelBreakdown(sources);
  const get = (channel: string) => counts.find((c) => c.channel === channel)?.leads ?? 0;

  it("merges Instagram source variants", () => {
    expect(get("Instagram")).toBe(2);
  });

  it("merges WhatsApp source variants", () => {
    expect(get("WhatsApp")).toBe(2);
  });

  it("merges storefront sources under Website", () => {
    expect(get("Website")).toBe(2);
  });

  it("keeps paid ads as its own bucket", () => {
    // Not split into Facebook vs Instagram: Meta reports paid
    // placements together and we don't store which delivered.
    expect(get("Paid ads")).toBe(1);
  });

  it("groups nulls and unknown sources under Other rather than dropping them", () => {
    expect(get("Other")).toBe(2);
  });

  it("preserves the total — no lead is lost in mapping", () => {
    expect(counts.reduce((s, c) => s + c.leads, 0)).toBe(sources.length);
  });

  it("sorts descending by lead count", () => {
    expect(counts.every((c, i) => i === 0 || counts[i - 1].leads >= c.leads)).toBe(true);
  });

  it("returns an empty list for no input", () => {
    expect(channelBreakdown([])).toHaveLength(0);
  });

  it("NEVER produces a Google bar", () => {
    const wide = channelBreakdown([...sources, "google", "google_ads", "organic_search"]);
    expect(wide.some((c) => c.channel === "Google")).toBe(false);
    // And the gap is recorded rather than silently omitted.
    expect(UNTRACKED_CHANNELS).toContain("Google");
  });
});

describe("connection detection", () => {
  it("reads each channel from its own credential column", () => {
    const c = readConnections({
      fb_page_id: "123",
      fb_ad_account_id: "act_456",
      owner_whatsapp_verified: true,
      google_ads_customer_id: "789",
    });
    expect(c).toEqual({ metaPage: true, metaAds: true, whatsapp: true, googleAds: true });
  });

  it("treats null as not connected", () => {
    expect(readConnections({ fb_ad_account_id: null }).metaAds).toBe(false);
  });

  it("treats an empty string as not connected", () => {
    // A blank credential is the shape a half-finished connect flow
    // leaves behind; truthiness must not read it as connected.
    expect(readConnections({ google_ads_customer_id: "" }).googleAds).toBe(false);
  });

  it("treats a missing dealership row as nothing connected", () => {
    expect(Object.values(readConnections(null)).every((v) => v === false)).toBe(true);
  });

  it("does not infer one channel's state from another", () => {
    const c = readConnections({ fb_page_id: "123" });
    // A connected Page does not mean a connected ad account — the
    // distinction the whole dashboard data layer rests on.
    expect(c.metaPage).toBe(true);
    expect(c.metaAds).toBe(false);
  });
});
