"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Plus, MessageSquare, Trash2, LayoutGrid, Loader2 } from "lucide-react";
import Image from "next/image";

export default function ConversationSidebar({ dealershipName }: { dealershipName: string }) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useParams();
  const activeId = params?.id as string | undefined;

  function load() {
    fetch("/api/chat/conversations").then((r) => r.json()).then((d) => setConversations(d.conversations ?? [])).finally(() => setLoading(false));
  }
  useEffect(load, []);

  function handleNewChat() {
    router.push("/chat");
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) router.push("/chat");
  }

  return (
    <div className="w-64 h-screen bg-slate-900 flex flex-col shrink-0">
      <div className="p-3 border-b border-slate-800">
        <Link href="/chat" className="flex items-center gap-2 px-2 py-2">
          <div className="w-6 h-6 rounded-md overflow-hidden shrink-0">
            <Image src="/logo-icon.png" alt="Hawlai" width={24} height={24} className="w-full h-full object-cover" />
          </div>
          <span className="text-sm font-bold text-white">Hawlai</span>
        </Link>
        <button onClick={handleNewChat} className="w-full mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-200 text-sm hover:bg-slate-800 transition-colors">
          <Plus className="w-4 h-4" /> New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8 px-2">No conversations yet — say hi!</p>
        ) : (
          conversations.map((c) => (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm truncate transition-colors ${
                activeId === c.id ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <span className="flex-1 truncate">{c.title || "New chat"}</span>
              <button onClick={(e) => handleDelete(e, c.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Link>
          ))
        )}
      </div>

      <div className="p-3 border-t border-slate-800">
        <Link href="/dashboard/overview" className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800/60 transition-colors">
          <LayoutGrid className="w-4 h-4" /> Full Dashboard
        </Link>
        <p className="text-xs text-slate-600 px-2.5 pt-1 truncate">{dealershipName}</p>
      </div>
    </div>
  );
}
