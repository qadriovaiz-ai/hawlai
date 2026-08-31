"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Palette, ExternalLink, Unlink, AlertCircle, CheckCircle2, Download, Loader2, RotateCcw } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";

export interface CanvaDesignRow {
  id: string;
  canva_design_id: string;
  title: string | null;
  asset_type: string;
  exported_asset_url: string | null;
  status: string;
  created_at: string;
}

// Sizes a dealer actually posts at, rather than Canva's full preset
// list — the point of this screen is to get them into the editor fast.
const SIZES = [
  { label: "Square post", width: 1080, height: 1080 },
  { label: "Story / Reel", width: 1080, height: 1920 },
  { label: "Ad banner", width: 1200, height: 628 },
  { label: "Thumbnail", width: 1280, height: 720 },
];

export default function DesignEditPanel({
  initialConnected,
  connectedAt,
  initialDesigns,
  serverReady,
  callbackStatus,
  callbackReason,
  sourceImageUrl,
  sourceTitle,
}: {
  initialConnected: boolean;
  connectedAt: string | null;
  initialDesigns: CanvaDesignRow[];
  serverReady: boolean;
  callbackStatus: string | null;
  callbackReason: string | null;
  /** Set when arriving from an "Edit in Canva" link on an existing asset. */
  sourceImageUrl: string | null;
  sourceTitle: string | null;
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

  const [title, setTitle] = useState(sourceTitle ?? "");
  const [size, setSize] = useState(SIZES[0]);
  const [assetType, setAssetType] = useState<"image" | "video">("image");
  const [creating, setCreating] = useState(false);

  const [designs, setDesigns] = useState<CanvaDesignRow[]>(initialDesigns);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Cleared on unmount so a poll can't keep running against a page
  // that's gone and then setState into a dead component.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function handleConnect() {
    setError(null);
    setNotice(null);
    setConnecting(true);
    try {
      const res = await fetch("/api/canva/oauth/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the connection.");
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

  async function handleCreate() {
    setError(null);
    setNotice(null);
    setCreating(true);

    // Opened synchronously, before the await. A tab opened after an
    // async response is no longer tied to the user's click and browsers
    // block it as a popup — the design would be created in Canva with
    // no way for the user to reach it.
    const tab = window.open("about:blank", "_blank");

    try {
      const res = await fetch("/api/canva/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          width: size.width,
          height: size.height,
          assetType,
          ...(sourceImageUrl ? { sourceImageUrl } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create that design.");

      if (tab) tab.location.href = data.editUrl;
      else window.location.href = data.editUrl; // popup blocked anyway — fall back rather than strand them

      setTitle("");
      setNotice("Opened in Canva. Come back here when you're done and choose Bring into Hawlai.");
      router.refresh();
    } catch (err: any) {
      tab?.close();
      setError(err.message);
      if (err.message?.includes("Connect Canva")) setConnected(false);
    } finally {
      setCreating(false);
    }
  }

  function pollExport(rowId: string, jobId: string, attempt = 0) {
    // ~2 minutes at 3s. An MP4 can genuinely take that long; past it
    // the user gets their time back and a retry rather than a spinner
    // that never resolves.
    if (attempt > 40) {
      setBusyId(null);
      setError("That export is taking unusually long. It may still finish — try Bring into Hawlai again in a moment.");
      return;
    }

    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/canva/export", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designRowId: rowId, jobId }),
        });
        const data = await res.json();

        if (data.status === "in_progress") return pollExport(rowId, jobId, attempt + 1);

        setBusyId(null);
        if (data.status === "ready") {
          setDesigns((prev) =>
            prev.map((d) => (d.id === rowId ? { ...d, status: "ready", exported_asset_url: data.url } : d))
          );
          setNotice("Saved into Hawlai — it's in your library now.");
        } else {
          setDesigns((prev) => prev.map((d) => (d.id === rowId ? { ...d, status: "failed" } : d)));
          setError(data.error ?? "That export didn't finish.");
        }
      } catch {
        setBusyId(null);
        setError("Lost contact while saving that design. Please try again.");
      }
    }, 3000);
    timers.current.push(t);
  }

  async function handleExport(row: CanvaDesignRow) {
    setError(null);
    setNotice(null);
    setBusyId(row.id);
    try {
      const res = await fetch("/api/canva/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designRowId: row.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start that export.");
      setDesigns((prev) => prev.map((d) => (d.id === row.id ? { ...d, status: "exporting" } : d)));
      pollExport(row.id, data.jobId);
    } catch (err: any) {
      setBusyId(null);
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
        <>
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
              Disconnecting only removes the link from Hawlai — it doesn&apos;t change anything in your Canva account.
            </p>
          </Card>

          <Card className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">{sourceImageUrl ? "Edit this image" : "New design"}</p>

            {/* Arrived from an "Edit in Canva" link on an existing
                asset. Shown as a thumbnail so it's obvious WHICH image
                is about to open, rather than trusting a URL parameter
                the user never saw. */}
            {sourceImageUrl && (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-100 p-2">
                <img src={sourceImageUrl} alt="" className="w-14 h-14 rounded object-cover border border-slate-200" />
                <p className="text-xs text-slate-500">
                  This image opens in Canva ready to edit. The original stays untouched in your library.
                </p>
              </div>
            )}

            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's this for? e.g. Diwali offer post" />

            <div className="flex flex-wrap gap-1.5">
              {SIZES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setSize(s)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${
                    size.label === s.label
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {s.label} <span className="opacity-60">{s.width}×{s.height}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(["image", "video"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAssetType(t)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors capitalize ${
                    assetType === t
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[10.5px] text-slate-400">
              This decides the file you get back — a PNG for image, an MP4 for video. You can still add video clips to
              either inside Canva.
            </p>

            <Button onClick={handleCreate} loading={creating} variant="primary">
              {!creating && <ExternalLink className="w-4 h-4" />}
              Open in Canva
            </Button>
          </Card>

          <Card className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">Your designs</p>

            {designs.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                Nothing yet — your first design will appear here once you open one in Canva.
              </p>
            ) : (
              <div className="space-y-2">
                {designs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-200/70 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">{d.title ?? "Untitled design"}</p>
                      <p className="text-[10.5px] text-slate-400">
                        {d.asset_type === "video" ? "Video" : "Image"} ·{" "}
                        {new Date(d.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        {d.status === "failed" && <span className="text-red-500"> · didn&apos;t export</span>}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {d.exported_asset_url && d.status === "ready" ? (
                        <a
                          href={d.exported_asset_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10.5px] text-brand-500 hover:text-brand-400 inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> Open file
                        </a>
                      ) : busyId === d.id || d.status === "exporting" ? (
                        <span className="text-[10.5px] text-slate-400 inline-flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                        </span>
                      ) : null}

                      {/* Always offered, even once ready — a design edited
                          again in Canva needs re-importing, and there's no
                          signal telling us it changed. */}
                      <button
                        onClick={() => handleExport(d)}
                        disabled={busyId === d.id}
                        className="text-[10.5px] text-slate-500 hover:text-slate-700 disabled:opacity-40 inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {d.status === "ready" ? "Re-import" : "Bring into Hawlai"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
