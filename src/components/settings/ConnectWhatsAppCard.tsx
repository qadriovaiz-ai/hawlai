"use client";

import { useState } from "react";
import { Loader2, CheckCircle, MessageCircle } from "lucide-react";

export default function ConnectWhatsAppCard({ initiallyConnected, connectedNumber }: { initiallyConnected: boolean; connectedNumber?: string | null }) {
  const [connected, setConnected] = useState(initiallyConnected);
  const [step, setStep] = useState<"idle" | "waiting_code">("idle");
  const [phone, setPhone] = useState("");
  const [instruction, setInstruction] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp-connect/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start");
      setInstruction(data.instruction);
      setStep("waiting_code");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp-connect/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't verify");
      setConnected(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 bg-green-500/20 rounded-lg flex items-center justify-center shrink-0">
          <MessageCircle className="w-4 h-4 text-green-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Control Hawlai from WhatsApp</p>
          <p className="text-xs text-slate-400">Talk to Master Chat, get previews, and approve things — all from your own WhatsApp</p>
        </div>
      </div>

      {connected ? (
        <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Connected ({connectedNumber})</span>
      ) : step === "idle" ? (
        <div className="space-y-2">
          <input
            type="tel"
            placeholder="Your WhatsApp number, e.g. 9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={start} disabled={loading || !phone.trim()} className="btn-secondary text-xs w-full justify-center">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Start
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">{instruction}</p>
          <input
            type="text"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={verify} disabled={loading || !code.trim()} className="btn-secondary text-xs w-full justify-center">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Verify
          </button>
        </div>
      )}
    </div>
  );
}
