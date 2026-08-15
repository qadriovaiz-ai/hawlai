import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Replaces 30 independently hand-rolled "no X yet" variants (different
// text color scale, size, padding, and structure per file) with one
// consistent treatment.
//
// tone covers the one real exception to "empty state = neutral
// absence": a positive completion state ("All caught up", zero
// pending items) reads wrong with a neutral gray icon — it needs the
// same reassuring-green signal Badge's "positive" tone already gives
// everywhere else. Defaults to the original hardcoded neutral classes
// exactly, so every existing caller renders byte-for-byte unchanged.
export type EmptyStateTone = "neutral" | "positive" | "warning" | "negative";

const ICON_TONE_CLASSES: Record<EmptyStateTone, string> = {
  neutral: "bg-slate-200 text-slate-400",
  positive: "bg-green-500/10 text-green-400",
  warning: "bg-amber-500/10 text-amber-400",
  negative: "bg-red-500/10 text-red-400",
};

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  tone?: EmptyStateTone;
  // Most real empty-state CTAs are "go do X elsewhere" navigation
  // (Launch an ad, go to Leads), not an in-place click handler — href
  // covers that without a page needing its own client-component
  // wrapper just to get a Link into an EmptyState.
  action?: { label: string; onClick?: () => void; href?: string };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, tone = "neutral", action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-10 px-4", className)}>
      {Icon && (
        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mb-3", ICON_TONE_CLASSES[tone])}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="text-xs text-slate-400 mt-1 max-w-xs">{description}</p>}
      {action?.href ? (
        <Link href={action.href} className="mt-4 text-xs text-brand-400 hover:underline font-medium">
          {action.label}
        </Link>
      ) : action?.onClick ? (
        <button onClick={action.onClick} className="mt-4 text-xs text-brand-400 hover:underline font-medium">
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
