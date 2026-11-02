"use client";

// ONBOARDING STEP 5 — the photos. P5.
//
// ONE PHOTO BEFORE SETUP CAN CONTINUE, which is the founder's rule.
// "Skip for now" stays, as it does on every other step: it abandons
// setup rather than satisfying the gate, and trapping someone who is
// signing up from a laptop with no photos on it would be worse than
// letting them come back.
//
// EVERY IMAGE IS SHRUNK BEFORE IT IS SENT, and that is not an
// optimisation. A serverless request body is capped at about 4.5 MB,
// base64 adds roughly a third on the way up, and a photo straight off a
// phone is commonly 3-5 MB — so an untouched upload would fail for most
// of the people this screen exists for, as a platform error with
// nothing useful on the screen. The canvas work happens here because it
// needs a browser; the numbers it shrinks to live in
// lib/onboarding/photos.ts, where the API reads the same ceiling.
//
// Colours are the app's own tokens, not the mockup's light theme.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import {
  JPEG_QUALITY,
  MAX_EDGE_PX,
  MAX_PHOTOS,
  MIN_PHOTOS,
  enoughPhotos,
  isAcceptedImageType,
  roomForMore,
} from "@/lib/onboarding/photos";

type Photo = { id: string; public_url: string; kind: string | null };

/**
 * Re-encode an image down to MAX_EDGE_PX on its longest side.
 *
 * ALWAYS RE-ENCODED, even when it is already small: a 900px PNG off a
 * screenshot can still be several megabytes, and "is it small enough?"
 * is a question about bytes, not pixels.
 */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export default function PhotosStep({
  onFinished,
  onSkip,
}: {
  onFinished: () => Promise<void> | void;
  onSkip?: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/business-photos");
      const data = await res.json();
      // NULL MEANS "NOT KNOWN YET" AND [] MEANS "NONE". Starting at []
      // would let the gate read "you need a photo" for a moment to
      // someone who already has fifteen.
      setPhotos(res.ok ? data.photos ?? [] : []);
    } catch {
      setPhotos([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (!roomForMore((photos ?? []).length)) break;
        if (!isAcceptedImageType(file.type)) {
          setError("Only JPEG, PNG or WebP images");
          continue;
        }
        const dataUrl = await shrink(file);
        const res = await fetch("/api/business-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photo_base64: dataUrl, filename: file.name }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "That photo did not upload");
          continue;
        }
        setPhotos((current) => [data.photo, ...(current ?? [])]);
      }
    } catch (err: any) {
      setError(err.message ?? "That photo did not upload");
    } finally {
      setBusy(false);
      // So picking the same file again still fires a change event.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch("/api/business-photos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not remove that");
      return;
    }
    setPhotos((current) => (current ?? []).filter((p) => p.id !== id));
  }

  async function finish() {
    if (!enoughPhotos((photos ?? []).length) || finishing) return;
    setFinishing(true);
    setError(null);
    try {
      await onFinished();
    } catch (err: any) {
      setError(err.message ?? "Couldn't finish — try again");
    } finally {
      setFinishing(false);
    }
  }

  const count = (photos ?? []).length;
  const ready = enoughPhotos(count);

  return (
    <div className="w-full max-w-lg space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Add a few photos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Whatever a customer would want to see. Hawlai uses these in posts and ads.
        </p>
      </div>

      <p className="text-xs font-medium text-slate-400 tabular-nums">
        {photos === null ? "Loading…" : `${count} of ${MAX_PHOTOS} added${ready ? "" : ` — ${MIN_PHOTOS} needed to continue`}`}
      </p>

      {count > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {(photos ?? []).map((photo) => (
            <div key={photo.id} className="relative group aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.public_url}
                alt={photo.kind ?? "A photo of your business"}
                className="w-full h-full object-cover rounded-[10px] border border-slate-200"
              />
              <button
                type="button"
                onClick={() => remove(photo.id)}
                aria-label="Remove this photo"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {roomForMore(count) && (
        <div>
          <input
            ref={fileInput}
            id="photos-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => addFiles(e.target.files)}
            className="sr-only"
          />
          <label
            htmlFor="photos-input"
            className="flex flex-col items-center justify-center gap-2.5 py-8 px-5 rounded-2xl border border-dashed border-slate-300 bg-slate-100 cursor-pointer hover:border-brand-400 transition-colors"
          >
            <span className="w-11 h-11 rounded-full bg-brand-500/10 text-brand-400 flex items-center justify-center" aria-hidden="true">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            </span>
            <span className="text-center">
              <span className="block text-sm font-semibold text-slate-900">
                {count === 0 ? "Add your first photos" : "Add more"}
              </span>
              <span className="block text-xs text-slate-400 mt-0.5">
                {busy ? "Uploading…" : "JPEG, PNG or WebP — I'll shrink them for you"}
              </span>
            </span>
          </label>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        {onSkip ? (
          <button type="button" onClick={onSkip} className="text-xs text-slate-400 hover:text-slate-600">
            Skip for now
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={finish}
          disabled={!ready || finishing || busy}
          className="btn-primary justify-center disabled:opacity-45"
        >
          {finishing && <Loader2 className="w-4 h-4 animate-spin" />}
          Continue
        </button>
      </div>
    </div>
  );
}
