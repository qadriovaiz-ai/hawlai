"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Plus, MessageSquare, Trash2, Menu, Loader2, PanelLeft, X } from "lucide-react";
import Image from "next/image";
import MainMenuPanel from "./MainMenuPanel";

export default function ConversationSidebar({ dealershipName }: { dealershipName: string }) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const params = useParams();
  const activeId = params?.id as string | undefined;

  // Close the drawer automatically whenever the active conversation changes
  // (i.e. after tapping a chat or "New chat" on mobile).
  useEffect(() => setMobileOpen(false), [activeId]);

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
    <>
      {/* Mobile-only toggle button — fixed top-left, only shown below md breakpoint.
          The sidebar itself is hidden off-screen on mobile until this opens it. */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-30 p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 shadow-sm"
        aria-label="Open conversation list"
      >
        <PanelLeft className="w-5 h-5" />
      </button>

      {/* Backdrop — only rendered on mobile while the drawer is open, so it never
          affects desktop layout or intercepts clicks when closed. */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div
        className={`w-64 h-screen bg-slate-50 flex flex-col shrink-0 fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:static md:translate-x-0 md:z-auto`}
      >
      <div className="p-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <Link href="/chat" className="flex items-center gap-2 px-2 py-2">
            <div className="w-6 h-6 rounded-md overflow-hidden shrink-0">
              <Image src="/logo-icon.png" alt="Hawlai" width={24} height={24} className="w-full h-full object-cover" />
            </div>
            <span className="text-sm font-bold text-white">Hawlai</span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-2 text-slate-500 hover:text-white"
            aria-label="Close conversation list"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <button onClick={handleNewChat} className="w-full mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-sm hover:bg-slate-200 transition-colors">
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
                activeId === c.id ? "bg-slate-200 text-white" : "text-slate-700 hover:bg-slate-200/60"
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

      <div className="p-3 border-t border-slate-200">
        <button onClick={() => setMenuOpen(true)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-200/60 transition-colors">
          <Menu className="w-4 h-4" /> Main Menu
        </button>
        <p className="text-xs text-slate-400 px-2.5 pt-1 truncate">{dealershipName}</p>
      </div>
      {menuOpen && <MainMenuPanel onClose={() => setMenuOpen(false)} />}
      </div>
    </>
  );
}
