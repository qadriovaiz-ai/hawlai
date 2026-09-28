"use client";

// Connect / Reconnect / Disconnect for Google Search Console.
//
// WHY RECONNECT IS ITS OWN BUTTON: the usual failure here is a scope or
// permission problem — the account was connected before a scope was
// added, or access was removed at Google — and there is nothing the
// owner can do about that from a card that only says "Connected". The
// connect route asks for consent every time, so pressing Reconnect
// genuinely re-prompts and re-issues a refresh token, which is the fix
// for every one of those cases.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ArrowRight, RotateCw, Trash2, XCircle } from "lucide-react";
import { buttonClasses } from "@/components/ui";

export default function SearchConsoleActions({
  connected,
  email,
  property,
}: {
  connected: boolean;
  email: string | null;
  property: string | null;
}) {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(connected);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/search-console/disconnect", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't disconnect — try again.");
        return;
      }
      setIsConnected(false);
      setConfirming(false);
      // The route's own words: access still exists at Google until they
      // remove it there, and saying so is the honest end of this action.
      setNote(data?.note ?? null);
      router.refresh();
    } catch {
      setError("Couldn't reach Hawlai — check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="space-y-2">
        <a href="/api/auth/search-console/connect" className={buttonClasses("secondary", "sm", "w-full justify-center")}>
          Connect <ArrowRight className="w-3 h-3" />
        </a>
        {note && <p className="text-xs text-slate-400">{note}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="flex items-center gap-1.5 text-xs text-green-400">
        <CheckCircle className="w-3.5 h-3.5" /> Connected{email ? ` (${email})` : ""}
      </span>

      {/* Connected and READING are different states, and the card says
          which one this is — "Connected" over a property that reads
          nothing would be a quiet lie. */}
      {property ? (
        <p className="text-xs text-slate-400 break-all">Reading: {property}</p>
      ) : (
        <p className="text-xs text-amber-400">
          No verified property matched this business yet — add your site in Search Console, then press Reconnect.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      {confirming ? (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">
            Disconnect Search Console? Hawlai stops reading your real search terms, and the keyword work goes back to being guesswork.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={disconnect} disabled={working} className="text-xs text-red-400 hover:text-red-500 disabled:opacity-50">
              {working ? "Disconnecting…" : "Yes, disconnect"}
            </button>
            <button onClick={() => setConfirming(false)} disabled={working} className="text-xs text-slate-400 hover:text-slate-600">
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <a href="/api/auth/search-console/connect" className="text-xs text-brand-400 hover:underline flex items-center gap-1">
            <RotateCw className="w-3 h-3" /> Reconnect
          </a>
          <button onClick={() => setConfirming(true)} className="text-xs text-red-400 hover:text-red-500 flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
