// ------------------------------------------------------------------
// Brand Kit Agent — Phase 4
// ------------------------------------------------------------------
// Pure text-to-image logo concept generation via Gemini (already
// connected for ad creative image generation elsewhere — this is the
// same API, just without an input photo to edit, since a logo isn't
// based on an existing image).
// ------------------------------------------------------------------

import { logGeminiImageUsage } from "../usage/logUsage";
import type { BrandColor } from "./brandBuildingAgent";

interface BrandProfile {
  tone_of_voice?: string | null;
  messaging_pillars?: string[] | null;
}

// Deterministic tone -> mark-structure translation. Without this, every
// logo defaults to the same "icon + wordmark, simple, memorable" template
// regardless of what the business actually sounds like — this maps the
// same tone_of_voice signal Brand Voice already collects onto a concrete
// structural direction (wordmark vs. icon vs. combination mark, geometric
// vs. organic, serif vs. sans) instead of leaving it to chance.
function inferMarkStyle(tone: string | null | undefined): { structure: string; form: string; typeStyle: string } {
  const t = (tone ?? "").toLowerCase();
  if (/luxury|premium|elegant|upscale|refined|sophisticat/.test(t)) {
    return {
      structure: "a wordmark, or a restrained combination mark (a small icon paired with the wordmark — the icon should never be louder than the name)",
      form: "precise geometric construction with generous letterspacing, nothing playful or hand-drawn",
      typeStyle: "a thin-weight serif or a high-contrast modern sans",
    };
  }
  if (/playful|fun|friendly|youthful|quirky|cheerful|vibrant/.test(t)) {
    return {
      structure: "an icon-led combination mark, the icon can carry real personality",
      form: "organic, rounded shapes — slight asymmetry is fine and welcome here",
      typeStyle: "a rounded, humanist sans-serif",
    };
  }
  if (/bold|energetic|edgy|confident|dynamic/.test(t)) {
    return {
      structure: "a strong standalone icon or monogram that reads clearly even without the wordmark next to it",
      form: "geometric, angular construction with real contrast — no soft gradients or timid, thin shapes",
      typeStyle: "a heavy-weight geometric sans",
    };
  }
  if (/traditional|trusted|classic|heritage|reliable|honest|dependable/.test(t)) {
    return {
      structure: "a combination mark — icon paired with the wordmark; a simple emblem/badge frame is fine if it doesn't read as a generic stock template",
      form: "balanced, symmetrical geometry",
      typeStyle: "a sturdy slab-serif or a classic serif",
    };
  }
  if (/minimal|clean|calm|simple|understated|modern/.test(t)) {
    return {
      structure: "a wordmark, or a single-shape abstract icon if the business name is long",
      form: "reduced to the fewest shapes that still read clearly, generous negative space",
      typeStyle: "a clean, low-contrast grotesque sans",
    };
  }
  return {
    structure: "reason about wordmark vs. icon vs. combination mark from the business name's length and the category below — don't default to icon+wordmark automatically",
    form: "let the business category, not a generic template, decide geometric vs. organic construction",
    typeStyle: "pick a typeface style this specific category's customers would find credible, not a default sans",
  };
}

function formatBrandColors(colors?: BrandColor[] | null): string {
  if (!colors || colors.length === 0) return "";
  return ` This business already has an established color palette — use it exactly, don't invent a new one: ${colors.map((c) => `${c.name} ${c.hex} (${c.role})`).join(", ")}.`;
}

export async function generateLogoConcept(
  dealershipName: string,
  brandProfile?: BrandProfile | null,
  businessCategory: string = "car dealership",
  logContext?: { supabase: any; dealershipId: string },
  existingBrandColors?: BrandColor[] | null
): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const toneHint = brandProfile?.tone_of_voice ? ` The brand feels: ${brandProfile.tone_of_voice}.` : "";
  const style = inferMarkStyle(brandProfile?.tone_of_voice);
  const colorHint = formatBrandColors(existingBrandColors);

  const prompt = `Design a real, considered logo — not a generic template — for an Indian ${businessCategory} business named "${dealershipName}".${toneHint}

Mark structure: ${style.structure}.
Form language: ${style.form}.
Typography: ${style.typeStyle}.

Color: ${colorHint || `Choose a palette deliberately, not by default — pick 1-2 colors whose psychology genuinely fits both the ${businessCategory} category and the brand feel above (what that color communicates about trust, energy, price point, or tradition for THIS kind of business specifically) — reason about that fit before settling on the final palette.`}

Before finalizing, identify 2-3 visual clichés that are overused specifically in the ${businessCategory} category (the obvious, first-idea symbol every competitor in this category already uses) and deliberately avoid them — the mark should feel specific to this business, not interchangeable with any other ${businessCategory} logo.

Technical requirements — this has to work as a real brand asset, not just look good at one size:
- Must stay legible and recognizable shrunk down to favicon size (roughly 32x32px) — avoid fine detail, thin strokes, or small text that disappears at that scale.
- Must work as a single flat color (imagine it silhouetted in pure black) with no loss of meaning — don't rely on a gradient or multiple colors to read correctly.
- Must work enlarged on physical signage — no fragile thin lines that would look weak blown up large.
- Must work on both a light and a dark background.

Present it on a plain white background, print-ready, high contrast, no mockup/3D bevel effects — the flat logo mark itself.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Gemini request failed");
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: any) => p.inlineData || p.inline_data);
  const inline = imagePart?.inlineData ?? imagePart?.inline_data;
  if (!inline?.data) throw new Error("Gemini did not return an image — try rephrasing or try again");
  if (logContext) await logGeminiImageUsage(logContext.supabase, logContext.dealershipId, "logo_generation");
  return Buffer.from(inline.data, "base64");
}
