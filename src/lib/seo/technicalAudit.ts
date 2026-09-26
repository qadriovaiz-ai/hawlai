// What is technically wrong with this business's own site
// (Brain, Phase 1c).
//
// Hawlai BUILDS these sites, so the pages are in the database and there
// is nothing to crawl. Every check below reads stored rows, runs in
// code, and costs nothing — which is why this can run every day for
// every business without a budget conversation.
//
// THE SHAPE THE VISION ASKED FOR: not a list of raw errors. Each finding
// says what is wrong, what it costs, how urgent it is and what to do —
// "Problem → Impact → Priority → Fix". A small business owner cannot act
// on "missing canonical".
//
// DELIBERATELY NOT HERE: anything needing a real crawl (Core Web Vitals,
// redirect chains, robots.txt, indexing status). Those need a live fetch
// or Search Console, which is Phase 4. Saying "your Core Web Vitals are
// fine" without measuring them would be the kind of confident nonsense
// this whole project keeps refusing to ship.

export type Priority = "high" | "medium" | "low";

export type Finding = {
  code: string;
  problem: string;
  impact: string;
  fix: string;
  priority: Priority;
  /** Which pages, by slug. Empty when it is about the site as a whole. */
  where: string[];
};

export type AuditPage = {
  slug: string;
  title?: string | null;
  meta_description?: string | null;
  page_type?: string | null;
  sections?: unknown;
  og_image_url?: string | null;
};

export type AuditInput = {
  published: boolean;
  pages: AuditPage[];
};

export type SiteAudit = {
  findings: Finding[];
  pagesChecked: number;
  /** Counted facts about the site, for the signal and the card. */
  stats: { pages: number; withoutDescription: number; withoutHeading: number; brokenLinks: number; imagesWithoutAlt: number };
};

const MIN_WORDS = 50;
const MIN_DESCRIPTION = 50;
const MAX_DESCRIPTION = 160;

type Block = Record<string, any>;

function walk(node: unknown, visit: (b: Block) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!node || typeof node !== "object") return;
  const b = node as Block;
  visit(b);
  walk(b.children, visit);
}

/** Everything a reader would actually read on the page. */
export function pageText(sections: unknown): string {
  const parts: string[] = [];
  walk(sections, (b) => {
    if (!b.props || typeof b.props !== "object") return;
    for (const [key, v] of Object.entries(b.props)) {
      if (typeof v === "string" && v.trim() && ["text", "html", "label", "alt"].includes(key)) parts.push(v.trim());
    }
  });
  return parts.join(" ");
}

function headings(sections: unknown): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  walk(sections, (b) => {
    if (b.type === "heading" && typeof b.props?.text === "string" && b.props.text.trim()) {
      out.push({ level: Number(b.props.level) || 2, text: b.props.text.trim() });
    }
  });
  return out;
}

function internalLinks(sections: unknown): string[] {
  const out: string[] = [];
  walk(sections, (b) => {
    const href = b.props?.href;
    if (typeof href !== "string" || !href.trim()) return;
    const h = href.trim();
    // External links, anchors and mailto/tel are somebody else's problem.
    if (/^(https?:|mailto:|tel:|#)/i.test(h)) return;
    out.push(h);
  });
  return out;
}

function imagesMissingAlt(sections: unknown): number {
  let n = 0;
  walk(sections, (b) => {
    if (b.type === "image" && b.props?.url && !String(b.props?.alt ?? "").trim()) n += 1;
  });
  return n;
}

/**
 * Routes the storefront serves that are not rows in website_pages.
 *
 * A link to a product, the cart or the checkout is perfectly good and
 * would otherwise be reported as broken, because those pages are built
 * from the catalogue rather than stored as pages. Telling an owner their
 * working Buy button is broken is worse than missing a real one.
 */
export function isCatalogueRoute(href: string): boolean {
  const path = href.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "");
  const parts = path.split("/");
  return parts.includes("products") || parts.includes("cart") || parts.includes("checkout");
}

/** A link's target page slug, as the renderer resolves it. */
export function targetSlug(href: string): string {
  const path = href.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "");
  if (!path) return "home";
  const parts = path.split("/");
  // "/site/{slug}" on its own is the home page; "/site/{slug}/{page}" is
  // that page. Written out by hand, these are common in older content.
  if (parts[0] === "site") return parts.length >= 3 ? parts[2] || "home" : "home";
  return parts[parts.length - 1];
}

export function auditSite(input: AuditInput): SiteAudit {
  const pages = input.pages ?? [];
  const slugs = new Set(pages.map((p) => p.slug));
  const findings: Finding[] = [];
  const add = (f: Finding) => {
    if (f.where.length > 0 || f.code === "not_published" || f.code === "no_faq") findings.push(f);
  };

  const noDescription: string[] = [];
  const shortDescription: string[] = [];
  const longDescription: string[] = [];
  const noHeading: string[] = [];
  const manyH1: string[] = [];
  const thin: string[] = [];
  const brokenOn: string[] = [];
  const noAltOn: string[] = [];
  let brokenLinks = 0;
  let imagesWithoutAlt = 0;

  const titleSeen = new Map<string, string[]>();
  const descriptionSeen = new Map<string, string[]>();

  for (const page of pages) {
    const text = pageText(page.sections);
    const words = text.split(/\s+/).filter(Boolean).length;
    const hs = headings(page.sections);
    const h1s = hs.filter((h) => h.level === 1);

    const description = String(page.meta_description ?? "").trim();
    if (!description) noDescription.push(page.slug);
    else if (description.length < MIN_DESCRIPTION) shortDescription.push(page.slug);
    else if (description.length > MAX_DESCRIPTION) longDescription.push(page.slug);

    if (hs.length === 0) noHeading.push(page.slug);
    if (h1s.length > 1) manyH1.push(page.slug);
    if (words < MIN_WORDS) thin.push(page.slug);

    const broken = internalLinks(page.sections).filter((h) => !isCatalogueRoute(h) && !slugs.has(targetSlug(h)));
    if (broken.length) {
      brokenOn.push(page.slug);
      brokenLinks += broken.length;
    }

    const noAlt = imagesMissingAlt(page.sections);
    if (noAlt) {
      noAltOn.push(page.slug);
      imagesWithoutAlt += noAlt;
    }

    const title = String(page.title ?? "").trim().toLowerCase();
    if (title) titleSeen.set(title, [...(titleSeen.get(title) ?? []), page.slug]);
    if (description) descriptionSeen.set(description.toLowerCase(), [...(descriptionSeen.get(description.toLowerCase()) ?? []), page.slug]);
  }

  if (!input.published) {
    findings.push({
      code: "not_published",
      problem: "The site isn't published yet.",
      impact: "Nobody can reach it and no search engine can see it, so everything else here is waiting on this.",
      fix: "Publish it from the Website page.",
      priority: "high",
      where: [],
    });
  }

  add({
    code: "broken_internal_link",
    problem: "Some buttons point at pages that don't exist.",
    impact: "A customer who taps one lands on nothing — this is the failure most likely to lose a sale outright.",
    fix: "Open each page below and repoint the button, or create the page it expects.",
    priority: "high",
    where: brokenOn,
  });

  add({
    code: "no_description",
    problem: "Pages with no meta description.",
    impact: "Search engines write their own snippet from whatever text they find, so the first thing a searcher reads isn't yours.",
    fix: "Add a one-sentence description of what the page is for, in the page's settings.",
    priority: "high",
    where: noDescription,
  });

  add({
    code: "no_heading",
    problem: "Pages with no heading at all.",
    impact: "Search engines and AI answer engines use the heading to work out what a page is about. Without one they guess.",
    fix: "Add a heading that says plainly what the page offers.",
    priority: "high",
    where: noHeading,
  });

  add({
    code: "thin_content",
    problem: `Pages with fewer than ${MIN_WORDS} words.`,
    impact: "There isn't enough on the page to rank for anything, or for an AI answer to quote.",
    fix: "Say what it is, who it's for, what it costs, and what happens next.",
    priority: "medium",
    where: thin,
  });

  add({
    code: "duplicate_title",
    problem: "More than one page shares the same title.",
    impact: "Search engines can't tell which one to show, so they often show neither.",
    fix: "Give each page a title naming what that page specifically is.",
    priority: "medium",
    where: Array.from(titleSeen.values()).filter((s) => s.length > 1).flat(),
  });

  add({
    code: "duplicate_description",
    problem: "More than one page shares the same meta description.",
    impact: "The same sentence under every result tells a searcher nothing about which to click.",
    fix: "Write each page its own.",
    priority: "low",
    where: Array.from(descriptionSeen.values()).filter((s) => s.length > 1).flat(),
  });

  add({
    code: "description_length",
    problem: `Meta descriptions shorter than ${MIN_DESCRIPTION} or longer than ${MAX_DESCRIPTION} characters.`,
    impact: "Short ones waste the space; long ones get cut off mid-sentence in the result.",
    fix: `Aim for one clear sentence between ${MIN_DESCRIPTION} and ${MAX_DESCRIPTION} characters.`,
    priority: "low",
    where: [...shortDescription, ...longDescription],
  });

  add({
    code: "multiple_h1",
    problem: "Pages with more than one top-level heading.",
    impact: "It splits what the page appears to be about.",
    fix: "Keep one top-level heading and make the rest sub-headings.",
    priority: "low",
    where: manyH1,
  });

  add({
    code: "image_no_alt",
    problem: "Images with no alt text.",
    impact: "Search engines can't read a picture, and neither can a customer using a screen reader.",
    fix: "Describe what each picture shows, in a few words.",
    priority: "low",
    where: noAltOn,
  });

  if (pages.length > 0 && !pages.some((p) => p.page_type === "faq" || /faq|questions/i.test(p.slug))) {
    findings.push({
      code: "no_faq",
      problem: "There's no FAQ page.",
      impact: "A question-and-answer page is the format AI assistants quote from most readily — this is the cheapest way to start being named in answers.",
      fix: "Add a page answering the questions customers actually ask: price, how long it takes, what's included.",
      priority: "medium",
      where: [],
    });
  }

  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.priority] - order[b.priority]);

  return {
    findings,
    pagesChecked: pages.length,
    stats: {
      pages: pages.length,
      withoutDescription: noDescription.length,
      withoutHeading: noHeading.length,
      brokenLinks,
      imagesWithoutAlt,
    },
  };
}
