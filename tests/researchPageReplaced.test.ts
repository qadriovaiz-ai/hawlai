// The Research page's competitor-ads search is gone (2026-09-19).
//
// It searched Meta's Ad Library API, which returns only political/issue
// ads outside the EU — for an Indian business every search answered
// "Application does not have permission for this action". The ad launcher
// had the same button. Both now show the positioning comparison
// (lib/strategy/positioning): competitors' own words, with links.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { snapshotLines } from "@/components/strategy/CompetitorSnapshot";
import { extractArtifact } from "@/lib/agents/masterBrainV2";

const read = (p: string) => readFileSync(p, "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("the dead Ad Library search is gone", () => {
  it("no route, no client, and nothing in the app calls Meta's ads_archive", () => {
    expect(existsSync("src/app/api/research/competitor-ads/route.ts")).toBe(false);
    expect(existsSync("src/lib/agents/researchAgent.ts")).toBe(false);
    const callers = sourceFiles("src").filter((f) => /ads_archive|research\/competitor-ads|searchCompetitorAds/.test(read(f)));
    expect(callers).toEqual([]);
  });

  it("the Research page is the competitor comparison", () => {
    const page = read("src/app/dashboard/research/page.tsx");
    expect(page).toContain('import PositioningPanel from "@/components/strategy/PositioningPanel"');
    expect(page).toContain("<PositioningPanel />");
    expect(page).not.toMatch(/dealerships are currently advertising/);
  });

  it("the ad launcher shows the latest comparison instead — and runs no searches itself", () => {
    const launcher = read("src/app/dashboard/ads/full-launch/page.tsx");
    expect(launcher).toContain("<CompetitorSnapshot />");
    expect(launcher).not.toMatch(/handleCheckCompetitors|Check what competitors are running/);
    const snapshot = read("src/components/strategy/CompetitorSnapshot.tsx");
    expect(snapshot).toContain('fetch("/api/strategy/positioning")');
    expect(snapshot).not.toMatch(/method:\s*"POST"/);
  });

  it("the Competitor Intelligence card describes what the page now does", () => {
    expect(read("src/components/competitor/CompetitorIntelView.tsx")).toContain("Competitor research — what they say about themselves, and where you can stand out");
  });
});

describe("the snapshot's two lines", () => {
  const rows = [
    { key: "price", label: "Price and value", claimedBy: ["A", "B", "C"], yourFacts: [], standing: "crowded" as const },
    { key: "delivery", label: "Delivery and shipping", claimedBy: ["A", "B"], yourFacts: ["Shipping"], standing: "crowded" as const },
    { key: "materials", label: "Materials and quality", claimedBy: [], yourFacts: ["Materials and suppliers"], standing: "open" as const },
    { key: "gifting", label: "Gifting and occasions", claimedBy: [], yourFacts: [], standing: "open" as const },
    { key: "offers", label: "Offers and discounts", claimedBy: ["A"], yourFacts: ["Offer: DIWALI10"], standing: "contested" as const },
  ];

  it("what everyone says, counted; and only open ground the business has facts for", () => {
    expect(snapshotLines(rows, 4)).toEqual({
      everyone: "Price and value (3 of 4), Delivery and shipping (2 of 4) — say it too and you blend in.",
      yours: "Materials and quality.",
    });
  });

  it("nothing to say when nothing stands out", () => {
    expect(snapshotLines([rows[4]], 4)).toEqual({ everyone: null, yours: null });
  });
});

describe("links that pointed at the old page by mistake", () => {
  it("the chat's market-research card opens the Research Agent, where market research lives", () => {
    const card: any = extractArtifact("research_market", { taskType: "industry_trends" }, { trends: [{ trend: "Soy wax demand", impact: "More buyers ask for it" }] });
    expect(card?.departmentHref).toBe("/dashboard/research-agent");
  });

  it("topic alerts in the activity feed open the Research Agent too", () => {
    expect(read("src/lib/activity/activityFeed.ts")).toContain('topic_alerts: { title: "Checked topics you\'re watching", kind: "research", href: "/dashboard/research-agent" }');
  });
});
