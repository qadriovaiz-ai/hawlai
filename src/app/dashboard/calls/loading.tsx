export default function CallsLoading() {
  return (
    <div className="max-w-6xl space-y-5 animate-pulse">
      <div className="space-y-1.5">
        <div className="h-7 w-40 bg-slate-200 rounded" />
        <div className="h-4 w-56 bg-slate-200 rounded" />
      </div>

      <div className="card p-5 h-24" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 h-20" />
        ))}
      </div>

      <div className="card p-4 h-64" />
    </div>
  );
}
