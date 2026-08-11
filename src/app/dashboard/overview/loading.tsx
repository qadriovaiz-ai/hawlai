function KpiSkeleton() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-slate-200 mb-3" />
      <div className="h-7 w-14 bg-slate-200 rounded" />
      <div className="h-3 w-20 bg-slate-200 rounded mt-2" />
    </div>
  );
}

export default function OverviewLoading() {
  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-56 bg-slate-200 rounded animate-pulse" />
        <div className="h-4 w-72 bg-slate-200 rounded animate-pulse" />
      </div>

      <div className="card p-5 animate-pulse space-y-3">
        <div className="h-3 w-28 bg-slate-200 rounded" />
        <div className="h-4 w-full max-w-md bg-slate-200 rounded" />
        <div className="h-4 w-full max-w-sm bg-slate-200 rounded" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>

      <div className="card p-5 animate-pulse space-y-3">
        <div className="h-4 w-28 bg-slate-200 rounded" />
        <div className="h-14 w-full bg-slate-200 rounded-lg" />
        <div className="h-14 w-full bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}
