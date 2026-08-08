import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        // Inverted slate scale for a dark theme (Emergent-style near-black
        // UI) — every component was already written treating 50 as "the
        // lightest/background shade" and 900 as "the darkest/text shade",
        // so flipping the actual hex values here re-themes the entire app
        // dark without touching a single className anywhere else.
        slate: {
          50: "#0b0b0f",
          100: "#151519",
          200: "#232329",
          300: "#33333c",
          400: "#6b6b76",
          500: "#8c8c98",
          600: "#a7a7b3",
          700: "#c2c2cb",
          800: "#dcdce1",
          900: "#f2f2f4",
        },
        // Marketing-site-only tokens (used on the public landing page,
        // src/components/marketing/*). Deliberately a warm light theme,
        // separate from the dashboard's inverted dark slate scale above —
        // the product itself is dark, the public site selling it is light.
        paper: "#FBF9F6",
        ink: "#171331",
        marigold: "#F2A93B",
        stamp: "#B4232A",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        // Marketing-page-only type roles — distinct key names so they don't
        // collide with the existing global `font-mono` utility already used
        // elsewhere in the dashboard (SeoToolkit, OffersPanel, public site).
        heading: ["var(--font-display)", "sans-serif"],
        code: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [require("@tailwindcss/container-queries")],
};

export default config;
