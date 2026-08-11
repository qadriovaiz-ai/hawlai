export default function QueueLoading() {
  return (
    <div className="max-w-5xl space-y-5 animate-pulse">
      <div className="space-y-1.5">
        <div className="h-7 w-32 bg-slate-200 rounded" />
        <div className="h-4 w-64 bg-slate-200 rounded" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4 h-20" />
        ))}
      </div>
    </div>
  );
}
