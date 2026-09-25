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
