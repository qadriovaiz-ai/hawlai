// ------------------------------------------------------------------
// Pitch Deck Builder — Phase 2a (master audit "looks advanced,
// delivers basic" follow-up to the Graphic Design "Pitch Deck Cover"
// relabel).
// ------------------------------------------------------------------
// Real, downloadable, multi-slide .pptx — not a single title-slide
// image. Reuses the exact rendering approach already proven in
// /api/reports/presentation/route.ts (pptxgenjs, addText/addImage/
// addTable), generalized into small reusable slide-layout functions
// instead of that route's one-off hardcoded slides, since a pitch
// deck's content is drafted per-business rather than being a fixed
// metrics report.
//
// Fixed 5-slide shape for this phase (title, mission/about, product
// highlights, why-us, contact/CTA) — a flexible/AI-chosen slide count
// is Phase 2b, deliberately not attempted here.
// ------------------------------------------------------------------

import PptxGenJS from "pptxgenjs";
import { logClaudeUsage } from "../usage/logUsage";
import { getModel } from "../models";

export interface DeckBrandColor {
  name: string;
  hex: string;
  role: string;
}

export interface DeckBrandKit {
  colors: DeckBrandColor[];
  tagline?: string | null;
  mission?: string | null;
  vision?: string | null;
  brandStory?: string | null;
}

export interface DeckProduct {
  name: string;
  description: string | null;
  price: number;
}

export interface DeckContent {
  title: { headline: string; subheadline: string };
  missionAbout: { heading: string; body: string };
  productHighlights: { name: string; description: string }[];
  whyUs: string[];
  contactCta: { heading: string; body: string; ctaText: string };
}

const FALLBACK_CONTENT = (dealershipName: string, businessCategory: string): DeckContent => ({
  title: { headline: dealershipName, subheadline: `A ${businessCategory} business` },
  missionAbout: { heading: "About Us", body: `${dealershipName} is a ${businessCategory} business focused on serving customers well. Regenerate once your Anthropic API key/quota is available for tailored content.` },
  productHighlights: [{ name: "Our offerings", description: "Add products in Website Builder for this slide to list them specifically." }],
  whyUs: ["Local expertise", "Customer-first approach", "Reliable service"],
  contactCta: { heading: "Get in Touch", body: "We'd love to work with you.", ctaText: "Contact us today" },
});

export async function generateDeckContent(
  dealershipName: string,
  city: string | null,
  businessCategory: string,
  brandKit: DeckBrandKit | null,
  products: DeckProduct[],
  toneOfVoice: string | null | undefined,
  logContext?: { supabase: any; dealershipId: string }
): Promise<DeckContent> {
  const fallback = FALLBACK_CONTENT(dealershipName, businessCategory);

  const brandContext = brandKit
    ? `Existing brand material to draw from (use it, don't contradict it):\nTagline: ${brandKit.tagline ?? "none set"}\nMission: ${brandKit.mission ?? "none set"}\nVision: ${brandKit.vision ?? "none set"}\nBrand story: ${brandKit.brandStory ?? "none set"}`
    : "No brand kit set yet — infer a reasonable mission/story from the business name and category, and say so plainly rather than inventing specific founding history or claims.";

  const productsContext = products.length > 0
    ? `Real products/services to feature (use these exact names — never invent a product that isn't listed): ${products.map((p) => `"${p.name}"${p.description ? ` — ${p.description}` : ""} (₹${p.price})`).join("; ")}`
    : "No specific products are listed yet — describe the business's core offerings generally based on its category, don't invent named products.";

  const toneLine = toneOfVoice ? `Brand tone: ${toneOfVoice}.` : "";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: getModel("standard"),
        max_tokens: 1600,
        messages: [
          {
            role: "user",
            content: `Draft content for a 5-slide pitch deck for "${dealershipName}", a ${businessCategory} business${city ? ` in ${city}` : ""}.
${brandContext}
${productsContext}
${toneLine}

Return JSON only:
{"title":{"headline":"the deck's title — usually the business name or a short positioning line, under 8 words","subheadline":"one line under the title, e.g. what the business does"},"missionAbout":{"heading":"a short heading like 'About Us' or 'Our Mission'","body":"2-3 sentences, genuinely specific to this business, not generic filler"},"productHighlights":[{"name":"...","description":"one line"}] (3-4 items — use the real products listed above if any exist, otherwise describe the business's core offerings honestly without inventing named products),"whyUs":["...","...","..."] (3-4 short, specific differentiators, not generic claims like 'quality service'),"contactCta":{"heading":"a closing heading like 'Let's Talk' or 'Get in Touch'","body":"1-2 sentences inviting the next step","ctaText":"a short call-to-action line, e.g. 'Contact us today'"}}`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "pitch_deck_content", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    return {
      title: { headline: parsed.title?.headline ?? fallback.title.headline, subheadline: parsed.title?.subheadline ?? fallback.title.subheadline },
      missionAbout: { heading: parsed.missionAbout?.heading ?? fallback.missionAbout.heading, body: parsed.missionAbout?.body ?? fallback.missionAbout.body },
      productHighlights: Array.isArray(parsed.productHighlights) && parsed.productHighlights.length > 0
        ? parsed.productHighlights.filter((p: any) => p?.name).map((p: any) => ({ name: String(p.name), description: String(p.description ?? "") }))
        : fallback.productHighlights,
      whyUs: Array.isArray(parsed.whyUs) && parsed.whyUs.length > 0 ? parsed.whyUs.map(String) : fallback.whyUs,
      contactCta: {
        heading: parsed.contactCta?.heading ?? fallback.contactCta.heading,
        body: parsed.contactCta?.body ?? fallback.contactCta.body,
        ctaText: parsed.contactCta?.ctaText ?? fallback.contactCta.ctaText,
      },
    };
  } catch (err: any) {
    console.error("[pitch-deck-agent] generateDeckContent error:", err.message);
    return fallback;
  }
}

// ------------------------------------------------------------------
// Rendering — small reusable slide layouts, not one-off hardcoded
// slides like the presentation report, since this deck's shape needs
// to work for any business's content, not one fixed metrics shape.
// ------------------------------------------------------------------

interface DeckStyle {
  accentHex: string; // no '#'
  darkHex: string; // no '#'
  logo: { buffer: Buffer; mimeType: string } | null;
}

function titleSlideLayout(pptx: PptxGenJS, content: DeckContent["title"], style: DeckStyle) {
  const slide = pptx.addSlide();
  slide.background = { color: style.darkHex };
  slide.addText(content.headline, { x: 0.6, y: 2.1, w: 8.8, h: 1.2, fontSize: 34, bold: true, color: "FFFFFF" });
  slide.addText(content.subheadline, { x: 0.6, y: 3.0, w: 8.8, h: 0.6, fontSize: 16, color: style.accentHex });
  if (style.logo) {
    slide.addImage({ data: `data:${style.logo.mimeType};base64,${style.logo.buffer.toString("base64")}`, x: 8.1, y: 0.4, w: 1.3, h: 0.5, sizing: { type: "contain", w: 1.3, h: 0.5 } });
  }
}

function textBlockSlideLayout(pptx: PptxGenJS, heading: string, body: string, style: DeckStyle) {
  const slide = pptx.addSlide();
  slide.addText(heading, { x: 0.6, y: 0.5, w: 8.8, h: 0.7, fontSize: 26, bold: true, color: style.darkHex });
  slide.addText(body, { x: 0.6, y: 1.5, w: 8.8, h: 3, fontSize: 15, color: "334155", valign: "top" });
}

function bulletListSlideLayout(pptx: PptxGenJS, heading: string, bullets: string[], style: DeckStyle) {
  const slide = pptx.addSlide();
  slide.addText(heading, { x: 0.6, y: 0.5, w: 8.8, h: 0.7, fontSize: 26, bold: true, color: style.darkHex });
  slide.addText(
    bullets.map((b) => ({ text: b, options: { bullet: { code: "2022", indent: 20 }, breakLine: true, fontSize: 16, color: "334155" } })),
    { x: 0.8, y: 1.5, w: 8.4, h: 3.3 }
  );
}

function productGridSlideLayout(pptx: PptxGenJS, heading: string, products: DeckContent["productHighlights"], style: DeckStyle) {
  const slide = pptx.addSlide();
  slide.addText(heading, { x: 0.6, y: 0.5, w: 8.8, h: 0.7, fontSize: 26, bold: true, color: style.darkHex });
  let y = 1.5;
  for (const p of products.slice(0, 4)) {
    slide.addText(p.name, { x: 0.8, y, w: 8.2, h: 0.4, fontSize: 16, bold: true, color: style.darkHex });
    y += 0.4;
    if (p.description) {
      slide.addText(p.description, { x: 0.8, y, w: 8.2, h: 0.4, fontSize: 12, color: "64748B" });
      y += 0.5;
    } else {
      y += 0.15;
    }
  }
}

function ctaSlideLayout(pptx: PptxGenJS, content: DeckContent["contactCta"], style: DeckStyle) {
  const slide = pptx.addSlide();
  slide.background = { color: style.darkHex };
  slide.addText(content.heading, { x: 0.6, y: 1.6, w: 8.8, h: 0.8, fontSize: 30, bold: true, color: "FFFFFF" });
  slide.addText(content.body, { x: 0.6, y: 2.5, w: 8.8, h: 0.8, fontSize: 14, color: "CBD5E1" });
  slide.addText(content.ctaText, { x: 0.6, y: 3.5, w: 6, h: 0.6, fontSize: 16, bold: true, color: style.accentHex });
}

export async function buildPitchDeckPptx(content: DeckContent, style: DeckStyle): Promise<Buffer> {
  const pptx = new PptxGenJS();
  titleSlideLayout(pptx, content.title, style);
  textBlockSlideLayout(pptx, content.missionAbout.heading, content.missionAbout.body, style);
  productGridSlideLayout(pptx, "What We Offer", content.productHighlights, style);
  bulletListSlideLayout(pptx, "Why Us", content.whyUs, style);
  ctaSlideLayout(pptx, content.contactCta, style);
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
