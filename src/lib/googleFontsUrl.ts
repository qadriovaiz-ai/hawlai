// Builds a Google Fonts CSS2 stylesheet URL, meant to be loaded via a
// <link rel="stylesheet"> rendered in a server component (Next.js App
// Router hoists it into <head> automatically) — a runtime browser fetch,
// not next/font/google's build-time fetch. If fonts.gstatic.com is ever
// unreachable, this just degrades to the CSS fallback font; it can never
// fail `next build` the way next/font/google's fetch does.
export function buildGoogleFontsUrl(fonts: { name: string; weights: string[] }[]): string {
  const families = fonts.map((f) => `family=${encodeURIComponent(f.name)}:wght@${f.weights.join(";")}`).join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
