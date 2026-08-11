// Covers both /chat and /chat/[id] (loading.tsx wraps nested segments
// too) — ConversationSidebar lives in layout.tsx and keeps rendering
// around this, so only the message-thread + composer area needs a
// skeleton here.
export default function ChatLoading() {
  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto px-4 sm:px-6 animate-pulse">
      <div className="flex items-center gap-2.5 py-4 pl-12 md:pl-0 border-b border-slate-200 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-slate-200 shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-40 bg-slate-200 rounded" />
          <div className="h-3 w-64 bg-slate-200 rounded" />
        </div>
      </div>

      <div className="flex-1 py-4 space-y-4">
        <div className="flex gap-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-200 shrink-0" />
          <div className="h-16 w-2/3 rounded-2xl rounded-tl-sm bg-slate-100 border border-slate-200" />
        </div>
        <div className="flex gap-2.5 justify-end">
          <div className="h-10 w-1/2 rounded-2xl rounded-tr-sm bg-slate-200" />
        </div>
        <div className="flex gap-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-200 shrink-0" />
          <div className="h-20 w-3/4 rounded-2xl rounded-tl-sm bg-slate-100 border border-slate-200" />
        </div>
      </div>

      <div className="pt-3 pb-4 border-t border-slate-200 shrink-0">
        <div className="h-11 w-full rounded-xl bg-slate-100 border border-slate-200" />
      </div>
    </div>
  );
}
