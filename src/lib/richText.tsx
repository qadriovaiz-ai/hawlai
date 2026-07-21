import type { ReactNode } from "react";

// Minimal markdown-like subset: **bold**, *italic*, [text](url).
// Links are restricted to http(s)/mailto/relative paths to avoid javascript: URLs.
const PATTERN = /\[([^\[\]]+)\]\((https?:\/\/[^\s()]+|mailto:[^\s()]+|\/[^\s()]*)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

export function renderRichText(text: string | null | undefined): ReactNode {
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
