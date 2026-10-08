// A post needs a picture, and there are only three honest places to get one.
//
// After 8 October 2026 the chat stopped inventing product photos
// (src/lib/claims/imageBrief.ts), which left captions with nothing to
// post. "Text only, because we can't draw your candle" is a correct
// answer and a useless one — the owner HAS photos of her candles, on her
// phone and already on her own site.
//
// So the card offers the three real options, in the order of how
// truthful each one is:
//
//   1. a photo the owner uploads          — actually her product
//   2. a photo already on her site/catalogue — actually her product
//   3. an AI graphic with no product in it — honest about being art
//
// Option 3 is the one that costs money and the one that cannot show the
// product; it is listed last for both reasons.

/** Where a post's picture came from. Recorded, so the card can say so. */
export type ImageSource = "uploaded" | "site" | "ai";

export type OwnImage = {
  url: string;
  /** What the owner would call it. */
  label: string;
  /** Which of her own places it came from. */
  from: "product" | "site" | "logo" | "generated";
};

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

/**
 * Whether a string is a usable image address.
 *
 * Deliberately strict about the scheme: a `data:` URI can't be posted to
 * Facebook (Graph fetches the URL itself), and anything that isn't
 * http(s) would fail silently at post time.
 */
export function isImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return false;
  // Supabase public URLs keep the extension; a signed one carries a
  // query string, which the pattern allows for.
  return IMAGE_EXT.test(v);
}

/** Keys on a website block whose value, if it is a URL, is a picture. */
const IMAGE_PROP_KEYS = new Set(["url", "imageurl", "src", "backgroundimage", "image", "photo", "ogimageurl"]);

/**
 * Every image inside a page's block tree.
 *
 * Walks the whole tree rather than looking for known block types: the
 * builder has legacy `imageUrl` sections, converted `image` blocks with
 * `props.url`, and containers nested several deep. A key-name check plus
 * an extension check is cheap and catches all of them without a schema.
 */
export function imagesInSections(sections: unknown, out: string[] = []): string[] {
  if (Array.isArray(sections)) {
    for (const item of sections) imagesInSections(item, out);
    return out;
  }
  if (!sections || typeof sections !== "object") return out;
  for (const [key, value] of Object.entries(sections as Record<string, unknown>)) {
    if (IMAGE_PROP_KEYS.has(key.toLowerCase()) && isImageUrl(value)) out.push(value.trim());
    else if (value && typeof value === "object") imagesInSections(value, out);
  }
  return out;
}

/**
 * The business's own pictures, newest-most-useful first.
 *
 * Product photos lead because they are the only ones that show what is
 * for sale. Every URL here came from a row this business owns — nothing
 * is read from storage by listing a folder, so there is no path by which
 * another business's file could appear.
 */
export function collectOwnImages(input: {
  products?: { name?: string | null; images?: unknown }[] | null;
  logoUrl?: string | null;
  pages?: { title?: string | null; slug?: string | null; sections?: unknown }[] | null;
  graphics?: { design_type?: string | null; image_url?: string | null }[] | null;
}): OwnImage[] {
  const out: OwnImage[] = [];
  const seen = new Set<string>();
  const push = (url: string, label: string, from: OwnImage["from"]) => {
    const key = url.trim();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: key, label, from });
  };

  for (const product of input.products ?? []) {
    const images = Array.isArray(product.images) ? product.images : [];
    for (const image of images) {
      if (isImageUrl(image)) push(image, product.name?.trim() || "Product photo", "product");
    }
  }
  for (const page of input.pages ?? []) {
    const where = page.title?.trim() || page.slug?.trim() || "your site";
    for (const image of imagesInSections(page.sections)) push(image, `From your ${where} page`, "site");
  }
  if (isImageUrl(input.logoUrl)) push(input.logoUrl, "Your logo", "logo");
  for (const graphic of input.graphics ?? []) {
    if (isImageUrl(graphic.image_url)) {
      push(graphic.image_url, `Earlier graphic${graphic.design_type ? ` (${String(graphic.design_type).replace(/_/g, " ")})` : ""}`, "generated");
    }
  }
  return out;
}

// --- uploads ---------------------------------------------------------

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Only the three formats a post can actually use.
 *
 * GIF is accepted by the website builder's uploader but not here: an
 * animated GIF posted as a photo becomes a still frame nobody chose,
 * and Instagram rejects it outright.
 */
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type UploadCheck = { ok: true; mimeType: string; ext: string } | { ok: false; error: string };

/** What an uploaded file has to be, checked before anything is stored. */
export function checkUpload(mimeType: string, byteLength: number): UploadCheck {
  const type = (mimeType ?? "").toLowerCase().trim();
  if (!(UPLOAD_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: "That file isn't a JPG, PNG or WEBP image." };
  }
  if (byteLength <= 0) return { ok: false, error: "That file is empty." };
  if (byteLength > UPLOAD_MAX_BYTES) return { ok: false, error: "That image is over 5MB — send a smaller one." };
  return { ok: true, mimeType: type, ext: type === "image/jpeg" ? "jpg" : type.split("/")[1] };
}

/**
 * Where an uploaded post image lives.
 *
 * The business's id is the FIRST folder segment after the prefix, which
 * is what the storage policies on this bucket are written against. It is
 * never taken from the request — the caller passes the id resolved from
 * the authenticated session.
 */
export function uploadPath(dealershipId: string, ext: string, now: number = Date.now()): string {
  return `post-images/${dealershipId}/${now}.${ext}`;
}

/** What the card says about where the picture came from. */
export function imageSourceLabel(source: ImageSource | null | undefined): string | null {
  switch (source) {
    case "uploaded":
      return "Your photo";
    case "site":
      return "From your own photos";
    case "ai":
      // Said plainly, every time. Facebook labels AI content itself; the
      // owner should not learn it from Facebook.
      return "AI-made graphic — not a photo of your product";
    default:
      return null;
  }
}
