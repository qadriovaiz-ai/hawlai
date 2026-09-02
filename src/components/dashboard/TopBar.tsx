"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Bell, LogOut, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { fetchWithTimeout } from "@/lib/hooks/fetchWithTimeout";
import { formatRelativeTime } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

interface Props {
  user: User;
  profile: { full_name: string | null; dealerships?: { dealership_name: string } | null } | null;
}

export default function TopBar({ user, profile }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Bounded, and it always settles. The previous version's
    // `.catch(() => {})` could never run for a request that never
    // resolved, so a hang was completely silent — see
    // lib/hooks/fetchWithTimeout.ts.
    let cancelled = false;
    fetchWithTimeout<{ notifications: Notification[]; unreadCount: number }>("/api/notifications", { dedupeKey: "notifications" }).then((res) => {
      if (cancelled) return;
      if (res.error) {
        // The bell is not worth an alarm, but it must not silently
        // claim zero unread when it simply could not look.
        console.warn("[notifications] could not load:", res.error);
        return;
      }
      setNotifications(res.data?.notifications ?? []);
      setUnreadCount(res.data?.unreadCount ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Opening the dropdown IS the acknowledgement — the dot answers
  // "is there anything I haven't seen", and now there isn't.
  async function toggleBell() {
    const opening = !bellOpen;
    setBellOpen(opening);
    if (opening && unreadCount > 0) {
      setUnreadCount(0);
      await fetch("/api/notifications", { method: "PATCH" }).catch(() => {});
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  const displayName = profile?.full_name ?? user.email ?? "User";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="h-16 bg-slate-100 border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
      <div>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={toggleBell}
            aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
            className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5" />
            {/* Real unread state — this dot used to be hardcoded, so it
                was permanently "unread" and the button did nothing. */}
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-slate-100 rounded-lg border border-slate-200 shadow-lg py-1 z-50 max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-3 py-6 text-xs text-slate-400 text-center">Nothing new right now.</p>
              ) : (
                notifications.map((n) => {
                  const inner = (
                    <>
                      <p className="text-xs font-medium text-slate-800 leading-snug">{n.title}</p>
                      {n.body && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-slate-400 mt-1">{formatRelativeTime(n.created_at)}</p>
                    </>
                  );
                  return n.href ? (
                    <a key={n.id} href={n.href} className="block px-3 py-2.5 hover:bg-slate-200 border-b border-slate-200/70 last:border-b-0">
                      {inner}
                    </a>
                  ) : (
                    <div key={n.id} className="px-3 py-2.5 border-b border-slate-200/70 last:border-b-0">{inner}</div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2.5 p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center">
              <span className="text-xs font-semibold text-white">{initials}</span>
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-slate-900 leading-none">{displayName}</p>
              <p className="text-xs text-slate-500 mt-0.5">{profile?.dealerships?.dealership_name ?? "Owner"}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-slate-100 rounded-lg border border-slate-200 shadow-lg py-1 z-50">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
