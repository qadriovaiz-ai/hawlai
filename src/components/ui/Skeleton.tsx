import { cn } from "@/lib/utils";

// A capability that didn't exist anywhere in the app before this
// (animate-pulse: 0 usages found app-wide) — first paint of every
// department page was previously blank or a bare spinner, never
// content-shaped, which reads as noticeably less finished than the
// Linear/Stripe standard already applied to the shell screens.
// Composable via className (w-*/h-*), same pattern as shadcn/ui —
// deliberately no size/shape variants baked in.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-slate-200 rounded-md", className)} />;
}
