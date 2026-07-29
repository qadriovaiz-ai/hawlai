"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas, IText, Rect, Circle, Triangle, Line, Polygon, Group, FabricImage, FabricObject, loadSVGFromString } from "fabric";
import { useRouter } from "next/navigation";
import {
  Type, Square, Circle as CircleIcon, Image as ImageIcon, Undo2, Redo2,
  Download, Save, Loader2, Trash2, BringToFront, SendToBack, Palette,
  Check, ArrowLeft, Search, Triangle as TriangleIcon, Minus, Star, Sticker,
} from "lucide-react";

const SIZE_PRESETS = [
  { label: "Instagram Post", w: 1080, h: 1080 },
  { label: "Instagram Story", w: 1080, h: 1920 },
  { label: "Facebook Post", w: 1200, h: 630 },
  { label: "Poster (A4)", w: 1240, h: 1754 },
  { label: "YouTube Thumbnail", w: 1280, h: 720 },
];

const FONT_FAMILIES = ["Arial", "Georgia", "Times New Roman", "Verdana", "Courier New", "Impact"];

interface Props {
  designId: string | null;
}

export default function CanvasEditor({ designId }: Props) {
  const router = useRouter();
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const suppressHistoryRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<FabricObject | null>(null);
  const [designName, setDesignName] = useState("Untitled design");
  const [canvasSize, setCanvasSize] = useState({ w: 1080, h: 1080 });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showStockPhotos, setShowStockPhotos] = useState(false);
  const [showIconLibrary, setShowIconLibrary] = useState(false);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1080);
  const [, forceRerender] = useState(0);

  const pushHistory = useCallback(() => {
    if (suppressHistoryRef.current || !fabricRef.current) return;
    const json = JSON.stringify(fabricRef.current.toJSON());
    const idx = historyIndexRef.current;
    historyRef.current = historyRef.current.slice(0, idx + 1);
    historyRef.current.push(json);
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  function loadHistoryState(index: number) {
    const canvas = fabricRef.current;
    const json = historyRef.current[index];
    if (!canvas || !json) return;
    suppressHistoryRef.current = true;
    canvas.loadFromJSON(JSON.parse(json)).then(() => {
      canvas.renderAll();
      suppressHistoryRef.current = false;
      historyIndexRef.current = index;
    });
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    loadHistoryState(historyIndexRef.current - 1);
  }
  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    loadHistoryState(historyIndexRef.current + 1);
  }

  useEffect(() => {
    if (!canvasElRef.current) return;
    const canvas = new Canvas(canvasElRef.current, {
      width: canvasSize.w,
      height: canvasSize.h,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
    });
    fabricRef.current = canvas;

    const onSelection = () => { setSelected(canvas.getActiveObject() ?? null); };
    const onChange = () => { pushHistory(); forceRerender((n) => n + 1); };

    canvas.on("selection:created", onSelection);
    canvas.on("selection:updated", onSelection);
    canvas.on("selection:cleared", () => setSelected(null));
    canvas.on("object:modified", onChange);
    canvas.on("object:added", onChange);
    canvas.on("object:removed", onChange);

    if (designId) {
      fetch(`/api/canvas-designs/${designId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.design) return;
          setDesignName(d.design.name);
          const w = d.design.canvas_width, h = d.design.canvas_height;
          setCanvasSize({ w, h });
          canvas.setDimensions({ width: w, height: h });
          canvas.backgroundColor = d.design.background_color || "#ffffff";
          const elements = d.design.elements;
          if (elements && Array.isArray(elements) && elements.length > 0) {
            suppressHistoryRef.current = true;
            canvas.loadFromJSON({ objects: elements, background: d.design.background_color }).then(() => {
              canvas.renderAll();
              suppressHistoryRef.current = false;
              pushHistory();
              setReady(true);
            });
          } else {
            pushHistory();
            setReady(true);
          }
        })
        .catch(() => setReady(true));
    } else {
      pushHistory();
      setReady(true);
    }

    return () => { canvas.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addText() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const text = new IText("Double-click to edit", {
      left: canvasSize.w / 2 - 100, top: canvasSize.h / 2 - 20,
      fontSize: 40, fill: "#111111", fontFamily: "Arial",
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  }

  function addRectangle() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const rect = new Rect({ left: canvasSize.w / 2 - 75, top: canvasSize.h / 2 - 50, width: 150, height: 100, fill: "#7c3aed" });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();
  }

  function addCircleShape() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const circle = new Circle({ left: canvasSize.w / 2 - 60, top: canvasSize.h / 2 - 60, radius: 60, fill: "#f59e0b" });
    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.renderAll();
  }

  function addTriangleShape() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const tri = new Triangle({ left: canvasSize.w / 2 - 60, top: canvasSize.h / 2 - 60, width: 120, height: 120, fill: "#10b981" });
    canvas.add(tri);
    canvas.setActiveObject(tri);
    canvas.renderAll();
  }

  function addLineShape() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const line = new Line([0, 0, 200, 0], { left: canvasSize.w / 2 - 100, top: canvasSize.h / 2, stroke: "#111111", strokeWidth: 4 });
    canvas.add(line);
    canvas.setActiveObject(line);
    canvas.renderAll();
  }

  function addStarShape() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const points: { x: number; y: number }[] = [];
    const spikes = 5, outerR = 60, innerR = 26;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / spikes) * i - Math.PI / 2;
      points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
    }
    const star = new Polygon(points, { left: canvasSize.w / 2 - 60, top: canvasSize.h / 2 - 60, fill: "#ec4899" });
    canvas.add(star);
    canvas.setActiveObject(star);
    canvas.renderAll();
  }

  function addIconFromSvg(svgString: string) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    loadSVGFromString(svgString).then(({ objects }) => {
      const valid = objects.filter((o): o is FabricObject => o !== null);
      if (valid.length === 0) return;
      const group = new Group(valid);
      group.set({
        left: canvasSize.w / 2 - 40, top: canvasSize.h / 2 - 40,
        scaleX: 80 / (group.width || 24), scaleY: 80 / (group.height || 24),
        fill: "#111111",
      });
      // lucide icons use stroke, not fill, by default — recolor every sub-path so it responds to the fill-color control
      group.getObjects().forEach((o: any) => { o.set({ stroke: "#111111", fill: "" }); });
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.renderAll();
    });
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const res = await fetch("/api/website-builder/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, kind: "canvas-asset" }),
      });
      const data = await res.json();
      if (data.url) addImageFromUrl(data.url);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function addImageFromUrl(url: string) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    FabricImage.fromURL(url, { crossOrigin: "anonymous" }).then((img) => {
      const scale = Math.min(400 / (img.width ?? 400), 400 / (img.height ?? 400), 1);
      img.set({ left: canvasSize.w / 2 - ((img.width ?? 0) * scale) / 2, top: canvasSize.h / 2 - ((img.height ?? 0) * scale) / 2, scaleX: scale, scaleY: scale });
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
    });
  }

  function deleteSelected() {
    const canvas = fabricRef.current;
    if (!canvas || !selected) return;
    canvas.remove(selected);
    canvas.discardActiveObject();
    canvas.renderAll();
    setSelected(null);
  }

  function bringForward() {
    const canvas = fabricRef.current;
    if (!canvas || !selected) return;
    canvas.bringObjectToFront(selected);
    canvas.renderAll();
  }
  function sendBackward() {
    const canvas = fabricRef.current;
    if (!canvas || !selected) return;
    canvas.sendObjectToBack(selected);
    canvas.renderAll();
  }

  function updateSelectedProp(prop: string, value: any) {
    if (!selected || !fabricRef.current) return;
    selected.set(prop, value);
    fabricRef.current.renderAll();
    forceRerender((n) => n + 1);
  }

  async function saveDesign() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const json = canvas.toJSON();
      const thumbnail = canvas.toDataURL({ format: "png", multiplier: 0.25 });

      let id = designId;
      if (!id) {
        const res = await fetch("/api/canvas-designs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: designName, canvasWidth: canvasSize.w, canvasHeight: canvasSize.h }),
        });
        const data = await res.json();
        id = data.id;
        router.replace(`/design-editor?id=${id}`);
      }

      await fetch(`/api/canvas-designs/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: designName, elements: json.objects, thumbnailUrl: thumbnail }),
      });
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }

  function downloadPng() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${designName || "design"}.png`;
    a.click();
  }

  function applySizePreset(preset: { w: number; h: number }) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setCanvasSize({ w: preset.w, h: preset.h });
    canvas.setDimensions({ width: preset.w, height: preset.h });
    canvas.renderAll();
  }

  const isText = selected?.type === "i-text" || selected?.type === "text";

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/graphic-design")} className="text-slate-400 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <input value={designName} onChange={(e) => setDesignName(e.target.value)} className="text-sm font-semibold text-slate-900 bg-transparent border-none outline-none w-40" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={undo} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"><Undo2 className="w-4 h-4" /></button>
          <button onClick={redo} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"><Redo2 className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <button onClick={downloadPng} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Download
          </button>
          <button onClick={saveDesign} disabled={saving} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedAt ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : savedAt ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 border-r border-slate-200 bg-white p-3 space-y-4 overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Add</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={addText} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-purple-400 text-slate-600">
                <Type className="w-4 h-4" /> <span className="text-[11px]">Text</span>
              </button>
              <button onClick={addRectangle} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-purple-400 text-slate-600">
                <Square className="w-4 h-4" /> <span className="text-[11px]">Rectangle</span>
              </button>
              <button onClick={addCircleShape} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-purple-400 text-slate-600">
                <CircleIcon className="w-4 h-4" /> <span className="text-[11px]">Circle</span>
              </button>
              <button onClick={addTriangleShape} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-purple-400 text-slate-600">
                <TriangleIcon className="w-4 h-4" /> <span className="text-[11px]">Triangle</span>
              </button>
              <button onClick={addStarShape} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-purple-400 text-slate-600">
                <Star className="w-4 h-4" /> <span className="text-[11px]">Star</span>
              </button>
              <button onClick={addLineShape} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-purple-400 text-slate-600">
                <Minus className="w-4 h-4" /> <span className="text-[11px]">Line</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-purple-400 text-slate-600">
                <ImageIcon className="w-4 h-4" /> <span className="text-[11px]">Upload</span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
              <button onClick={() => setShowStockPhotos(true)} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-purple-400 text-slate-600">
                <Search className="w-4 h-4" /> <span className="text-[11px]">Stock Photo</span>
              </button>
              <button onClick={() => setShowIconLibrary(true)} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 hover:border-purple-400 text-slate-600">
                <Sticker className="w-4 h-4" /> <span className="text-[11px]">Icons (1750+)</span>
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Canvas Size</p>
            <div className="space-y-1">
              {SIZE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applySizePreset(p)}
                  className={`w-full text-left text-xs px-2.5 py-2 rounded-lg ${canvasSize.w === p.w && canvasSize.h === p.h ? "bg-purple-100 text-purple-700" : "hover:bg-slate-100 text-slate-600"}`}
                >
                  {p.label} <span className="text-slate-400">({p.w}×{p.h})</span>
                </button>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100">
              <p className="text-[11px] text-slate-400 mb-1.5">Custom size (px)</p>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={50} max={8000} value={customW}
                  onChange={(e) => setCustomW(Number(e.target.value))}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                />
                <span className="text-slate-300 text-xs">×</span>
                <input
                  type="number" min={50} max={8000} value={customH}
                  onChange={(e) => setCustomH(Number(e.target.value))}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                />
              </div>
              <button onClick={() => applySizePreset({ w: customW, h: customH })} className="w-full mt-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-lg">
                Apply custom size
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center overflow-auto p-8 bg-slate-100 relative">
          <div className="shadow-lg" style={{ background: "#fff" }}>
            <canvas ref={canvasElRef} />
          </div>
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}
        </div>

        <div className="w-64 border-l border-slate-200 bg-white p-3 space-y-4 overflow-y-auto">
          {!selected ? (
            <p className="text-xs text-slate-400 text-center py-8">Select an element to edit its properties.</p>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-400 uppercase">Properties</p>

              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-slate-400" />
                <input
                  type="color"
                  value={(selected.get("fill") as string) ?? "#000000"}
                  onChange={(e) => updateSelectedProp("fill", e.target.value)}
                  className="w-8 h-8 rounded border border-slate-200"
                />
                <span className="text-xs text-slate-500">Fill color</span>
              </div>

              {isText && (
                <>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Font (type any font name)</p>
                    <input
                      list="font-suggestions"
                      value={(selected.get("fontFamily") as string) ?? "Arial"}
                      onChange={(e) => updateSelectedProp("fontFamily", e.target.value)}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <datalist id="font-suggestions">
                      {FONT_FAMILIES.map((f) => <option key={f} value={f} />)}
                    </datalist>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Font size</p>
                    <input
                      type="range" min={8} max={200}
                      value={(selected.get("fontSize") as number) ?? 40}
                      onChange={(e) => updateSelectedProp("fontSize", Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => updateSelectedProp("fontWeight", selected.get("fontWeight") === "bold" ? "normal" : "bold")} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold">B</button>
                    <button onClick={() => updateSelectedProp("fontStyle", selected.get("fontStyle") === "italic" ? "normal" : "italic")} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 italic">I</button>
                    <button onClick={() => updateSelectedProp("underline", !selected.get("underline"))} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 underline">U</button>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={!!selected.get("shadow")}
                        onChange={(e) => updateSelectedProp("shadow", e.target.checked ? { color: "rgba(0,0,0,0.4)", blur: 8, offsetX: 3, offsetY: 3 } : null)}
                        className="accent-purple-600"
                      />
                      Drop shadow
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={(selected.get("stroke") as string) ?? "#000000"}
                      onChange={(e) => updateSelectedProp("stroke", e.target.value)}
                      className="w-8 h-8 rounded border border-slate-200"
                    />
                    <input
                      type="range" min={0} max={6}
                      value={(selected.get("strokeWidth") as number) ?? 0}
                      onChange={(e) => updateSelectedProp("strokeWidth", Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-[11px] text-slate-400">Outline</span>
                  </div>
                </>
              )}

              <div>
                <p className="text-xs text-slate-500 mb-1">Opacity</p>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={(selected.get("opacity") as number) ?? 1}
                  onChange={(e) => updateSelectedProp("opacity", Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="flex gap-1.5">
                <button onClick={bringForward} className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 flex items-center justify-center gap-1"><BringToFront className="w-3.5 h-3.5" /> Front</button>
                <button onClick={sendBackward} className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 flex items-center justify-center gap-1"><SendToBack className="w-3.5 h-3.5" /> Back</button>
              </div>

              <button onClick={deleteSelected} className="w-full text-xs px-2 py-1.5 rounded-lg border border-red-200 text-red-500 flex items-center justify-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      {showStockPhotos && (
        <StockPhotoModal onClose={() => setShowStockPhotos(false)} onSelect={(url) => { addImageFromUrl(url); setShowStockPhotos(false); }} />
      )}
      {showIconLibrary && (
        <IconLibraryModal onClose={() => setShowIconLibrary(false)} onSelect={(svg) => { addIconFromSvg(svg); setShowIconLibrary(false); }} />
      )}
    </div>
  );
}

function StockPhotoModal({ onClose, onSelect }: { onClose: () => void; onSelect: (url: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; thumb: string; full: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stock-photos?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.photos ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200 flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search free stock photos..."
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2"
          />
          <button onClick={search} disabled={loading} className="text-sm bg-purple-600 text-white px-3 py-2 rounded-lg disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          {results.length === 0 && !loading && <p className="text-xs text-slate-400 text-center py-8">Search for free stock photos (via Pexels) to add to your design.</p>}
          <div className="grid grid-cols-3 gap-2">
            {results.map((photo) => (
              <button key={photo.id} onClick={() => onSelect(photo.full)} className="rounded-lg overflow-hidden border border-slate-200 hover:border-purple-400">
                <img src={photo.thumb} alt="" className="w-full h-24 object-cover" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IconLibraryModal({ onClose, onSelect }: { onClose: () => void; onSelect: (svg: string) => void }) {
  const [query, setQuery] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/icon-library?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => setNames(d.icons ?? []))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function pick(name: string) {
    setPicking(name);
    try {
      const res = await fetch(`/api/icon-library/${name}`);
      const data = await res.json();
      if (data.svg) onSelect(data.svg);
    } finally {
      setPicking(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 1750+ free icons (e.g. heart, arrow, shopping-cart)..."
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
            autoFocus
          />
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {names.map((name) => (
                <button
                  key={name}
                  onClick={() => pick(name)}
                  disabled={picking === name}
                  title={name}
                  className="aspect-square flex items-center justify-center rounded-lg border border-slate-200 hover:border-purple-400 hover:bg-purple-50 p-2 disabled:opacity-50"
                >
                  {picking === name ? <Loader2 className="w-4 h-4 animate-spin text-purple-500" /> : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/icon-library/${name}?raw=1`} alt={name} className="w-6 h-6" />
                  )}
                </button>
              ))}
              {names.length === 0 && <p className="col-span-6 text-center text-xs text-slate-400 py-8">No icons found — try a different search.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
