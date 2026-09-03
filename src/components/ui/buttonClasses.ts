// Button class composition — deliberately NOT a client module.
//
// This file exists because of a production 500. Button.tsx is
// "use client" (it uses forwardRef), and buttonClasses lived inside
// it. A pure string helper exported from a client module is still a
// CLIENT export, so every server component that called it threw:
//
//   Error: Attempted to call buttonClasses() from the server but
//   buttonClasses is on the client.
//
// Thirteen server components did exactly that — every agency page,
// the campaigns page, the queue, both settings pages, the public SEO
// page, and the UpgradeRequired / FeatureUnavailable / RecentActivity
// components. All of them 500'd on render. The build passed the whole
// time, because this is a runtime boundary error and nothing exercised
// those routes.
//
// The function has no React, no hooks, no browser API — nothing that
// needs a client boundary. It only ever lived there because it sat
// next to the component that uses it. Moving it here lets server and
// client share one definition, which was the point of having it at
// all: a link-styled-as-a-button can never drift from Button itself.
//
// Button.tsx imports from here. Do NOT re-export it from Button.tsx —
// re-exporting through a "use client" module reintroduces the exact
// boundary this file removes.

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
export type ButtonSize = "sm" | "md";

export const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm shadow-brand-600/20 hover:shadow-md hover:shadow-brand-600/30 hover:brightness-110 active:brightness-95 disabled:hover:brightness-100",
  secondary: "bg-slate-100 text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-200 hover:border-slate-300",
  destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  ghost: "text-slate-500 hover:text-slate-900 hover:bg-slate-200",
};

export const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
};

/**
 * The exact class composition Button renders, exposed so a Next <Link>
 * or <a> styled as a button cannot drift from the component itself.
 */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className
  );
}
