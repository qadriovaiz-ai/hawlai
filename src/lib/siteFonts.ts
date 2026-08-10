// Storefront custom fonts (Site Editor "Font" preset) — used exclusively
// by src/app/site/[slug]/layout.tsx. Previously loaded via
// next/font/google, whose build-time font fetch failing (e.g. a
// fonts.gstatic.com hiccup) took down the entire Vercel build. Switched
// to literal CSS font-family strings + a Google Fonts stylesheet <link>
// loaded at runtime in the browser (see googleFontsUrl.ts) — a fetch
// failure there just falls back to the CSS fallback font instead of
// failing the build.

import { buildGoogleFontsUrl } from "./googleFontsUrl";
import { DEFAULT_FONT_KEY } from "./fontPresets";

interface FontSpec {
  name: string;
  weights: string[];
  fallback: string;
}

const FONT_SPECS: Record<string, FontSpec> = {
  playfair: { name: "Playfair Display", weights: ["600", "700"], fallback: "Georgia, serif" },
  poppins: { name: "Poppins", weights: ["600", "700"], fallback: "sans-serif" },
  merriweather: { name: "Merriweather", weights: ["700"], fallback: "Georgia, serif" },
  montserrat: { name: "Montserrat", weights: ["600", "700"], fallback: "sans-serif" },
  oswald: { name: "Oswald", weights: ["500", "600", "700"], fallback: "sans-serif" },
  inter: { name: "Inter", weights: ["400", "700"], fallback: "sans-serif" },
  lato: { name: "Lato", weights: ["400", "700"], fallback: "sans-serif" },
  nunito: { name: "Nunito", weights: ["400", "700"], fallback: "sans-serif" },
  roboto: { name: "Roboto", weights: ["400", "700"], fallback: "sans-serif" },
};

const PRESETS: Record<string, { heading: string; body: string }> = {
  modern: { heading: "poppins", body: "inter" },
  classic: { heading: "playfair", body: "inter" },
  editorial: { heading: "merriweather", body: "lato" },
  minimal: { heading: "montserrat", body: "nunito" },
  bold: { heading: "oswald", body: "roboto" },
};

function cssFamily(key: string): string {
  const spec = FONT_SPECS[key];
  return `'${spec.name}', ${spec.fallback}`;
}

function resolvePreset(fontKey: string | null | undefined) {
  return PRESETS[fontKey ?? ""] ?? PRESETS[DEFAULT_FONT_KEY];
}

export function getSiteFontFamilies(fontKey: string | null | undefined): { heading: string; body: string } {
  const preset = resolvePreset(fontKey);
  return { heading: cssFamily(preset.heading), body: cssFamily(preset.body) };
}

/** The Google Fonts stylesheet URL for a site's chosen preset — render as <link rel="stylesheet" href={...} /> in the layout. */
export function getSiteFontStylesheetUrl(fontKey: string | null | undefined): string {
  const preset = resolvePreset(fontKey);
  return buildGoogleFontsUrl([FONT_SPECS[preset.heading], FONT_SPECS[preset.body]]);
}
