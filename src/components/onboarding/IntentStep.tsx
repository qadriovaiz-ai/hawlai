"use client";

import { useState } from "react";
import { Loader2, ArrowUp } from "lucide-react";
import {
  routeIntent, MODE_LABELS, MODE_DESCRIPTIONS, MODE_SUGGESTIONS,
  type ProductMode,
} from "@/lib/onboarding/intentRouter";

// UX Transformation, piece 4 — the first thing a new signup sees.
//
// Free text is the PRIMARY path and the chips are shortcuts, per the
// mandate. That ordering is deliberate: leading with six cards would
// teach people that Hawlai is a menu, which is the exact impression
// this whole redesign exists to remove.

export default function IntentStep({
  ownerName,
  onResolved,
}: {
  ownerName: string | null;
  onResolved: (mode: ProductMode, intentText: string) => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [clarifying, setClarifying] = useState<ProductMode[] | null>(null);

  async function submit(raw: string) {
    const intentText = raw.trim();
    if (!intentText) return;

    const result = routeIntent(intentText);

    // Never silently route someone into the wrong workflow — ask.
    if (result.needsClarification || !result.mode) {
      setClarifying(result.candidates.length > 0 ? result.candidates : MODE_SUGGESTIONS.map((s) => s.mode));
      return;
    }

    setSaving(true);
    await onResolved(result.mode, intentText);
    setSaving(false);
  }

  async function pick(mode: ProductMode) {
    setSaving(true);
    // The typed text is preserved even when a chip resolves the
    // choice — what they actually asked for is worth keeping.
    await onResolved(mode, text.trim() || MODE_LABELS[mode]);
    setSaving(false);
  }

  if (clarifying) {
    return (
      <div className="w-full max-w-lg space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Which of these is closest?</h1>
          <p className="text-sm text-slate-500 mt-1">
            I want to make sure I set this up right rather than guess.
          </p>
        </div>

        <div className="space-y-2">
          {clarifying.map((mode) => (
            <button
              key={mode}
              onClick={() => pick(mode)}
              disabled={saving}
              className="w-full text-left card p-4 hover:border-brand-300 transition-colors disabled:opacity-50"
            >
              <p className="text-sm font-semibold text-slate-800">{MODE_LABELS[mode]}</p>
              <p className="text-xs text-slate-400 mt-0.5">{MODE_DESCRIPTIONS[mode]}</p>
            </button>
          ))}
          <button
            onClick={() => pick("full")}
            disabled={saving}
            className="w-full text-left card p-4 hover:border-brand-300 transition-colors disabled:opacity-50"
          >
            <p className="text-sm font-semibold text-slate-800">Show me everything</p>
            <p className="text-xs text-slate-400 mt-0.5">{MODE_DESCRIPTIONS.full}</p>
          </button>
        </div>

        <button
          onClick={() => setClarifying(null)}
          disabled={saving}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          ← Let me describe it differently
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {ownerName ? `Welcome, ${ownerName}` : "Welcome to Hawlai"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          What would you like Hawlai to help you with? Just say it in your own words.
        </p>
      </div>

      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
          rows={3}
          autoFocus
          placeholder="e.g. I need someone to call my leads and book appointments"
          className="input text-sm resize-none pr-12"
        />
        <button
          onClick={() => submit(text)}
          disabled={saving || !text.trim()}
          aria-label="Continue"
          className="absolute right-2 bottom-2 w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-brand-700 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
        </button>
      </div>

      <div>
        <p className="text-[11px] text-slate-400 mb-2">Or start from one of these:</p>
        <div className="flex flex-wrap gap-1.5">
          {MODE_SUGGESTIONS.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => pick(mode)}
              disabled={saving}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
