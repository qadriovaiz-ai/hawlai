"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, ImageIcon } from "lucide-react";

interface Props {
  kind: string; // 'logo' | 'product' | 'section' — used to namespace the storage path
  currentUrl?: string;
  onUploaded: (url: string) => void;
  className?: string;
  compact?: boolean;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ImageUploader({ kind, currentUrl, onUploaded, className, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose an image file");
    if (file.size > 5 * 1024 * 1024) return setError("Image must be under 5MB");
    setError(null);
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/website-builder/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onUploaded(data.url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (compact) {
    return (
      <div className={className}>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-9 h-9 rounded-lg border border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : currentUrl ? <img src={currentUrl} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-slate-400" />}
        </button>
        {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
        className={`cursor-pointer rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center p-4 transition-colors ${dragOver ? "border-purple-400 bg-purple-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"}`}
      >
        {currentUrl ? (
          <img src={currentUrl} alt="" className="w-20 h-20 object-cover rounded-lg mb-2" />
        ) : (
          <Upload className="w-6 h-6 text-slate-400 mb-2" />
        )}
        {uploading ? (
          <p className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</p>
        ) : (
          <p className="text-xs text-slate-500">Click or drag an image here</p>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
