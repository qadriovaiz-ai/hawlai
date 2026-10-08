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

import { normalise, physicalProducts, serviceItems, type BusinessFacts, type CatalogProduct } from "./businessFacts";
import { isService } from "@/lib/catalog/catalogItem";

export type ImageBrief = {
  /** What the image model is asked for. */
  prompt: string;
  /** A real product photo for the model to match, when the business has one. */
  referenceImageUrl: string | null;
  /** True when the brief didn't name what the business sells, so the anchor was added. */
  anchored: boolean;
  /** Set when there is nothing to anchor to DASH the owner needs to fix that. */
  warning: string | null;
  /**
   * Whether this image may show the business's product at all.
   *
   * "real_photo"     a photo of it is attached; the model restyles around it
   * "forbidden"      a real product exists but there is NO photo of it
   * "not_applicable" nothing product-shaped to misrepresent
   */
  productDepiction: ProductDepiction;
  /** What the owner must be told when depiction was forbidden. */
  depictionNote: string | null;
};

export type ProductDepiction = "real_photo" | "forbidden" | "not_applicable";

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

/**
 * The item an image should show: a physical product with a photo first,
 * then any product, then a service (with a photo if one has it). A
 * business that sells only services still gets an anchor — images don't
 * depend on a product photo existing.
 */
export function heroProduct(f: BusinessFacts): CatalogProduct | null {
  const goods = physicalProducts(f);
  const services = serviceItems(f);
  return goods.find((p) => p.images.length > 0) ?? goods[0] ?? services.find((p) => p.images.length > 0) ?? services[0] ?? null;
}

/** The sentence that ties a picture to the real product. Null when the business has told us nothing to anchor to. */
export function heroSubjectLine(f: BusinessFacts): string | null {
  const hero = heroProduct(f);
  if (hero) {
    const what = [hero.name, hero.description ? hero.description.slice(0, 120) : null].filter(Boolean).join(" — ");
    const trade = f.categoryKnown ? ` The business is a ${f.category} business` : "";
    if (isService(hero)) {
      return `The subject is this business's own service: ${what}.${trade} — show that service being provided, or the result a customer gets from it, as the main subject. Do not show an unrelated product or a generic scene without it.`;
    }
    return `The hero subject is this business's own product: ${what}.${trade} — show that product as the main subject. Do not substitute a different product or show a generic scene without it.`;
  }
  if (f.categoryKnown) {
    return `The subject must be what this ${f.category} business actually sells — not a generic scene for the occasion.`;
  }
  return null;
}

/**
 * MAY THIS IMAGE SHOW THE PRODUCT?
 *
 * THE LIVE INCIDENT (8 Oct 2026). "MAKE POST AND WRITE A INSTAGRAM
 * CAPTION FOR LAVENDER CANDLE" produced, and published to a real
 * Facebook Page, a pink candle in a glass jar with lavender sprigs and
 * the words "LAVENDER SOY WAX / Candle by Qaaf" printed on it. No such
 * candle and no such label exist. The owner never supplied a photo; the
 * generator invented the product AND its packaging.
 *
 * The cause was HERE, not in the prompt. b182ed5 told the chat not to
 * OFFER generated product images, and the generate_graphic tool
 * description repeats it in words — but heroSubjectLine does the
 * opposite in code: "The hero subject is this business's own product:
 * Lavender candle ... show that product as the main subject." A
 * code-level instruction beats advice in a tool description every time.
 * It was written for the case where a photo IS attached, where it means
 * "restyle this, don't swap it". With no photo attached, the same
 * sentence means "invent it".
 *
 * So the photo is what decides. A real physical product may be drawn
 * only with its own photograph in the frame as reference. Without one,
 * the product is off limits and the graphic is made of the things that
 * cannot misrepresent it: type, colour, texture, an ingredient.
 */
export function productDepictionFor(f: BusinessFacts | null | undefined): ProductDepiction {
  if (!f) return "not_applicable";
  const hero = heroProduct(f);
  // A service has nothing a customer receives as an object, so a scene
  // of it being provided is not a fabricated product.
  if (!hero || isService(hero)) return "not_applicable";
  return hero.images[0] ? "real_photo" : "forbidden";
}

/**
 * What the model is forbidden from drawing, in the model's own terms.
 *
 * Deliberately enumerates the jar, the label and the brand name as
 * packaging text, because that is exactly what came back: the shape of
 * the product and a label that does not exist.
 */
export const NO_PRODUCT_DEPICTION_RULE =
  "DO NOT DEPICT THIS BUSINESS'S PRODUCT OR ITS PACKAGING. There is no photograph of it on file, so anything you draw would be invented, and this image may be published as the business's own. Draw none of the following: the product itself, a look-alike of it, its jar, bottle, tin, box, label, wrapper or lid, or the business or product name rendered as packaging text on an object. Make instead a graphic that carries the message without the product: typography on a plain or brand-coloured ground, texture, pattern, or a raw ingredient or setting shown on its own. Any words must read as a designed caption, not as a label on a thing.";

/** The subject line for a brief that is not allowed to show the product. */
export function noDepictionSubjectLine(f: BusinessFacts): string | null {
  if (!f.categoryKnown) return null;
  return `This is for a ${f.category} business. Keep the mood and the subject matter of that trade, but the product itself must not appear.`;
}

/** What the owner is told, naming the product whose photo is missing. */
export function depictionNoteFor(f: BusinessFacts): string {
  const hero = heroProduct(f);
  const name = hero?.name ? `"${hero.name}"` : "your product";
  return `There's no photo of ${name} on file, so I haven't drawn it — a generated picture of your product isn't your product, and this could end up public. This graphic is type and colour only. Add a real photo to ${name} in Products and I'll build around the actual one.`;
}

/**
 * The brief an image model should be given: the words asked for, plus
 * the product anchor when they don't already name the real product, plus
 * the product photo to match.
 */
export function buildImageBrief(brief: string, f: BusinessFacts | null | undefined): ImageBrief {
  const text = (brief ?? "").trim();
  if (!f)
    return {
      prompt: text,
      referenceImageUrl: null,
      anchored: false,
      warning: null,
      productDepiction: "not_applicable",
      depictionNote: null,
    };

  const hero = heroProduct(f);
  const depiction = productDepictionFor(f);
  const forbidden = depiction === "forbidden";
  // With no photo, the hero-subject line is the instruction that
  // invented the candle. It is replaced, not merely softened.
  const anchor = forbidden ? noDepictionSubjectLine(f) : heroSubjectLine(f);
  const needsAnchor = !mentionsProduct(text, f);
  const anchored = needsAnchor && Boolean(anchor);
  // The rule goes on whether or not an anchor was added: the owner's own
  // words ("lavender candle on a wooden table") ask for the product just
  // as directly, and that brief skips anchoring entirely.
  const prompt = [anchored ? [text, anchor].filter(Boolean).join(" ") : text, forbidden ? NO_PRODUCT_DEPICTION_RULE : null]
    .filter(Boolean)
    .join(" ");

  return {
    prompt,
    // Only a physical product's photo is a reference to copy exactly. A
    // service's photo (a salon chair, a treatment room) isn't the thing to
    // reproduce, and REFERENCE_PHOTO_RULE is written for products.
    referenceImageUrl: hero && !isService(hero) ? hero.images[0] ?? null : null,
    anchored,
    productDepiction: depiction,
    depictionNote: forbidden ? depictionNoteFor(f) : null,
    warning:
      !f.products.length && !f.categoryKnown
        ? "Hawlai doesn't know what this business sells yet — add your products or services, or set your business category in Settings, so generated images match."
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
