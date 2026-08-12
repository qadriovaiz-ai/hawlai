import { cn } from "@/lib/utils";

// Formalizes .badge (structure only, no color — every prior usage had
// to pick its own color pairing) into a component where tone bakes the
// color in. Directly closes the CroView-vs-SEO "impact" pill mismatch:
// both call <Badge tone="negative"> and get identical output, instead
// of one hand-typing solid light-mode bg-red-100/text-red-600 and the
// other hand-typing translucent dark-theme bg-red-500/10/text-red-400
// for the same concept. Translucent tones are the correct choice here —
// they're what already reads right against this app's near-black .card
// background (confirmed against tailwind.config.ts's inverted slate
// scale), not the solid light-mode shades some older components used.
export type BadgeTone = "positive" | "warning" | "negative" | "neutral" | "brand";

const TONE_CLASSES: Record<BadgeTone, string> = {
  positive: "bg-green-500/10 text-green-400 border-green-700/30",
  warning: "bg-amber-500/10 text-amber-400 border-amber-700/30",
  negative: "bg-red-500/10 text-red-400 border-red-700/30",
  neutral: "bg-slate-200 text-slate-500 border-slate-300",
  brand: "bg-brand-500/10 text-brand-400 border-brand-700/30",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", TONE_CLASSES[tone], className)}
      {...props}
    >
      {children}
    </span>
  );
}
