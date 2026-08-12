"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// Formalizes .input as a component. This structurally closes off the
// exact invisible-text bug class (bg-white + text-slate-900, or a
// missing text class entirely) fixed across 16 files earlier this
// session — one component enforces the bg/text pairing, so a future
// department page literally cannot hand-type a colliding pair again.
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "block w-full px-3 py-2 text-sm text-slate-900 bg-slate-100 border border-slate-300 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition-all duration-150",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
