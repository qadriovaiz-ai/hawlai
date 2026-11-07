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
  /**
   * When the owner (or Hawlai, with approval) last changed this page.
   *
   * Optional, and a page without it is NOT called stale: the column is
   * read from the database, and "the audit could not see a date" is a
   * different fact from "nobody has touched this in a year".
   */
  updated_at?: string | null;
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

/**
 * How long a shared passage must be before sharing it is a finding.
 *
 * G1 of docs/AUDIT-GROWTH-LOOP.md. Short repeated lines are not
 * duplicate content — "Get in touch", an address, a tagline under every
 * heading — they are a site having a voice. Twenty-five words is a
 * paragraph, and a paragraph that appears on two pages is the thing
 * search engines actually discount.
 *
 * Too low a number here would flag every well-built site, and a finding
 * that fires against work the owner has already done teaches them to
 * ignore findings — the same reasoning that fixed `no_faq`.
 */
const MIN_DUPLICATE_WORDS = 25;

/**
 * How long a page may go untouched before it is worth mentioning.
 *
 * TWELVE MONTHS, DELIBERATELY CONSERVATIVE. A page that has not changed
 * is not automatically wrong — most of what a small business says about
 * itself is still true a year later — so this is a low-priority hint
 * that something may have gone out of date, not a fault. A six-month
 * threshold would fire on almost every page of almost every site, which
 * is the same as firing on none.
 */
const STALE_DAYS = 365;

/**
 * The block types that hold prose.
 *
 * `text` is a paragraph; `faq_item`'s `html` is an answer. Both are the
 * kind of passage a search engine discounts when it appears twice. A
 * heading, a button, an image's alt text and a product grid are not.
 */
const PROSE_BLOCKS = ["text", "faq_item"];

import { isLegalPage } from "./pageKinds";
import { TEXT_PROPS } from "@/lib/pages/provenance";

type Block = Record<string, any>;

function walk(node: unknown, visit: (b: Block) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!node || typeof node !== "object") return;
  const b = node as Block;
  visit(b);
  walk(b.children, visit);
}

/**
 * The props that hold words, and nothing else.
 *
 * SOURCED FROM provenance.ts, not re-typed. That file's own comment says
 * "the same four everywhere" and it imports nothing on purpose, so it is
 * the right place for the one declaration. `alt` is added here because
 * this reader answers "what can a visitor or a crawler see on this
 * page", and alt text is read aloud and indexed — while provenance
 * answers "which props did the OWNER write", where it does not belong.
 */
export const READABLE_PROPS: readonly string[] = [...TEXT_PROPS, "alt"];

/**
 * Every word a visitor or a crawler can read on the page.
 *
 * ONE READER, AND THE THIRD VERSION OF IT. The history is worth keeping
 * because each attempt failed in a different direction:
 *
 *  1. Originally this read text/html/label/alt — and MISSED `heading`,
 *     which is where `faq`, `faq_item`, `product_grid` and the contact
 *     block keep their words. A page whose only mention of its city was
 *     a section heading read as never mentioning it (found 7 Nov 2026
 *     while building G5). Note that heading BLOCKS were always covered:
 *     their words live in `props.text`. It is the heading PROP on other
 *     blocks that fell through.
 *  2. The first fix was a second function that read EVERY string prop.
 *     That is worse, and in both directions at once: `href`, `url`,
 *     `align`, `background` and `style` are machine values, so a thin
 *     page with fifty buttons would pass the word count, and a slug
 *     like "/candles-in-a-city" would answer "yes, the page says the
 *     city" when no reader ever sees it.
 *  3. So: a DECLARED list, complete, in one place, with
 *     tests/blockPropsClassified.test.ts failing the suite when the
 *     registry gains a prop that is in neither list. The lesson was
 *     never "read everything" — it was that an inclusion list nobody
 *     checks goes stale silently.
 *
 * THE WORD COUNT MOVED when `heading` was added, and that is the point:
 * a page with a 60-word heading section was never thin, and an FAQ whose
 * questions were not counted was being measured on half its words.
 */
export function pageText(sections: unknown): string {
  const parts: string[] = [];
  walk(sections, (b) => {
    if (!b.props || typeof b.props !== "object") return;
    for (const [key, v] of Object.entries(b.props)) {
      if (typeof v === "string" && v.trim() && READABLE_PROPS.includes(key)) parts.push(v.trim());
    }
  });
  return parts.join(" ");
}

/**
 * Whether this page states a question and answers it.
 *
 * A PAGE, NOT A PAGE TYPE. The `no_faq` finding below used to look only
 * at `page_type` and the slug, so a business that put an FAQ block on
 * its home page — which is what A2 made possible, and what the SEO
 * toolkit itself recommends — was still told every day that it has no
 * FAQ. A finding that fires against work the owner has already done
 * teaches them to ignore findings.
 */
function hasFaqBlock(sections: unknown): boolean {
  let found = false;
  walk(sections, (b) => {
    if (b?.type === "faq_item" && String(b.props?.heading ?? "").trim() && String(b.props?.html ?? "").trim()) found = true;
  });
  return found;
}

/**
 * The substantial passages on a page, normalised for comparison.
 *
 * ONE PASSAGE PER TEXT BLOCK, not per sentence: a shared sentence
 * inside two different paragraphs is a coincidence, while a shared
 * paragraph is a copy. Normalised so that whitespace, case and
 * punctuation differences do not hide one — a passage pasted between
 * pages is rarely re-typed identically.
 */
export function longPassages(sections: unknown, minWords = MIN_DUPLICATE_WORDS): string[] {
  const out: string[] = [];
  walk(sections, (b) => {
    if (!b.props || typeof b.props !== "object") return;
    // READ BY BLOCK TYPE, NOT BY PROP NAME, and a test found why: the
    // `heading` block holds its words on a prop called `text`, while the
    // `text` block holds its prose on one called `html`. Keying on the
    // prop name therefore cannot tell a long heading from a paragraph —
    // and a heading is not what duplicate body content means.
    //
    // These are the two block types in the registry that hold prose: a
    // paragraph, and an FAQ answer. A new one has to be added here
    // deliberately, which is the right amount of friction for a check
    // that decides whether a page is discounted.
    if (!PROSE_BLOCKS.includes(String(b.type ?? ""))) return;
    for (const [key, v] of Object.entries(b.props)) {
      if (typeof v !== "string" || key !== "html") continue;
      const normalised = v
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalised) continue;
      if (normalised.split(" ").length < minWords) continue;
      out.push(normalised);
    }
  });
  return out;
}

/**
 * How many days ago this page was last changed, or null.
 *
 * NULL FOR AN UNREADABLE DATE, never a large number. "The audit could
 * not see a date" and "nobody has touched this in a year" are different
 * facts, and only one of them is the owner's problem.
 */
export function daysSinceChange(updatedAt: string | null | undefined, now = Date.now()): number | null {
  const raw = String(updatedAt ?? "").trim();
  if (!raw) return null;
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return null;
  const days = Math.floor((now - at) / 86400000);
  // A date in the future is a clock problem, not a stale page.
  return days < 0 ? null : days;
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
  // G1. A passage, to the pages it appears on.
  const passageSeen = new Map<string, string[]>();
  const stale: string[] = [];

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

    // G1 — DUPLICATE BODY TEXT, and LEGAL PAGES ARE EXEMPT.
    //
    // A privacy policy and a terms page share standard wording with
    // every other business's, and nothing penalises them for it. More to
    // the point: a sentence is never removed from one on Hawlai's
    // initiative (lib/seo/pageKinds.ts records why), so flagging it
    // would be a finding with no action behind it.
    if (!isLegalPage(page)) {
      for (const passage of longPassages(page.sections)) {
        const seen = passageSeen.get(passage) ?? [];
        if (!seen.includes(page.slug)) seen.push(page.slug);
        passageSeen.set(passage, seen);
      }

      // G1 — A PAGE NOBODY HAS TOUCHED. Legal pages again: last year's
      // privacy policy is not out of date for being last year's.
      const age = daysSinceChange(page.updated_at);
      if (age !== null && age >= STALE_DAYS) stale.push(page.slug);
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

  add({
    code: "duplicate_body",
    problem: "The same paragraph appears on more than one page.",
    impact: "Search engines pick one of the pages and discount the rest, so the others stop competing for anything.",
    fix: "Keep the paragraph on the page it belongs to and write the others from what makes each page different.",
    priority: "medium",
    where: [...passageSeen.values()].filter((slugs) => slugs.length > 1).flat().filter((slug, i, all) => all.indexOf(slug) === i),
  });

  add({
    code: "stale_content",
    problem: `Pages not changed in over ${Math.round(STALE_DAYS / 30)} months.`,
    impact: "Prices, timings and what you offer move on; a page that hasn't been read in a year is the one most likely to be wrong.",
    fix: "Read it once and change anything that is no longer true. If it is all still true, it needs nothing.",
    priority: "low",
    where: stale,
  });

  if (pages.length > 0 && !pages.some((p) => p.page_type === "faq" || /faq|questions/i.test(p.slug) || hasFaqBlock(p.sections))) {
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
