// What is technically wrong with a business's own site (Brain, Phase 1c).
//
// Hawlai builds these sites, so the pages are in the database and there
// is nothing to crawl: every check is pure code over stored rows, which
// is why it can run daily for every business at no cost.
//
// The shape the vision asked for is the part worth protecting — not a
// list of raw errors, but what is wrong, what it costs, how urgent, and
// what to do. "Missing canonical" is not something a candle maker can
// act on.

import { describe, it, expect, vi, beforeEach } from "vitest";

import { auditSite, pageText, targetSlug, isCatalogueRoute, type AuditPage } from "@/lib/seo/technicalAudit";
import { runTechnicalAudit, recordAuditSignals } from "@/lib/seo/runTechnicalAudit";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";
import { GROUPS } from "@/lib/automation/cronGroups";

const heading = (text: string, level = 1) => ({ id: "h", type: "heading", props: { text, level } });
const body = (html: string) => ({ id: "t", type: "text", props: { html } });
const button = (label: string, href: string) => ({ id: "b", type: "button", props: { label, href } });
const image = (url: string, alt?: string) => ({ id: "i", type: "image", props: { url, ...(alt ? { alt } : {}) } });

// Comfortably over the 50-word floor, so a page built from it is
// genuinely clean and the "nothing wrong" test means something.
const LONG =
  "Hand poured soy candles made in small batches in Shahjahanpur. Every candle cures for a full day before it leaves the studio, and we choose fragrances that actually carry across a room rather than fading after ten minutes of burning. The workshop runs for ninety minutes and you take home whatever you pour, whether it is your first candle or your fifth, with everything you need provided on the day.";

function page(over: Partial<AuditPage> = {}): AuditPage {
  return {
    slug: "home",
    title: "Candle by Qaaf",
    meta_description: "Hand-poured soy candles made in small batches in Shahjahanpur, cured for a full day.",
    page_type: "home",
    sections: [heading("Hand-poured soy candles"), body(LONG)],
    ...over,
  };
}

describe("a finding tells the owner what to do about it", () => {
  it("every finding says the problem, what it costs, how urgent and the fix", () => {
    const { findings } = auditSite({ published: true, pages: [page({ meta_description: null })] });
    const f = findings.find((x) => x.code === "no_description")!;
    expect(f.problem).toBeTruthy();
    expect(f.impact).toBeTruthy();
    expect(f.fix).toBeTruthy();
    expect(["high", "medium", "low"]).toContain(f.priority);
    // Plain words, not jargon a candle maker can't act on.
    expect(f.fix).toContain("Add a one-sentence description");
  });

  it("the most urgent come first", () => {
    const { findings } = auditSite({
      published: true,
      pages: [page({ meta_description: null, sections: [body("short"), button("Book", "/nowhere"), image("https://x/y.png")] })],
    });
    const priorities = findings.map((f) => f.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a] - { high: 0, medium: 1, low: 2 }[b])));
    expect(findings[0].priority).toBe("high");
  });
});

describe("the checks themselves", () => {
  it("A BUTTON POINTING NOWHERE is the highest-value find — it loses the sale, not a ranking", () => {
    const { findings, stats } = auditSite({
      published: true,
      pages: [page({ sections: [heading("Home"), body(LONG), button("Book", "/workshop"), button("Shop", "/shop")] }), page({ slug: "shop", page_type: "shop" })],
    });
    const broken = findings.find((f) => f.code === "broken_internal_link")!;
    expect(broken.priority).toBe("high");
    expect(broken.where).toEqual(["home"]);
    expect(stats.brokenLinks).toBe(1);
  });

  it("a link written out in full to a page that exists is not broken", () => {
    const { findings } = auditSite({
      published: true,
      pages: [page({ sections: [heading("Home"), body(LONG), button("Shop", "/site/candle-by-qaaf/shop")] }), page({ slug: "shop" })],
    });
    expect(findings.some((f) => f.code === "broken_internal_link")).toBe(false);
  });

  it("A WORKING BUY BUTTON IS NOT A BROKEN LINK — product, cart and checkout are built from the catalogue, not stored as pages", () => {
    const { findings } = auditSite({
      published: true,
      pages: [page({ sections: [heading("Home"), body(LONG), button("Buy", "/site/candle-by-qaaf/products/p1"), button("Cart", "/cart"), button("Pay", "/checkout")] })],
    });
    expect(findings.some((f) => f.code === "broken_internal_link")).toBe(false);
    expect(isCatalogueRoute("/site/x/products/p1")).toBe(true);
    expect(isCatalogueRoute("/about")).toBe(false);
  });

  it("a link to the site root is the home page, not a missing one", () => {
    expect(targetSlug("/site/candle-by-qaaf")).toBe("home");
    const { findings } = auditSite({
      published: true,
      pages: [page({ sections: [heading("Home"), body(LONG), button("Home", "/site/candle-by-qaaf")] })],
    });
    expect(findings.some((f) => f.code === "broken_internal_link")).toBe(false);
  });

  it("external links, anchors and mailto are left alone", () => {
    const { findings } = auditSite({
      published: true,
      pages: [page({ sections: [heading("Home"), body(LONG), button("Book", "https://calendly.com/x"), button("Write", "mailto:a@b.com"), button("Down", "#more")] })],
    });
    expect(findings.some((f) => f.code === "broken_internal_link")).toBe(false);
  });

  it("missing descriptions, missing headings and thin pages are each named", () => {
    const { findings, stats } = auditSite({
      published: true,
      pages: [page({ slug: "about", meta_description: null, sections: [body("Tiny.")] })],
    });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("no_description");
    expect(codes).toContain("no_heading");
    expect(codes).toContain("thin_content");
    expect(stats).toMatchObject({ withoutDescription: 1, withoutHeading: 1 });
  });

  it("two pages sharing a title or a description are reported", () => {
    const { findings } = auditSite({ published: true, pages: [page(), page({ slug: "about" })] });
    expect(findings.find((f) => f.code === "duplicate_title")!.where.sort()).toEqual(["about", "home"]);
    expect(findings.find((f) => f.code === "duplicate_description")).toBeTruthy();
  });

  it("an unpublished site is said first, because nothing else matters until then", () => {
    const { findings } = auditSite({ published: false, pages: [page()] });
    expect(findings[0].code).toBe("not_published");
    expect(findings[0].priority).toBe("high");
  });

  it("NO FAQ PAGE is flagged as the cheapest way into AI answers", () => {
    const withFaq = auditSite({ published: true, pages: [page(), page({ slug: "faq", page_type: "faq", title: "Questions", meta_description: "Answers to the questions customers ask most about our candles and workshops." })] });
    expect(withFaq.findings.some((f) => f.code === "no_faq")).toBe(false);
    expect(auditSite({ published: true, pages: [page()] }).findings.some((f) => f.code === "no_faq")).toBe(true);
  });

  it("A CLEAN SITE REPORTS NOTHING — no finding is invented to look busy", () => {
    const clean = auditSite({
      published: true,
      pages: [
        page(),
        page({ slug: "faq", page_type: "faq", title: "Questions", meta_description: "Answers to what customers ask most: price, timing, and what is included in a workshop." }),
      ],
    });
    expect(clean.findings).toEqual([]);
  });

  it("nothing measured is nothing claimed: no Core Web Vitals, no indexing verdicts", () => {
    const text = JSON.stringify(auditSite({ published: true, pages: [page({ meta_description: null })] }));
    for (const word of ["Core Web Vitals", "indexed", "crawl budget", "robots.txt", "canonical"]) {
      expect(text).not.toContain(word);
    }
  });
});

describe("reading the page", () => {
  it("pulls the words a visitor reads, and resolves a link's target", () => {
    expect(pageText([heading("Candles"), body("Soy wax"), button("Book", "/x")])).toContain("Candles");
    expect(pageText([heading("Candles"), body("Soy wax")])).toContain("Soy wax");
    expect(targetSlug("/site/candle-by-qaaf/shop")).toBe("shop");
    expect(targetSlug("/shop?ref=1")).toBe("shop");
    expect(targetSlug("/")).toBe("home");
  });
});

// ---- the daily run ---------------------------------------------------------
let tables: Record<string, any[]>;

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let staged: any = null;
    let mode: "select" | "insert" | "update" = "select";
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = () => {
      if (mode === "insert") {
        const row = { id: crypto.randomUUID(), ...staged };
        (tables[table] ??= []).push(row);
        return row;
      }
      if (mode === "update") {
        const t = rows()[0];
        if (t) Object.assign(t, staged);
        return t ?? null;
      }
      return rows()[0] ?? null;
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, in: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (r: any) => ((mode = "insert"), (staged = r), api),
      update: (r: any) => ((mode = "update"), (staged = r), api),
      maybeSingle: async () => ({ data: run(), error: null }),
      single: async () => ({ data: run(), error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: mode === "select" ? rows() : [run()], error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  tables = {
    websites: [{ id: "w1", dealership_id: "d1", published: true }],
    website_pages: [{ website_id: "w1", slug: "home", title: "Candle by Qaaf", meta_description: null, page_type: "home", sections: [heading("Home"), body(LONG), button("Book", "/nowhere")] }],
    business_signals: [],
  };
});

describe("it runs daily, for free", () => {
  it("is registered in the database-only group, not among the AI work", () => {
    expect(GROUPS.signals).toContain("site_audit");
    expect(GROUPS.heavy).not.toContain("site_audit");
    expect(typeof DAILY_RUNNERS.site_audit).toBe("function");
  });

  it("audits the real pages and files what it found as COUNTED signals", async () => {
    const audit = await runTechnicalAudit(db(), "d1");
    expect(audit.findings.some((f) => f.code === "broken_internal_link")).toBe(true);

    const health = tables.business_signals.find((s) => s.topic === "site health")!;
    expect(health).toMatchObject({ source: "seo", confidence: "counted" });
    expect(health.evidence).toMatchObject({ brokenLinks: 1, withoutDescription: 1 });

    const broken = tables.business_signals.find((s) => s.topic === "broken links")!;
    expect(broken.summary).toContain("point at pages that don't exist");
    expect(broken.confidence).toBe("counted");
  });

  it("no Hawlai-built site: it says so and checks nothing, rather than guessing at a site it can't see", async () => {
    tables.websites = [];
    const audit = await runTechnicalAudit(db(), "d1");
    expect(audit.skipped).toBe("no Hawlai-built site");
    expect(tables.business_signals).toHaveLength(0);
  });

  it("a clean site still reports its health, so 'nothing wrong' is visible too", async () => {
    await recordAuditSignals(db(), "d1", auditSite({ published: true, pages: [page(), page({ slug: "faq", page_type: "faq", title: "Q", meta_description: "Answers to what customers ask most: price, timing, and what a workshop includes." })] }));
    expect(tables.business_signals[0].summary).toContain("no high-priority technical problems");
  });
});
