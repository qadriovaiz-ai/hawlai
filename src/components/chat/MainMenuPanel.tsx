"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { NAV_GROUPS } from "@/lib/navGroups";

export default function MainMenuPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-80 max-w-[85vw] h-full bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 shrink-0">
          <p className="text-sm font-bold text-slate-900">Main Menu</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 mb-1.5">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <item.icon className="w-4 h-4 text-slate-400 shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
