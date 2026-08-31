"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Palette, ExternalLink, Unlink, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button, Card } from "@/components/ui";

export interface CanvaDesignRow {
  id: string;
  canva_design_id: string;
  title: string | null;
  asset_type: string;
  exported_asset_url: string | null;
  status: string;
  created_at: string;
}

// Design & Edit panel — connect flow and design list.
//
// Three states, per the spec: not connected, connecting, connected.
// "Connecting" is a real state here rather than a spinner on the
// button, because the user leaves for Canva's consent screen entirely
// and may come back minutes later, or not at all.

export default function DesignEditPanel({
  initialConnected,
  connectedAt,
  initialDesigns,
  serverReady,
  callbackStatus,
  callbackReason,
}: {
  initialConnected: boolean;
  connectedAt: string | null;
  initialDesigns: CanvaDesignRow[];
  serverReady: boolean;
  callbackStatus: string | null;
  callbackReason: string | null;
}) {
  const router = useRouter();
  const [connected, setConnected] = useState(initialConnected);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(
    callbackStatus === "failed" ? callbackReason ?? "Couldn't connect to Canva." : null
  );
  const [notice, setNotice] = useState<string | null>(
    callbackStatus === "cancelled" ? "Connection cancelled — nothing was changed." : null
  );

  async function handleConnect() {
    setError(null);
    setNotice(null);
    setConnecting(true);
    try {
      const res = await fetch("/api/canva/oauth/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the connection.");
      // Full navigation, not a popup: Canva's consent screen sets its
      // own framing rules and popups get blocked when the click is a
      // step removed from the navigation.
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message);
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    try {
      const res = await fetch("/api/canva/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Couldn't disconnect.");
      setConnected(false);
      setNotice("Canva disconnected. Your existing designs are still here.");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!serverReady) {
    return (
      <Card className="space-y-2">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500" /> Not set up yet
        </p>
        <p className="text-sm text-slate-500">
          Design &amp; Edit needs Canva credentials configured on the server before it can be connected. Nothing you can
          fix from here — this is a one-time setup step.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-300/50 bg-red-500/10 px-3 py-2.5">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
      {notice && !error && (
        <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
          <p className="text-sm text-slate-600">{notice}</p>
        </div>
      )}

      {!connected ? (
        <Card className="space-y-3">
          <div className="w-12 h-12 bg-brand-500/15 rounded-xl flex items-center justify-center">
            <Palette className="w-5 h-5 text-brand-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Connect your Canva account</p>
            <p className="text-sm text-slate-500 mt-1">
              You&apos;ll edit in Canva in a new tab, then bring the finished image or video back here in one click.
              Hawlai only sees the designs you create through it.
            </p>
          </div>
          <Button onClick={handleConnect} loading={connecting} variant="primary">
            {!connecting && <ExternalLink className="w-4 h-4" />}
            {connecting ? "Opening Canva..." : "Connect Canva"}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" /> Canva connected
              </p>
              {connectedAt && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Since {new Date(connectedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
            </div>
            <button
              onClick={handleDisconnect}
              className="text-[10.5px] text-slate-400 hover:text-slate-600 shrink-0 inline-flex items-center gap-1"
            >
              <Unlink className="w-3 h-3" /> Disconnect
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Disconnecting only removes the link from Hawlai — it doesn&apos;t change anything in your Canva account, and
            your designs here stay put.
          </p>
        </Card>
      )}

      {initialDesigns.length > 0 && (
        <Card className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Your designs</p>
          <p className="text-xs text-slate-400">{initialDesigns.length} so far</p>
        </Card>
      )}
    </div>
  );
}
