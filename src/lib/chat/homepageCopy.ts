// Changing the words on the real homepage.
//
// THE BUG THIS REPLACES: chat's "update landing page" tool wrote
// headline/subheadline/offer_text to the `landing_pages` table and
// answered "changes are live immediately". The live site at
// /site/{slug} does not render that table — it renders
// website_pages.sections, the Website Builder's block tree. So the
// change could never appear, and for a business with no landing_pages
// row the update matched ZERO rows, which Supabase reports as success
// with error: null. Reported live, actually nothing, twice over.
//
// This edits the blocks the site really renders, and returns what it
// would change rather than writing — the write happens only when the
// owner approves it in chat (src/lib/chat/publishActions.ts).

export type CopyField = "headline" | "subheadline" | "ctaText";
export type CopyChange = { field: CopyField; from: string; to: string };

type Block = Record<string, any>;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The first block of each kind, in page order — the hero headline, its
 * supporting line and its button. Deliberately only the FIRST of each:
 * "change the headline" means the one at the top of the page, not every
 * heading on it.
 */
function findTargets(sections: Block[]): { headline?: Block; subheadline?: Block; ctaText?: Block; legacy?: Block } {
  const found: { headline?: Block; subheadline?: Block; ctaText?: Block; legacy?: Block } = {};
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const b = node as Block;
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
  walk(sections);
  return found;
}

/**
 * The page's sections with the requested words swapped in, plus exactly
 * what changed. Never mutates the input: the caller shows the diff and
 * only writes if the owner approves.
 */
export function applyHomepageCopy(
  sections: unknown,
  requested: { headline?: string | null; subheadline?: string | null; ctaText?: string | null }
): { sections: any; changed: CopyChange[] } {
  const next = JSON.parse(JSON.stringify(sections ?? []));
  const targets = findTargets(Array.isArray(next) ? next : []);
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

  return { sections: next, changed };
}
