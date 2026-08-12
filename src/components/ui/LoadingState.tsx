import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Replaces the "spinner + text" idiom independently copy-pasted in 26+
// files (with inconsistent wrapper padding — some inside a card, some
// not, some py-4, some py-8).
export function LoadingState({ label = "Loading...", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-slate-400 py-4", className)}>
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </div>
  );
}
