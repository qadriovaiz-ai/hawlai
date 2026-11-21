import type { ReactNode } from "react";

// Minimal markdown-like subset: **bold**, *italic*, [text](url).
// Links are restricted to http(s)/mailto/relative paths to avoid javascript: URLs.
const PATTERN = /\[([^\[\]]+)\]\((https?:\/\/[^\s()]+|mailto:[^\s()]+|\/[^\s()]*)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

// A tag, as opposed to a less-than sign someone typed. Needs a letter (or
// a slash) straight after the "<" and a ">" to close it, so "a < b" and
// "<3" are left alone.
const TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*?)?\/?>/gi;
// Tags that were a line break in the original markup, so the words either
// side don't run together when the tag goes.
const BREAK = /<\s*br\s*\/?>|<\/\s*(?:p|div|li|h[1-6]|tr|blockquote)\s*>/gi;

/**
 * HTML tags in a value that is not HTML.
 *
 * THE LIVE BUG (2026-09-21): the homepage subheadline read, to every
 * visitor, "<p>No paraffin. No synthetic shortcuts…</p>" — tags and all.
 * The block's prop is NAMED `html`, so the chat's copy-edit path wrapped
 * the new sentence in <p>…</p>. But nothing here has ever rendered HTML:
 * this function understands **bold**, *italic* and [links](url), and
 * React escapes everything else, which is exactly what a person then
 * reads on the page. The builder's own editor stores markdown too — the
 * prop name is the only thing that ever suggested otherwise.
 *
 * Stripping here, and not only at the place that wrote it, is deliberate:
 * it puts the already-published page right the moment this deploys,
 * without waiting for anyone to regenerate the copy, and it covers every
 * other value that reaches this renderer — product descriptions and any
 * text block an AI-written page produced with a tag in it.
 */
export function stripTags(text: string): string {
  if (!text.includes("<")) return text;
  return text
    .replace(BREAK, " ")
    .replace(TAG, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function renderRichText(raw: string | null | undefined): ReactNode {
  if (!raw) return raw;
  const text = stripTags(raw);
  if (!text) return text;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  PATTERN.lastIndex = 0;
  while ((match = PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <a key={key++} href={match[2]} target="_blank" rel="noopener noreferrer" className="underline">
          {match[1]}
        </a>
      );
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={key++}>{match[3]}</strong>);
    } else if (match[4] !== undefined) {
      nodes.push(<em key={key++}>{match[4]}</em>);
    }
    lastIndex = PATTERN.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/** `&`, `<` and `>` as entities, so nothing a person typed becomes markup. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The same markdown subset, as an HTML STRING.
 *
 * FOR A SURFACE THAT REALLY DOES RENDER HTML — a Shopify page body.
 * `renderRichText` above returns React nodes for this product's own
 * site, where tags are escaped and a `<p>` would be printed to the
 * visitor literally (the 2026-09-21 live bug). A Shopify page is the
 * opposite: its body IS markup, and markdown sent there renders as
 * asterisks on a real storefront.
 *
 * SHARING ONE DEFINITION OF THE SUBSET IS THE POINT. The tool schema
 * promises the model "**bold**, *italic*, [text](url) — never HTML
 * tags", and that promise is now kept on both surfaces by the same
 * PATTERN. A second copy of that regex would be two definitions of
 * what the model is allowed to write, and one of them would drift.
 *
 * STRIPPED, THEN ESCAPED, THEN CONVERTED, in that order and for
 * safety rather than tidiness. This text can come from a model, so
 * anything tag-like is removed first and whatever survives is escaped
 * before this function inserts tags of its own. The only markup in
 * the output is the markup this function wrote.
 */
export function richTextToHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = stripTags(raw);
  if (!text.trim()) return "";

  const inline = (chunk: string): string => {
    let out = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    PATTERN.lastIndex = 0;
    while ((match = PATTERN.exec(chunk)) !== null) {
      if (match.index > lastIndex) out += escapeHtml(chunk.slice(lastIndex, match.index));
      if (match[1] !== undefined) {
        // The href is already restricted by PATTERN to http(s), mailto
        // and relative paths, so no javascript: URL can reach here.
        out += `<a href="${escapeHtml(match[2])}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[1])}</a>`;
      } else if (match[3] !== undefined) {
        out += `<strong>${escapeHtml(match[3])}</strong>`;
      } else if (match[4] !== undefined) {
        out += `<em>${escapeHtml(match[4])}</em>`;
      }
      lastIndex = PATTERN.lastIndex;
    }
    if (lastIndex < chunk.length) out += escapeHtml(chunk.slice(lastIndex));
    return out;
  };

  // A BLANK LINE IS A PARAGRAPH, and a single newline is a line break.
  // Without this the whole page body arrives as one run-on paragraph,
  // which is what a merchant would see on their live storefront.
  return text
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${inline(para).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
