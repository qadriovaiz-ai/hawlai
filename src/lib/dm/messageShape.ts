// What a DM with no text looked like — the first step of T1 in
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// T1 is "a DM that points at a post": a shared post, a reply to a story.
// The plan says THE PAYLOAD SHAPE IS UNVERIFIED and must be checked
// against one real share before anything is built on it — the Shopify
// adapter needed four corrections after meeting a real store, three of
// them invisible to a green suite. Until now a DM with no text was
// skipped silently, so there was nothing to check against.
//
// THIS RECORDS THE SHAPE, NEVER THE CONTENT: attachment TYPES (a short
// fixed vocabulary from Meta, like "share" or "story_mention"), and the
// NAMES of the keys present. No URL, no id, no title, no caption, no text
// — those could identify a customer or carry what they sent privately.

const SAFE_TYPE = /^[a-z_]{1,30}$/;

const keysOf = (v: unknown): string =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.keys(v as object)
        .filter((k) => /^[a-z_]{1,30}$/i.test(k))
        .sort()
        .slice(0, 12)
        .join(",")
    : "";

/**
 * A one-line description of a message's structure, e.g.
 * `attachments[share{payload:title,url}] reply_to{story:id,url}`.
 * Null when there is nothing but text, or nothing at all.
 */
export function describeMessageShape(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const m = message as Record<string, any>;
  const parts: string[] = [];

  if (Array.isArray(m.attachments) && m.attachments.length) {
    const each = m.attachments.slice(0, 5).map((a: any) => {
      const type = typeof a?.type === "string" && SAFE_TYPE.test(a.type) ? a.type : "?";
      const payload = keysOf(a?.payload);
      return `${type}${payload ? `{payload:${payload}}` : ""}`;
    });
    parts.push(`attachments[${each.join(";")}]`);
  }
  if (m.reply_to && typeof m.reply_to === "object") {
    const inner = Object.entries(m.reply_to as Record<string, any>)
      .filter(([k]) => /^[a-z_]{1,30}$/i.test(k))
      .slice(0, 5)
      .map(([k, v]) => (v && typeof v === "object" ? `${k}:${keysOf(v)}` : k));
    parts.push(`reply_to{${inner.join(";")}}`);
  }
  const other = Object.keys(m)
    .filter((k) => !["mid", "text", "attachments", "reply_to", "is_echo"].includes(k) && /^[a-z_]{1,30}$/i.test(k))
    .sort()
    .slice(0, 8);
  if (other.length) parts.push(`keys{${other.join(",")}}`);

  return parts.length ? parts.join(" ") : null;
}
