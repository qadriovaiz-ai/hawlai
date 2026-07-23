import { Playfair_Display, Poppins, Merriweather, Montserrat, Oswald, Inter, Lato, Nunito, Roboto } from "next/font/google";
import { DEFAULT_FONT_KEY } from "./fontPresets";

// Server-only — used exclusively by src/app/site/[slug]/layout.tsx.
// next/font/google fonts must be statically declared (the subsetting
// happens at build time), so runtime "pick a Google Font by name"
// isn't possible — instead every preset's fonts are pre-loaded here
// once, and the layout just selects which pre-loaded family to apply
// based on the website's font_key. Kept out of src/lib/fontPresets.ts
// (which the client-side Design panel picker also imports) so that
// picker doesn't pull nine font loaders into the dashboard bundle just
// to show preset labels.

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "700"] });
const poppins = Poppins({ subsets: ["latin"], weight: ["600", "700"] });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["700"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["600", "700"] });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"] });
const inter = Inter({ subsets: ["latin"] });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"] });
const nunito = Nunito({ subsets: ["latin"] });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "700"] });

const FONT_FAMILIES: Record<string, { heading: string; body: string }> = {
  modern: { heading: poppins.style.fontFamily, body: inter.style.fontFamily },
  classic: { heading: playfair.style.fontFamily, body: inter.style.fontFamily },
  editorial: { heading: merriweather.style.fontFamily, body: lato.style.fontFamily },
  minimal: { heading: montserrat.style.fontFamily, body: nunito.style.fontFamily },
  bold: { heading: oswald.style.fontFamily, body: roboto.style.fontFamily },
};

export function getSiteFontFamilies(fontKey: string | null | undefined): { heading: string; body: string } {
  return FONT_FAMILIES[fontKey ?? ""] ?? FONT_FAMILIES[DEFAULT_FONT_KEY];
}
