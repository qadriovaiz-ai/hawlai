"use client";

import { useState, useEffect } from "react";
import { Loader2, Check } from "lucide-react";

export default function GoogleReviewsConnect() {
  const [loading, setLoading] = useState(true);
  const [placeId, setPlaceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotNote, setSnapshotNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/google-reviews")
      .then((res) => res.json())
      .then((data) => {
        setPlaceId(data?.placeId ?? "");
        if (data?.snapshot?.rating != null) {
          setSnapshotNote(`Currently showing ${data.snapshot.rating}★ (${data.snapshot.review_count ?? 0} reviews)`);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/google-reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: placeId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      if (data.fetchResult?.fetched === false && data.fetchResult?.reason) setError(data.fetchResult.reason);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Find your Place ID by searching your business on{" "}
        <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">
          Google's Place ID Finder
        </a>. Your rating, review count, and recent reviews will show up in CRO.
      </p>
      <input
        value={placeId}
        onChange={(e) => setPlaceId(e.target.value)}
        placeholder="ChIJ..."
        className="w-full p-2 text-xs bg-slate-100 text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {snapshotNote && <p className="text-xs text-green-600">{snapshotNote}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={handleSave} disabled={saving} className="btn-secondary text-xs w-full justify-center">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : "Save"}
      </button>
    </div>
  );
}
