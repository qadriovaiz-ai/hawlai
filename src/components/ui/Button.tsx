"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
// buttonClasses lives in a NON-client module. Re-exporting it from
// here would put it back behind the "use client" boundary and
// reintroduce the server-side 500 this split fixed — import it from
// "@/components/ui" (which re-exports the clean one) or directly.
import { buttonClasses, type ButtonVariant, type ButtonSize } from "./buttonClasses";

// Single source of truth for "what does a button look like" — replaces
// both the .btn-primary/.btn-secondary/.btn-danger CSS classes (used
// correctly in ~22 files, mostly the shell/CRM code) AND the
// hand-rolled `bg-purple-600 hover:bg-purple-500 ...` markup that ~19
// department-page files reinvented independently as their own de facto
// "primary button." variant="primary" now renders identically
// everywhere by construction, not by convention.
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Shows a spinner and disables the button — the "Generate"/"Save"
  // in-flight state every department page currently hand-rolls with
  // its own {loading ? <Loader2 .../> : <Icon/>} ternary.
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading = false, disabled, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        // Composed through buttonClasses rather than repeating the
        // base string and both lookup tables — they were duplicated
        // here and in that function, free to drift apart.
        className={buttonClasses(variant, size, className)}
        {...props}
      >
        {loading && <Loader2 className={size === "sm" ? "w-3.5 h-3.5 animate-spin" : "w-4 h-4 animate-spin"} />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
