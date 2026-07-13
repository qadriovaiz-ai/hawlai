"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, RotateCw, FlipHorizontal, Type, Trash2, Check, Plus, Minus } from "lucide-react";

interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

type CropAspect = "original" | "square" | "portrait" | "landscape";

const CROP_OPTIONS: { key: CropAspect; label: string; ratio: number | null }[] = [
  { key: "original", label: "Original", ratio: null },
  { key: "square", label: "Square", ratio: 1 },
  { key: "portrait", label: "Portrait", ratio: 4 / 5 },
  { key: "landscape", label: "Landscape", ratio: 16 / 9 },
];

export default function PhotoEditor({
  imageBase64,
  onSave,
  onClose,
}: {
  imageBase64: string;
  onSave: (editedBase64: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const draggingId = useRef<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const [loaded, setLoaded] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [cropAspect, setCropAspect] = useState<CropAspect>("original");
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load the source image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setLoaded(true);
    };
    img.src = imageBase64;
  }, [imageBase64]);

  function getRotatedSource(): HTMLCanvasElement {
    const img = imgRef.current!;
    const swap = rotation === 90 || rotation === 270;
    const rc = document.createElement("canvas");
    rc.width = swap ? img.height : img.width;
    rc.height = swap ? img.width : img.height;
    const rctx = rc.getContext("2d")!;
    rctx.translate(rc.width / 2, rc.height / 2);
    rctx.rotate((rotation * Math.PI) / 180);
    if (flipH) rctx.scale(-1, 1);
    rctx.drawImage(img, -img.width / 2, -img.height / 2);
    return rc;
  }

  function getCropDimensions(sourceW: number, sourceH: number): [number, number] {
    const opt = CROP_OPTIONS.find((o) => o.key === cropAspect)!;
    if (!opt.ratio) {
      const maxDim = 1080;
      const scale = Math.min(maxDim / sourceW, maxDim / sourceH, 1) || maxDim / Math.max(sourceW, sourceH);
      return sourceW >= sourceH ? [maxDim, Math.round(maxDim * (sourceH / sourceW))] : [Math.round(maxDim * (sourceW / sourceH)), maxDim];
    }
    const long = 1080;
    return opt.ratio >= 1 ? [long, Math.round(long / opt.ratio)] : [Math.round(long * opt.ratio), long];
  }

  const render = useCallback(() => {
    if (!loaded || !canvasRef.current) return;
    const rotatedSource = getRotatedSource();
    const [targetW, targetH] = getCropDimensions(rotatedSource.width, rotatedSource.height);

    const canvas = canvasRef.current;
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, targetW, targetH);

    const scale = Math.max(targetW / rotatedSource.width, targetH / rotatedSource.height);
    const scaledW = rotatedSource.width * scale;
    const scaledH = rotatedSource.height * scale;
    const offsetX = (targetW - scaledW) / 2;
    const offsetY = (targetH - scaledH) / 2;

    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.drawImage(rotatedSource, offsetX, offsetY, scaledW, scaledH);
    ctx.filter = "none";

    textLayers.forEach((t) => {
      ctx.font = `bold ${t.fontSize}px Arial, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.textBaseline = "top";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      ctx.fillText(t.text, t.x, t.y);
      ctx.shadowBlur = 0;
      if (t.id === selectedTextId) {
        const metrics = ctx.measureText(t.text);
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(t.x - 6, t.y - 6, metrics.width + 12, t.fontSize + 12);
        ctx.setLineDash([]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, brightness, contrast, saturation, rotation, flipH, cropAspect, textLayers, selectedTextId]);

  useEffect(() => {
    render();
  }, [render]);

  function addText() {
    const canvas = canvasRef.current;
    const newLayer: TextLayer = {
      id: `t${Date.now()}`,
      text: "Your text here",
      x: (canvas?.width ?? 1080) / 2 - 80,
      y: (canvas?.height ?? 1080) / 2,
      fontSize: 48,
      color: "#ffffff",
    };
    setTextLayers((prev) => [...prev, newLayer]);
    setSelectedTextId(newLayer.id);
  }

  function updateSelectedText(patch: Partial<TextLayer>) {
    setTextLayers((prev) => prev.map((t) => (t.id === selectedTextId ? { ...t, ...patch } : t)));
  }

  function removeSelectedText() {
    setTextLayers((prev) => prev.filter((t) => t.id !== selectedTextId));
    setSelectedTextId(null);
  }

  function getCanvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = getCanvasCoords(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    // Check topmost text layer under the click
    for (let i = textLayers.length - 1; i >= 0; i--) {
      const t = textLayers[i];
      ctx.font = `bold ${t.fontSize}px Arial, sans-serif`;
      const metrics = ctx.measureText(t.text);
      if (x >= t.x - 6 && x <= t.x + metrics.width + 6 && y >= t.y - 6 && y <= t.y + t.fontSize + 6) {
        setSelectedTextId(t.id);
        draggingId.current = t.id;
        dragOffset.current = { x: x - t.x, y: y - t.y };
        return;
      }
    }
    setSelectedTextId(null);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!draggingId.current) return;
    const { x, y } = getCanvasCoords(e);
    updateSelectedText({ x: x - dragOffset.current.x, y: y - dragOffset.current.y });
  }

  function handleMouseUp() {
    draggingId.current = null;
  }

  function handleSave() {
    setSaving(true);
    setSelectedTextId(null);
    setTimeout(() => {
      render();
      const dataUrl = canvasRef.current!.toDataURL("image/png");
      onSave(dataUrl);
      setSaving(false);
    }, 50);
  }

  const selectedText = textLayers.find((t) => t.id === selectedTextId);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <p className="text-sm font-semibold text-slate-700">Edit Photo</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 flex items-center justify-center bg-slate-900 rounded-lg overflow-hidden">
            {loaded ? (
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[50vh] cursor-move"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            ) : (
              <p className="text-slate-400 text-sm py-20">Loading...</p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Crop</p>
              <div className="grid grid-cols-2 gap-1.5">
                {CROP_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => setCropAspect(o.key)}
                    className={`text-xs px-2 py-1.5 rounded-md border ${cropAspect === o.key ? "border-purple-400 bg-purple-500/10 text-purple-700" : "border-slate-200 text-slate-600"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Rotate & Flip</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setRotation((r) => (r + 90) % 360)} className="btn-secondary text-xs">
                  <RotateCw className="w-3.5 h-3.5" /> Rotate
                </button>
                <button onClick={() => setFlipH((f) => !f)} className="btn-secondary text-xs">
                  <FlipHorizontal className="w-3.5 h-3.5" /> Flip
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Adjust</p>
              <div>
                <label className="text-xs text-slate-400">Brightness</label>
                <input type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Contrast</label>
                <input type="range" min="50" max="150" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Saturation</label>
                <input type="range" min="0" max="200" value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} className="w-full" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500">Text</p>
                <button onClick={addText} className="text-xs text-purple-600 flex items-center gap-1">
                  <Type className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              {selectedText ? (
                <div className="space-y-2 bg-slate-50 rounded-lg p-2.5">
                  <input
                    value={selectedText.text}
                    onChange={(e) => updateSelectedText({ text: e.target.value })}
                    className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded-md"
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateSelectedText({ fontSize: Math.max(16, selectedText.fontSize - 4) })} className="btn-secondary px-1.5 py-1"><Minus className="w-3 h-3" /></button>
                    <span className="text-xs text-slate-500">{selectedText.fontSize}px</span>
                    <button onClick={() => updateSelectedText({ fontSize: Math.min(120, selectedText.fontSize + 4) })} className="btn-secondary px-1.5 py-1"><Plus className="w-3 h-3" /></button>
                    <input
                      type="color"
                      value={selectedText.color}
                      onChange={(e) => updateSelectedText({ color: e.target.value })}
                      className="w-7 h-7 rounded border border-slate-200"
                    />
                    <button onClick={removeSelectedText} className="ml-auto text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">Drag the text directly on the photo to reposition.</p>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Click "Add" to place text, then drag it on the photo.</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center gap-3 shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !loaded} className="btn-primary flex-1 justify-center">
            {saving ? "Saving..." : <><Check className="w-4 h-4" /> Use This Photo</>}
          </button>
        </div>
      </div>
    </div>
  );
}
