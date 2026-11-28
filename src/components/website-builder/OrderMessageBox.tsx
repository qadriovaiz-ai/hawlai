"use client";

// O5 (28 Nov 2026): the seller messages the customer of an Instagram
// order — "your order has shipped". The server says what Instagram allows
// right now and offers a draft; the seller reads it, may change it, and
// sends it. Every result shown is the server's answer, never a hope.

import { useState } from "react";

type State = { mode: "normal" | "human_agent" | "closed"; why: string | null; draft: string | null };

export default function OrderMessageBox({ orderId, status }: { orderId: string; status: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setNote(null);
    const res = await fetch(`/api/orders/${orderId}/message`).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      setError(d?.error ?? "Couldn't check what Instagram allows right now.");
      return;
    }
    setState(d);
    setText(d.draft ?? "");
  }

  async function send() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => null);
      const d = await res?.json().catch(() => ({}));
      if (!res?.ok) setError(d?.error ?? "The message wasn't sent.");
      else setNote(d.note ?? "Sent.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="text-[10px] text-purple-500 hover:underline"
      >
        Message customer{status === "shipped" || status === "delivered" ? ` (${status})` : ""}
      </button>
    );
  }

  return (
    <div className="w-full mt-2 space-y-1.5 border-t border-slate-200 pt-2">
      {!state && !error && <p className="text-[11px] text-slate-400">Checking what Instagram allows…</p>}
      {state?.mode === "closed" && <p className="text-[11px] text-amber-700">{state.why}</p>}
      {state?.mode === "human_agent" && (
        <p className="text-[11px] text-slate-500">
          The customer last wrote over a day ago. Instagram allows this only as a message from you personally, up to 7 days after their last message.
        </p>
      )}
      {state && state.mode !== "closed" && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Write to the customer…"
            className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="flex gap-2">
            <button onClick={send} disabled={busy || !text.trim()} className="text-xs px-3 py-1 rounded-lg bg-purple-600 text-white disabled:opacity-50">
              {busy ? "Sending…" : "Send on Instagram"}
            </button>
            <button onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">Close</button>
          </div>
        </>
      )}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      {note && <p className="text-[11px] text-green-600">{note}</p>}
    </div>
  );
}
