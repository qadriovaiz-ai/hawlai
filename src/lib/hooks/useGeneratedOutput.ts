"use client";

import { useCallback, useEffect, useState } from "react";

// Consolidates the generate -> display -> edit -> save -> copy -> history
// flow that ~15 department pages (SEO, Content Marketing, Social x2, CRO,
// Paid Ads, Email, Video, WhatsApp, Graphic Design, Competitor Intel,
// Research, Retargeting, Growth Advisor, Influencer, Strategy...) each
// independently reimplemented with near-identical state and logic, not
// just near-identical markup. One bug fix here now fixes all of them at
// once instead of needing N fixes — the contrast bug found earlier this
// session in Content Marketing's own separate copy of this exact pattern
// is the failure mode this exists to prevent from recurring.
/** Approved wording for a failure the route didn't explain (bad_request, 2026-09-18). */
export const GENERIC_ERROR = "Something went wrong writing this — try again. If it keeps happening, let us know.";

/**
 * What a generate response means for the page: the result, or why there
 * isn't one. A failed or empty response is never shown as a result.
 */
export function generateOutcome(ok: boolean, data: any): { output: any; id: string | null; error: string | null } {
  if (!ok || !data?.output) {
    const reason = typeof data?.error === "string" && data.error.trim() ? data.error : GENERIC_ERROR;
    return { output: null, id: null, error: reason };
  }
  return { output: data.output, id: data.id ?? null, error: null };
}

export interface HistoryItem {
  id: string;
  [key: string]: any;
}

export interface UseGeneratedOutputOptions {
  // Base endpoint used for POST (generate), GET (history), and PATCH
  // (save edits) — matches every department's existing route convention.
  endpoint: string;
  // Optional query string (e.g. "?platform=google") appended to GET/POST
  // for departments that scope history by a filter/tab.
  query?: string;
}

export function useGeneratedOutput({ endpoint, query = "" }: UseGeneratedOutputOptions) {
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);
  const [outputId, setOutputId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  // Why the last generate didn't produce anything — the route's own words
  // (an AI outage, a plan limit…). Before this, a failed call rendered as
  // a blank card, or as a placeholder dressed up as the result.
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`${endpoint}${query}`);
    const data = await res.json();
    setHistory(data.items ?? []);
  }, [endpoint, query]);

  // Auto-loads on mount and whenever the endpoint/query changes (e.g. a
  // department that scopes history by a platform/tab tab passes a
  // different `query` when the tab changes) — matches every existing
  // department page's own useEffect-on-mount, so callers don't have to
  // remember to call loadHistory() themselves for the common case.
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function generate(payload: any) {
    setLoading(true);
    setOutput(null);
    setOutputId(null);
    setEditing(false);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      const outcome = generateOutcome(res.ok, data);
      if (outcome.error) {
        setError(outcome.error);
        return data;
      }
      setOutput(outcome.output);
      setOutputId(outcome.id);
      await loadHistory();
      return data;
    } finally {
      setLoading(false);
    }
  }

  function startEditing() {
    setDraft(JSON.parse(JSON.stringify(output)));
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  async function saveEdits() {
    if (!outputId) return;
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: outputId, output: draft }),
      });
      if (!res.ok) throw new Error("Save failed");
      setOutput(draft);
      setEditing(false);
      await loadHistory();
    } finally {
      setSaving(false);
    }
  }

  function copyOutput() {
    if (!output) return;
    navigator.clipboard.writeText(JSON.stringify(output, (key, value) => (key.startsWith("_") ? undefined : value), 2).replace(/[{}"[\],]/g, "").trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function selectFromHistory(item: HistoryItem) {
    setError(null);
    setOutput(item.output);
    setOutputId(item.id);
    setEditing(false);
  }

  function reset() {
    setError(null);
    setOutput(null);
    setOutputId(null);
    setEditing(false);
  }

  return {
    loading,
    error,
    output,
    outputId,
    editing,
    draft,
    saving,
    copied,
    history,
    generate,
    startEditing,
    cancelEditing,
    saveEdits,
    copyOutput,
    selectFromHistory,
    reset,
    setDraft,
    loadHistory,
  };
}
