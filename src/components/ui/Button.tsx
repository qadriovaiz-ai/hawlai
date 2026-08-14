"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Single source of truth for "what does a button look like" — replaces
// both the .btn-primary/.btn-secondary/.btn-danger CSS classes (used
// correctly in ~22 files, mostly the shell/CRM code) AND the
// hand-rolled `bg-purple-600 hover:bg-purple-500 ...` markup that ~19
// department-page files reinvented independently as their own de facto
// "primary button." variant="primary" now renders identically
// everywhere by construction, not by convention.
export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm shadow-brand-600/20 hover:shadow-md hover:shadow-brand-600/30 hover:brightness-110 active:brightness-95 disabled:hover:brightness-100",
  secondary: "bg-slate-100 text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-200 hover:border-slate-300",
  destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  ghost: "text-slate-500 hover:text-slate-900 hover:bg-slate-200",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Shows a spinner and disables the button — the "Generate"/"Save"
  // in-flight state every department page currently hand-rolls with
  // its own {loading ? <Loader2 .../> : <Icon/>} ternary.
  loading?: boolean;
}

// Button only ever renders a real <button> — for a Next <Link> or <a>
// that needs to look like one (e.g. "Upgrade", "Go to My Campaigns"),
// this exposes the exact same class composition so a link-styled-as-
// button can never drift from Button itself, the way a hand-copied
// className would.
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading = false, disabled, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className={size === "sm" ? "w-3.5 h-3.5 animate-spin" : "w-4 h-4 animate-spin"} />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
