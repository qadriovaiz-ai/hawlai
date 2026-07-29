"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles, AlertCircle, Clock, CheckCircle2, XCircle, Code2, Copy } from "lucide-react";

interface Scene {
  id: string;
  name: string;
  prompt: string;
  status: "pending" | "ready" | "failed";
  created_at: string;
}

export default function ThreeDStudioView() {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeHtml, setActiveHtml] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingScene, setLoadingScene] = useState(false);
  const [showCode, setShowCode] = useState(false);

  function loadScenes() {
    fetch("/api/3d-scenes").then((r) => r.json()).then((d) => setScenes(d.scenes ?? []));
  }
  useEffect(() => { loadScenes(); }, []);

  async function generate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/3d-scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate the scene");
      setPrompt("");
      loadScenes();
      openScene(data.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function openScene(id: string) {
    setLoadingScene(true);
    setActiveId(id);
    setActiveHtml(null);
    try {
      const res = await fetch(`/api/3d-scenes/${id}`);
      const data = await res.json();
      if (data.scene?.html_code) setActiveHtml(data.scene.html_code);
    } finally {
      setLoadingScene(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          This is genuinely generative code — each scene is freshly written, not a fixed template. Most generations render correctly, but occasionally one comes out broken; if that happens, try rephrasing the prompt or regenerating.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A glass jar candle with a warm glowing flame, slowly rotating, dark elegant background"
          rows={3}
          className="w-full text-sm bg-white text-slate-900 border border-slate-300 rounded-lg px-3 py-2"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button onClick={generate} disabled={generating || !prompt.trim()} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "Writing the 3D scene... (can take a minute)" : "Generate 3D Scene"}
        </button>
      </div>

      {(activeId || loadingScene) && (
        <div className="card p-2 space-y-2">
          {loadingScene ? (
            <div className="aspect-video flex items-center justify-center bg-slate-900 rounded-lg">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : activeHtml ? (
            <>
              <iframe
                srcDoc={activeHtml}
                sandbox="allow-scripts"
                className="w-full aspect-video rounded-lg border-0"
                title="3D scene"
              />
              <div className="flex items-center justify-between px-1">
                <button onClick={() => setShowCode((s) => !s)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <Code2 className="w-3.5 h-3.5" /> {showCode ? "Hide" : "View"} generated code
                </button>
                <button onClick={() => navigator.clipboard.writeText(activeHtml)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5" /> Copy code
                </button>
              </div>
              {showCode && (
                <pre className="text-[10px] bg-slate-900 text-slate-300 p-3 rounded-lg overflow-auto max-h-64 whitespace-pre-wrap">{activeHtml}</pre>
              )}
            </>
          ) : (
            <div className="aspect-video flex items-center justify-center bg-slate-900 rounded-lg text-sm text-slate-400">
              This scene failed to generate — try regenerating with a different prompt.
            </div>
          )}
        </div>
      )}

      {scenes.length > 0 && (
        <div className="card p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Your 3D Scenes</p>
          {scenes.map((s) => (
            <button
              key={s.id}
              onClick={() => s.status === "ready" && openScene(s.id)}
              disabled={s.status !== "ready"}
              className={`w-full flex items-center gap-2 text-left p-2.5 rounded-lg border ${activeId === s.id ? "border-purple-400 bg-purple-50" : "border-slate-200"} ${s.status !== "ready" ? "opacity-60 cursor-default" : "hover:border-purple-300"}`}
            >
              {s.status === "ready" && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
              {s.status === "pending" && <Clock className="w-4 h-4 text-amber-500 shrink-0" />}
              {s.status === "failed" && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
              <span className="text-xs text-slate-600 truncate flex-1">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
