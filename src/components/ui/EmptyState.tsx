import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Replaces 30 independently hand-rolled "no X yet" variants (different
// text color scale, size, padding, and structure per file) with one
// consistent treatment.
export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-10 px-4", className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5 text-slate-400" />
        </div>
      )}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="text-xs text-slate-400 mt-1 max-w-xs">{description}</p>}
      {action && (
        <button onClick={action.onClick} className="mt-4 text-xs text-brand-400 hover:underline font-medium">
          {action.label}
        </button>
      )}
    </div>
  );
}
