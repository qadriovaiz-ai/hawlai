// A generated email draft + the business's real facts → the finished
// visual email (subject, HTML, plain text).
//
// The AI writes the words: a headline, a line or two, up to three
// bullets, a button label, which product it's about. Everything that
// must be RIGHT comes from code, never the model:
//  - the button's link — the real product page, else the storefront, else
//    no button at all (a promo email once linked to a domain that doesn't
//    exist);
//  - the photo — the product's own uploaded image;
//  - the brand colour and logo — the owner's brand kit;
//  - the length — cut to scannable here, whatever came back.

import { matchProducts, type BusinessFacts, type CatalogProduct } from "@/lib/claims/businessFacts";
import { heroProduct } from "@/lib/claims/imageBrief";
import { senderDisplayName } from "@/lib/email/resendClient";
import { pickAccent, renderEmailHtml, renderEmailText, safeUrl, type EmailDesign } from "@/lib/email/template";

export type EmailDraft = {
  subject?: string;
  previewText?: string;
  headline?: string;
  intro?: string;
  bullets?: string[];
  ctaLabel?: string;
  /** The product the email is about, as named in the store. */
  product?: string;
  sections?: { heading?: string; body?: string }[];
  /** The plain-text version the draft also carries; used when the structured fields are missing. */
  body?: string;
};

export type ComposedEmail = { subject: string; html: string; text: string; design: EmailDesign };

export const LIMITS = { headline: 70, paragraph: 300, paragraphs: 2, bullet: 90, bullets: 3, ctaLabel: 28, sections: 3, preheader: 110 };

/** Cut at a word boundary, with an ellipsis only when something was cut. */
export function clip(text: string | null | undefined, max: number): string {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const atSpace = cut.lastIndexOf(" ");
  return `${(atSpace > max * 0.6 ? cut.slice(0, atSpace) : cut).replace(/[\s,;:—-]+$/, "")}…`;
}

/** The product the email is about: the one it names, else one whose name appears in its words. */
function productFor(draft: EmailDraft, facts: BusinessFacts): CatalogProduct | null {
  if (draft.product) {
    const named = matchProducts(facts.products, draft.product);
    if (named.length) return named[0];
  }
  const words = [draft.subject, draft.headline, draft.intro, draft.body, ...(draft.bullets ?? [])].filter(Boolean).join(" ").toLowerCase();
  return facts.products.find((p) => p.name && words.includes(p.name.toLowerCase())) ?? null;
}

export function composeMarketingEmail(
  draft: EmailDraft,
  facts: BusinessFacts,
  footer: { reason?: string; address?: string | null; unsubscribeUrl?: string | null } = {}
): ComposedEmail {
  const brandName = senderDisplayName(facts.businessName);
  const product = productFor(draft, facts);

  const bodyParas = String(draft.body ?? "")
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const headline = clip(draft.headline || draft.subject || brandName, LIMITS.headline);
  const paragraphs = (draft.intro ? [draft.intro] : bodyParas).slice(0, LIMITS.paragraphs).map((x) => clip(x, LIMITS.paragraph));
  const bullets = (draft.bullets ?? []).filter((b) => typeof b === "string" && b.trim()).slice(0, LIMITS.bullets).map((b) => clip(b, LIMITS.bullet));
  const sections = (draft.sections ?? [])
    .filter((s) => s && (s.heading || s.body))
    .slice(0, LIMITS.sections)
    .map((s) => ({ heading: clip(s.heading, LIMITS.headline), body: clip(s.body, LIMITS.paragraph) }));

  const productLink = product ? facts.links?.products.find((l) => l.name === product.name)?.url ?? null : null;
  const ctaUrl = safeUrl(productLink ?? facts.links?.store ?? null);
  const ctaLabel = clip(draft.ctaLabel || (productLink ? `Shop ${product!.name}` : "Visit the store"), LIMITS.ctaLabel);
  // The product's own photo — never a different product's. Only an email
  // about the business in general shows its best-photographed product.
  const pictured = product ? product : heroProduct(facts);
  const photo = pictured ? safeUrl(pictured.images[0]) : null;

  const design: EmailDesign = {
    brandName,
    logoUrl: safeUrl(facts.brand?.logoUrl),
    accent: pickAccent(facts.brand?.colors),
    preheader: clip(draft.previewText || paragraphs[0] || "", LIMITS.preheader),
    headline,
    paragraphs,
    bullets,
    sections,
    image: photo ? { url: photo, alt: pictured!.name } : null,
    cta: ctaUrl ? { label: ctaLabel, url: ctaUrl } : null,
    footer: {
      reason: footer.reason ?? `You're receiving this because you shared your email with ${brandName}.`,
      address: footer.address?.trim() || null,
      unsubscribeUrl: footer.unsubscribeUrl ?? null,
    },
  };

  return { subject: String(draft.subject || headline), html: renderEmailHtml(design), text: renderEmailText(design), design };
}
