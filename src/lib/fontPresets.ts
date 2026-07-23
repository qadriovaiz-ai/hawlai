// Plain data only — no next/font import here, so this is safe to pull
// into the (client-side) Design panel picker without bloating the
// dashboard bundle with Google Font loaders. The actual font loading
// lives in src/lib/siteFonts.ts, used only by the storefront layout,
// keyed by the same `key` values as here.
//
// Curated pairs only, matching the Theme picker's pattern — a dealer
// picks one of these, never a free-form heading/body combination, so
// they can't accidentally pair two clashing fonts.
export interface FontPresetMeta {
  key: string;
  label: string;
  headingLabel: string;
  bodyLabel: string;
}

export const FONT_PRESETS: FontPresetMeta[] = [
  { key: "modern", label: "Modern Sans", headingLabel: "Poppins", bodyLabel: "Inter" },
  { key: "classic", label: "Classic Serif", headingLabel: "Playfair Display", bodyLabel: "Inter" },
  { key: "editorial", label: "Editorial", headingLabel: "Merriweather", bodyLabel: "Lato" },
  { key: "minimal", label: "Minimal", headingLabel: "Montserrat", bodyLabel: "Nunito" },
  { key: "bold", label: "Bold Display", headingLabel: "Oswald", bodyLabel: "Roboto" },
];

export const DEFAULT_FONT_KEY = "modern";
