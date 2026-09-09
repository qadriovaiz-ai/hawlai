// The navigation, as a structure that can be checked.
//
// WHAT IT REPLACES: six sidebar items, one of which ("Business") was a
// hub page holding TWENTY-FOUR flat cards -- orders beside agency
// billing limits and two-factor authentication. Seventeen departments
// with real working pages appeared in NO navigation at all, reachable
// only by typing the URL. Most of the product was built and
// unnavigable, and nothing could have told us: navigation lived in JSX,
// so "is this page reachable" was not a question anything could answer.
//
// It is data now, so these are answerable by running code.

import { describe, it, expect } from "vitest";
import { NAV_TREE, getNavTree, flattenLeaves, tabHref } from "@/lib/navTree";
import { execFileSync } from "child_process";

const leaves = flattenLeaves();

describe("every leaf goes somewhere, exactly once", () => {
  it("has no leaf without a destination", () => {
    for (const l of leaves) expect(l.href, `${l.label} has no href`).toBeTruthy();
  });

  it("lists no destination twice", () => {
    // A duplicate means two sidebar entries fight over the same active
    // highlight and the person cannot tell where they are.
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const l of leaves) {
      if (seen.has(l.href)) dupes.push(`${l.href} (${seen.get(l.href)} and ${l.label})`);
      seen.set(l.href, l.label);
    }
    expect(dupes).toEqual([]);
  });

  it("points only at real dashboard routes or the chat", () => {
    for (const l of leaves) {
      expect(l.href.startsWith("/dashboard/") || l.href === "/chat", `${l.label} -> ${l.href}`).toBe(true);
    }
  });

  it("covers a meaningful amount of the product", () => {
    // Guards against a refactor quietly emptying a section.
    expect(leaves.length).toBeGreaterThan(45);
  });
});

describe("the things that used to be unreachable are reachable", () => {
  const hrefs = leaves.map((l) => l.href);

  it("ORDERS has its own entry, not just a tab nobody can name", () => {
    // The one that started this: three levels deep behind a card whose
    // title said "Website & Products" and mentioned orders only in grey
    // subtitle text.
    expect(hrefs).toContain("/dashboard/website-builder?tab=orders");
  });

  it.each([
    ["Content Marketing", "/dashboard/content-marketing"],
    ["Email Marketing", "/dashboard/email"],
    ["WhatsApp Marketing", "/dashboard/whatsapp"],
    ["SEO", "/dashboard/seo"],
    ["Social Media", "/dashboard/social"],
    ["Paid Ads", "/dashboard/paid-ads"],
    ["Retargeting", "/dashboard/retargeting"],
    ["Influencer Marketing", "/dashboard/influencer-marketing"],
    ["Marketing Strategy", "/dashboard/strategy"],
    ["Growth Advisor", "/dashboard/growth-advisor"],
    ["CRO", "/dashboard/cro"],
    ["Competitor Intel", "/dashboard/competitor-intel"],
    ["Research Agent", "/dashboard/research-agent"],
    ["Business Memory", "/dashboard/business-memory"],
    ["Brand Kit", "/dashboard/brand-building"],
    ["Video Marketing", "/dashboard/video-marketing"],
    ["3D Studio", "/dashboard/3d-studio"],
    ["Design Studio", "/dashboard/graphic-design"],
  ])("%s is navigable", (_label, href) => {
    expect(hrefs).toContain(href);
  });

  it("Insights is in the sidebar, having been in no navigation at all", () => {
    expect(hrefs).toContain("/dashboard/insights?tab=reports");
  });
});

describe("the ?tab= contract the hubs depend on", () => {
  it("builds tab links the way the hubs read them", () => {
    expect(tabHref("/dashboard/marketing", "campaigns")).toBe("/dashboard/marketing?tab=campaigns");
    expect(tabHref("/dashboard/complaints")).toBe("/dashboard/complaints");
  });

  it("every tab leaf names a tab its hub actually has", () => {
    // A sidebar entry pointing at ?tab=orderz would silently land on
    // the hub's first tab, which looks like the link doing nothing.
    const hubs: Record<string, string[]> = {
      "/dashboard/website-builder": ["website", "products", "orders", "domain", "offers", "shipping", "payments"],
      "/dashboard/marketing": ["strategy", "launch", "campaigns", "campaign-groups", "creative", "social", "website"],
      "/dashboard/leads-hub": ["leads", "pipeline", "retention", "queue", "calls", "appointments"],
      "/dashboard/insights": ["reports", "strategy", "analytics", "optimization", "research", "seo"],
    };
    for (const l of leaves) {
      const [path, query] = l.href.split("?");
      if (!query) continue;
      const tab = new URLSearchParams(query).get("tab")!;
      const known = hubs[path];
      if (!known) continue;
      expect(known, `${l.label} -> ?tab=${tab} is not a tab of ${path}`).toContain(tab);
    }
  });

  it("the hubs derive their tab from the URL, not from local state", () => {
    // Seeding useState from the param works on first load and fails on
    // a sidebar click while already on the page: client-side navigation
    // keeps the component mounted, so the initialiser never re-runs and
    // the URL changes while the content does not.
    const hub = execFileSync("git", ["show", "HEAD:src/components/dashboard/HubTabs.tsx"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    expect(hub).not.toMatch(/useState\(\s*\n?\s*tabs\.some/);
    expect(hub).toMatch(/const activeKey = tabs\.some/);
  });
});

describe("gating", () => {
  it("hides Agency for an ordinary account", () => {
    const labels = getNavTree({ isAgency: false }).map((s) => s.label);
    expect(labels).not.toContain("Agency");
  });

  it("shows Agency for an agency account", () => {
    expect(getNavTree({ isAgency: true }).map((s) => s.label)).toContain("Agency");
  });

  it("shows Calling only in calling mode", () => {
    expect(getNavTree({ mode: null }).map((s) => s.label)).not.toContain("Calling");
    expect(getNavTree({ mode: "calling" }).map((s) => s.label)).toContain("Calling");
  });
});

describe("the shape stays browsable", () => {
  it("keeps the top level short enough to scan", () => {
    expect(getNavTree({ isAgency: false }).length).toBeLessThanOrEqual(10);
  });

  it("collapses the big, rarely-browsed groups by default", () => {
    const collapsed = NAV_TREE.filter((s) => s.defaultCollapsed).map((s) => s.label);
    expect(collapsed).toContain("Departments");
    expect(collapsed).toContain("Settings");
  });

  it("never nests more than three levels", () => {
    // Section -> group -> leaf. Deeper than that and the indent stops
    // meaning anything.
    const depthOf = (nodes: any[], d = 1): number =>
      Math.max(...nodes.map((n) => (n.children?.length ? depthOf(n.children, d + 1) : d)));
    expect(depthOf(NAV_TREE)).toBeLessThanOrEqual(3);
  });

  it("gives every section with children at least two of them", () => {
    // A group of one is a leaf wearing a disclosure triangle.
    for (const s of NAV_TREE) {
      if (s.children) expect(s.children.length, `${s.label} has one child`).toBeGreaterThan(1);
    }
  });
});
