// Changing the words on the real homepage.
//
// TWO BUGS THIS REPLACES, both of which reported success.
//
// 1. The tool wrote headline/subheadline/offer_text to the legacy
//    `landing_pages` table and answered "changes are live immediately".
//    /site/{slug} renders website_pages.sections — the block tree — so
//    the change could never appear there, and with no landing_pages row
//    the update matched ZERO rows, which Supabase reports as success
//    with error: null.
//
// 2. Then it only ever edited the HERO: the first heading, the first
//    paragraph and the first button on the page. Asked to rewrite "the
//    Diwali Gifting section below the hero", it rewrote the hero's
//    supporting line instead and still said "✅ Updated your live
//    homepage". A wrong edit reported as the asked-for one is worse
//    than a refusal.
//
// So a section can now be named, and a section that cannot be found is
// an error listing the ones that exist — never a silent edit somewhere
// else. The write itself still happens only on approval
// (src/lib/chat/publishActions.ts).

export type CopyField = "headline" | "subheadline" | "ctaText";
export type CopyChange = { field: CopyField; from: string; to: string };

export type HomepageCopyResult = {
  sections: any;
  changed: CopyChange[];
  /** The section actually edited, for the card to name. */
  sectionHeading: string | null;
  /** Set when a named section could not be found — nothing was changed. */
  sectionNotFound?: true;
  /** Every section heading on the page, so the refusal can list them. */
  available: string[];
};

type Block = Record<string, any>;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The first heading anywhere inside a block. */
function headingOf(node: unknown): string | null {
  let found: string | null = null;
  const walk = (n: unknown): void => {
    if (found || !n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n !== "object") return;
    const b = n as Block;
    if (b.type === "heading" && typeof b.props?.text === "string" && b.props.text.trim()) {
      found = b.props.text.trim();
      return;
    }
    if (typeof b.headline === "string" && b.headline.trim()) {
      found = b.headline.trim();
      return;
    }
    walk(b.children);
  };
  walk(node);
  return found;
}

/** Each top-level section of the page, by its own heading — what the owner sees as "sections". */
export function listSections(sections: unknown): { index: number; heading: string | null }[] {
  if (!Array.isArray(sections)) return [];
  return sections.map((node, index) => ({ index, heading: headingOf(node) }));
}

/** The first heading / paragraph / button inside one subtree. */
function findTargets(node: unknown): { headline?: Block; subheadline?: Block; ctaText?: Block; legacy?: Block } {
  const found: { headline?: Block; subheadline?: Block; ctaText?: Block; legacy?: Block } = {};
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (!n || typeof n !== "object") return;
    const b = n as Block;
    if (b.props && typeof b.props === "object") {
      if (!found.headline && typeof b.props.text === "string" && b.type === "heading") found.headline = b;
      if (!found.subheadline && typeof b.props.html === "string") found.subheadline = b;
      if (!found.ctaText && typeof b.props.label === "string") found.ctaText = b;
    } else if (!found.legacy && (typeof b.headline === "string" || typeof b.subheadline === "string" || typeof b.ctaText === "string")) {
      // A page from before the block builder — flat fields on the block.
      found.legacy = b;
    }
    walk(b.children);
  };
  walk(node);
  return found;
}

/**
 * The section the person named.
 *
 * Matched on the section's own heading, loosely enough that "the Diwali
 * Gifting section" finds "Light up your Diwali gifting", and strictly
 * enough that it never falls back to a different section: no match means
 * no edit.
 */
function matchSection(sections: any[], name: string): { node: any; heading: string | null } | null {
  const wanted = normalise(name).replace(/\b(the|section|block|part|area|below|above|hero)\b/g, "").trim();
  if (!wanted) return null;
  const words = wanted.split(" ").filter((w) => w.length > 2);

  let best: { node: any; heading: string | null; score: number } | null = null;
  for (const node of sections) {
    const heading = headingOf(node);
    if (!heading) continue;
    const hay = normalise(heading);
    const score = hay.includes(wanted) ? 100 : words.filter((w) => hay.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { node, heading, score };
  }
  return best ? { node: best.node, heading: best.heading } : null;
}

/**
 * The page's sections with the requested words swapped in, plus exactly
 * what changed. Never mutates the input: the caller shows the diff and
 * only writes if the owner approves.
 *
 * With no section named, this edits the hero — the first heading,
 * paragraph and button on the page, which is what "the headline" means.
 */
export function applyHomepageCopy(
  sections: unknown,
  requested: { headline?: string | null; subheadline?: string | null; ctaText?: string | null },
  opts: { section?: string | null } = {}
): HomepageCopyResult {
  const next = JSON.parse(JSON.stringify(sections ?? []));
  const list = Array.isArray(next) ? next : [];
  const available = listSections(list).map((s) => s.heading).filter((h): h is string => Boolean(h));

  let scope: unknown = list;
  let sectionHeading: string | null = null;
  if (opts.section && opts.section.trim()) {
    const match = matchSection(list, opts.section);
    // Named a section that isn't there — say so rather than editing
    // whatever happened to be first.
    if (!match) return { sections, changed: [], sectionHeading: null, sectionNotFound: true, available };
    scope = match.node;
    sectionHeading = match.heading;
  } else {
    sectionHeading = listSections(list)[0]?.heading ?? null;
  }

  const targets = findTargets(scope);
  const changed: CopyChange[] = [];
  const want = (field: CopyField) => {
    const value = requested[field];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  const headline = want("headline");
  if (headline) {
    if (targets.headline) {
      changed.push({ field: "headline", from: targets.headline.props.text, to: headline });
      targets.headline.props.text = headline;
    } else if (targets.legacy) {
      changed.push({ field: "headline", from: targets.legacy.headline ?? "", to: headline });
      targets.legacy.headline = headline;
    }
  }

  const subheadline = want("subheadline");
  if (subheadline) {
    if (targets.subheadline) {
      changed.push({ field: "subheadline", from: stripHtml(targets.subheadline.props.html), to: subheadline });
      targets.subheadline.props.html = `<p>${subheadline}</p>`;
    } else if (targets.legacy) {
      changed.push({ field: "subheadline", from: targets.legacy.subheadline ?? "", to: subheadline });
      targets.legacy.subheadline = subheadline;
    }
  }

  const ctaText = want("ctaText");
  if (ctaText) {
    if (targets.ctaText) {
      changed.push({ field: "ctaText", from: targets.ctaText.props.label, to: ctaText });
      targets.ctaText.props.label = ctaText;
    } else if (targets.legacy) {
      changed.push({ field: "ctaText", from: targets.legacy.ctaText ?? "", to: ctaText });
      targets.legacy.ctaText = ctaText;
    }
  }

  return { sections: next, changed, sectionHeading, available };
}
