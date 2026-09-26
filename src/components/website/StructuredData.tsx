import { jsonLdText } from "@/lib/seo/structuredData";

/**
 * The one place dangerouslySetInnerHTML is the correct tool: a JSON-LD
 * block is script content, not text for a person to read, and React
 * would escape it into uselessness otherwise. The "<" in the payload is
 * already escaped by jsonLdText, so nothing in a product description can
 * close the tag early.
 */
export default function StructuredData({ node }: { node: Record<string, unknown> | null }) {
  const text = jsonLdText(node);
  if (!text) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: text }} />;
}
