// Anchoring a generated picture to what the business actually sells.
//
// WHY THIS EXISTS: a "Diwali post" for a candle business came back as
// generic festival imagery — diyas, rangoli, no candle. Every image path
// was told the business's NAME and a CATEGORY WORD and nothing else: no
// product names, no descriptions, no photo. The theme in the brief then
// decided the picture.
//
// Two things fix that, both cheap and deterministic:
//   1. A hero-subject line naming the real product, added when the brief
//      doesn't already name what the business sells.
//   2. The product's own photo, sent to the image model as a reference —
//      the ad path already proves this works ("keep the product
//      unchanged, only change the background").
//
// The check is on the PROMPT, before generation — no vision pass over
// the finished image, which would be slow, costly, and after the fact.

import { normalise, type BusinessFacts, type CatalogProduct } from "./businessFacts";

export type ImageBrief = {
  /** What the image model is asked for. */
  prompt: string;
  /** A real product photo for the model to match, when the business has one. */
  referenceImageUrl: string | null;
  /** True when the brief didn't name what the business sells, so the anchor was added. */
  anchored: boolean;
  /** Set when there is nothing to anchor to — the owner needs to fix that. */
  warning: string | null;
};

// Words too generic to prove a brief is about the real product.
const STOP = new Set([
  "the", "and", "for", "with", "our", "your", "new", "best", "sale", "offer", "this", "that", "from", "into", "make", "made",
  "premium", "luxury", "quality", "special", "festive", "gift", "gifts", "gifting", "collection", "product", "products", "brand",
]);

/** The words that name what this business sells: product names, their words, their categories, the business category. */
export function productTerms(f: BusinessFacts): string[] {
  const terms = new Set<string>();
  const add = (value: string | null | undefined) => {
    const t = normalise(value ?? "");
    if (!t) return;
    terms.add(t);
    for (const word of t.split(" ")) if (word.length > 3 && !STOP.has(word)) terms.add(word);
  };
  for (const p of f.products) {
    add(p.name);
    add(p.category);
  }
  if (f.categoryKnown) add(f.category);
  return [...terms].filter(Boolean);
}

/** Does this brief already name the real product or category? The Phase-3 check, run before anything is drawn. */
export function mentionsProduct(brief: string, f: BusinessFacts): boolean {
  const text = normalise(brief);
  if (!text) return false;
  return productTerms(f).some((term) => text.includes(term));
}

/** The product an image should show: the first one with a photo, else the first listed. */
export function heroProduct(f: BusinessFacts): CatalogProduct | null {
  return f.products.find((p) => p.images.length > 0) ?? f.products[0] ?? null;
}

/** The sentence that ties a picture to the real product. Null when the business has told us nothing to anchor to. */
export function heroSubjectLine(f: BusinessFacts): string | null {
  const hero = heroProduct(f);
  if (hero) {
    const what = [hero.name, hero.description ? hero.description.slice(0, 120) : null].filter(Boolean).join(" — ");
    const trade = f.categoryKnown ? ` The business is a ${f.category} business` : "";
    return `The hero subject is this business's own product: ${what}.${trade} — show that product as the main subject. Do not substitute a different product or show a generic scene without it.`;
  }
  if (f.categoryKnown) {
    return `The subject must be what this ${f.category} business actually sells — not a generic scene for the occasion.`;
  }
  return null;
}

/**
 * The brief an image model should be given: the words asked for, plus
 * the product anchor when they don't already name the real product, plus
 * the product photo to match.
 */
export function buildImageBrief(brief: string, f: BusinessFacts | null | undefined): ImageBrief {
  const text = (brief ?? "").trim();
  if (!f) return { prompt: text, referenceImageUrl: null, anchored: false, warning: null };

  const hero = heroProduct(f);
  const anchor = heroSubjectLine(f);
  const needsAnchor = !mentionsProduct(text, f);
  const prompt = needsAnchor && anchor ? [text, anchor].filter(Boolean).join(" ") : text;

  return {
    prompt,
    referenceImageUrl: hero?.images[0] ?? null,
    anchored: needsAnchor && Boolean(anchor),
    warning:
      !f.products.length && !f.categoryKnown
        ? "Hawlai doesn't know what this business sells yet — add your products, or set your business category in Settings, so generated images match."
        : null,
  };
}

/** How the model is told to treat the attached photo. */
export const REFERENCE_PHOTO_RULE =
  "The attached photo is this business's ACTUAL product. The product in your image must be that same product — same shape, colour, material and finish. Restyle the scene, lighting and background around it; never replace it with a different-looking item.";

const MAX_REFERENCE_BYTES = 6_000_000;

/** Fetches a product photo for the image model. Never throws: no photo just means a text-only brief. */
export async function fetchReferenceImage(url: string | null | undefined): Promise<{ base64: string; mimeType: string } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/png";
    if (!mimeType.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_REFERENCE_BYTES) return null;
    return { base64: bytes.toString("base64"), mimeType };
  } catch {
    return null;
  }
}

/** The Gemini `parts` for a brief: the reference photo first, then the words. */
export async function imageParts(brief: ImageBrief, promptText: string): Promise<any[]> {
  const reference = await fetchReferenceImage(brief.referenceImageUrl);
  if (!reference) return [{ text: promptText }];
  return [
    { inline_data: { mime_type: reference.mimeType, data: reference.base64 } },
    { text: `${promptText}\n\n${REFERENCE_PHOTO_RULE}` },
  ];
}
