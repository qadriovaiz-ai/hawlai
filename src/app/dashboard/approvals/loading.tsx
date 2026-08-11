function SkeletonCard() {
  return (
    <div className="card p-5 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-32 bg-slate-200 rounded" />
        <div className="h-3 w-12 bg-slate-200 rounded" />
      </div>
      <div className="h-7 w-40 bg-slate-200 rounded" />
      <div className="h-3 w-56 bg-slate-200 rounded" />
      <div className="flex gap-2">
        <div className="h-5 w-24 bg-slate-200 rounded-full" />
        <div className="h-5 w-20 bg-slate-200 rounded-full" />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80">
        <div className="h-8 w-20 bg-slate-200 rounded-lg" />
        <div className="h-8 w-24 bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}

export default function ApprovalsLoading() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-200 rounded-xl animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-56 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
