// Preset color palettes for landing pages — a theme picker, not a
// free-form visual editor. Keeps every page looking intentional
// (real color pairings, not random combinations) while still giving
// dealers a meaningful choice.

export interface LandingTheme {
  key: string;
  label: string;
  bg: string;
  dark: string;
  accent: string;
  accentText: string;
}

export const LANDING_THEMES: Record<string, LandingTheme> = {
  navy_amber: { key: "navy_amber", label: "Navy & Amber", bg: "#FAF8F5", dark: "#122744", accent: "#D9A441", accentText: "#122744" },
  crimson_charcoal: { key: "crimson_charcoal", label: "Crimson & Charcoal", bg: "#FAFAFA", dark: "#1F1B1B", accent: "#C0392B", accentText: "#FFFFFF" },
  forest_cream: { key: "forest_cream", label: "Forest & Cream", bg: "#FBF9F3", dark: "#1E3A2B", accent: "#B08D57", accentText: "#1E3A2B" },
  midnight_sky: { key: "midnight_sky", label: "Midnight & Sky", bg: "#F7F9FC", dark: "#0B1E3D", accent: "#4FA3D1", accentText: "#0B1E3D" },
};

export function getTheme(key?: string | null): LandingTheme {
  return LANDING_THEMES[key ?? ""] ?? LANDING_THEMES.navy_amber;
}
