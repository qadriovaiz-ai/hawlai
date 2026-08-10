import type { Metadata } from "next";
import "./globals.css";
import { buildGoogleFontsUrl } from "@/lib/googleFontsUrl";

// Previously next/font/google's Inter — its build-time font fetch
// failing (fonts.gstatic.com hiccup) took down the whole Vercel build,
// for every single page since this is the root layout. Loaded as a
// runtime stylesheet <link> instead (see googleFontsUrl.ts); `font-sans`
// (tailwind.config.ts: Inter, system-ui, sans-serif) applies the family
// with the same fallback next/font would have used, and a Google Fonts
// outage just falls back to system-ui instead of failing the build.
const interStylesheetUrl = buildGoogleFontsUrl([{ name: "Inter", weights: ["400", "500", "600", "700"] }]);

export const metadata: Metadata = {
  title: "Hawlai — AI Marketing Operating System",
  description: "AI-powered marketing automation, lead qualification, and advertising platform for any business",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href={interStylesheetUrl} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
