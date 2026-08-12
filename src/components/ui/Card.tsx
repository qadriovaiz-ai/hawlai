import { cn } from "@/lib/utils";

// Formalizes the .card CSS class as a component so padding stops being
// re-decided per file (found p-5/p-8/no-padding used interchangeably
// for what's visually the same container across department pages).
export type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-8",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  // Lift-on-hover treatment (was .card-hover) — opt in per-card, not
  // every card should feel clickable.
  hover?: boolean;
}

export function Card({ padding = "md", hover = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-slate-100 rounded-xl border border-slate-200/80 shadow-sm shadow-slate-200/50 transition-shadow duration-200",
        hover && "hover:shadow-md hover:shadow-slate-200/70 hover:-translate-y-0.5 transition-all",
        PADDING_CLASSES[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
