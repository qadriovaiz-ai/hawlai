"use client";

import { useState, useEffect } from "react";
import { Loader2, Check, Search, Star, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui";

// A3 — the dealer clicks their business instead of pasting a Place ID.
//
// This used to be a text box, a placeholder reading "ChIJ...", and a
// link to Google's Place ID Finder. We already know the business name
// and city, so the search runs server-side and the matches come back
// as a list to pick from.
//
// There is no manual-entry fallback. A Place ID is not something a
// dealer has, remembers, or can sanity-check — an almost-right one is
// indistinguishable from a right one until the wrong shop's reviews
// appear in CRO. Search failure says why and offers a retry.
type Candidate = {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
};

export default function GoogleReviewsConnect() {
  const [loading, setLoading] = useState(true);
  const [connectedPlaceId, setConnectedPlaceId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotNote, setSnapshotNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/google-reviews")
      .then((res) => res.json())
      .then((data) => {
        setConnectedPlaceId(data?.placeId ?? "");
        if (data?.snapshot?.rating != null) {
          setSnapshotNote(`Currently showing ${data.snapshot.rating}★ (${data.snapshot.review_count ?? 0} reviews)`);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSearch() {
    setError(null);
    setSearching(true);
    setCandidates(null);
    try {
      const res = await fetch("/api/integrations/google-reviews", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't search Google");
      setCandidates(data.candidates ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function handlePick(candidate: Candidate) {
    setError(null);
    setSavingId(candidate.placeId);
    try {
      const res = await fetch("/api/integrations/google-reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: candidate.placeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      if (data.fetchResult?.fetched === false && data.fetchResult?.reason) setError(data.fetchResult.reason);
      setConnectedPlaceId(candidate.placeId);
      setCandidates(null);
      if (candidate.rating != null) {
        setSnapshotNote(`Currently showing ${candidate.rating}★ (${candidate.reviewCount ?? 0} reviews)`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;

  return (
    <div className="space-y-2">
      {connectedPlaceId && !candidates ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-green-600">
            <Check className="w-3.5 h-3.5" /> Google reviews connected
          </div>
          {snapshotNote && <p className="text-xs text-slate-500">{snapshotNote}</p>}
          <p className="text-xs text-slate-400">Your rating, review count and recent reviews show up in CRO.</p>
          <Button variant="secondary" size="sm" onClick={handleSearch} loading={searching} className="w-full justify-center">
            {!searching && <Search className="w-3.5 h-3.5" />} Pick a different location
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            We&apos;ll look your business up on Google. Your rating, review count and recent reviews then show up in CRO.
          </p>
          {!candidates && (
            <Button variant="secondary" size="sm" onClick={handleSearch} loading={searching} className="w-full justify-center">
              {!searching && <Search className="w-3.5 h-3.5" />} Find my business on Google
            </Button>
          )}
        </>
      )}

      {candidates?.length === 0 && (
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-slate-400" />
          <p>
            Google has no listing matching your business name and city. Check the name and city in Settings, or
            claim your business on Google first — then search again.
          </p>
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">Which one is you?</p>
          {candidates.map((c) => (
            <button
              key={c.placeId}
              onClick={() => handlePick(c)}
              disabled={savingId !== null}
              className="w-full text-left p-2.5 bg-slate-100 border border-slate-200 rounded-lg hover:border-purple-400 disabled:opacity-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{c.address}</p>
                </div>
                {c.rating != null && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-600 shrink-0">
                    <Star className="w-3 h-3 text-amber-500" />
                    {c.rating} ({c.reviewCount ?? 0})
                  </span>
                )}
              </div>
              {savingId === c.placeId && (
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Connecting...
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {saved && <p className="text-xs text-green-600">Connected.</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
