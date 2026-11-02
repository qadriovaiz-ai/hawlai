"use client";

// ONBOARDING STEP 4 — how Hawlai should sound and look. P4.
//
// Three questions on one screen, as the reference design has them:
// brand colours, tone words, and language.
//
// THE LANGUAGE PILLS FIX SOMETHING THAT WAS ALREADY BROKEN. The flow
// asked "do you mix Hindi and English with customers?", stored the
// answer in brand_voice.hinglish_ok, and then wrote
// `preferred_language: "hinglish"` for EVERYONE in the same save. The
// question was asked and the field it belonged to was hardcoded. One
// answer here sets both, so nothing asks twice and nothing is assumed.
//
// NO COLOURS ARE PRE-FILLED, and that is deliberate. The mockup shows
// three swatches already chosen; nothing in this product extracts
// colours from a website, so they would have had to come from
// somewhere — and a colour the owner never picked, shown as his brand
// colour on a setup screen, is the same class of thing as step 3's
// "pulled from your website". He adds them, or he skips them.
//
// TONE IS OPTIONAL. Picking nothing keeps the sentence the analysis
// already drafted, which is richer than a list of adjectives — see
// composeToneOfVoice. Nothing here blocks setup.
//
// Colours are the app's own tokens, not the mockup's light theme.

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import {
  LANGUAGES,
  MAX_BRAND_COLORS,
  TONE_TAGS,
  addBrandColor,
  cleanBrandColors,
  type PreferredLanguage,
  type ToneTag,
} from "@/lib/onboarding/brand";

export type BrandAnswer = {
  colors: string[];
  toneTags: ToneTag[];
  language: PreferredLanguage;
};

const LANGUAGE_LABEL: Record<PreferredLanguage, string> = {
  hindi: "Hindi",
  english: "English",
  hinglish: "Both, mixed",
};

const PILL = "px-3.5 py-2 rounded-full text-xs font-medium border transition-colors";
const PILL_ON = "bg-brand-500 text-white border-brand-500";
const PILL_OFF = "bg-slate-100 text-slate-800 border-slate-300 hover:border-brand-400";

export default function BrandStep({
  defaultLanguage,
  onSaved,
  onSkip,
}: {
  defaultLanguage: PreferredLanguage;
  onSaved: (answer: BrandAnswer) => Promise<void> | void;
  onSkip?: () => void;
}) {
  const [colors, setColors] = useState<string[]>([]);
  const [draftColor, setDraftColor] = useState("#4f46e5");
  const [adding, setAdding] = useState(false);
  const [toneTags, setToneTags] = useState<ToneTag[]>([]);
  const [language, setLanguage] = useState<PreferredLanguage>(defaultLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addColor() {
    // THROUGH THE SAME CLEANER THE API USES, so the list on screen is
    // the list that will be stored — normalised, de-duplicated and
    // capped. A swatch that appears and then vanishes on save is the
    // instrument telling a false story.
    setColors((current) => addBrandColor(current, draftColor));
    setAdding(false);
  }

  function toggleTone(tag: ToneTag) {
    setToneTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSaved({ colors: cleanBrandColors(colors), toneTags, language });
    } catch (err: any) {
      setError(err.message ?? "Couldn't save that — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-lg space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">How should Hawlai sound?</h1>
        <p className="text-sm text-slate-500 mt-1">
          This shapes every post, reply and email it writes for you. You can change all of it later.
        </p>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 mb-2.5">
          <span className="text-xs font-semibold text-slate-800">Brand colours</span>
          <span className="text-[10.5px] text-slate-400">Optional</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {colors.map((color) => (
            <span key={color} className="relative group">
              <span
                className="block w-11 h-11 rounded-[10px] border border-slate-300"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => setColors((c) => c.filter((x) => x !== color))}
                aria-label={`Remove ${color}`}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {adding ? (
            <span className="flex items-center gap-2">
              <input
                type="color"
                value={draftColor}
                onChange={(e) => setDraftColor(e.target.value)}
                aria-label="Pick a brand colour"
                className="w-11 h-11 rounded-[10px] bg-transparent border border-slate-300 cursor-pointer"
              />
              <button type="button" onClick={addColor} className="text-xs font-medium text-brand-400 hover:text-brand-300">
                Add
              </button>
            </span>
          ) : (
            colors.length < MAX_BRAND_COLORS && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                aria-label="Add a brand colour"
                className="w-11 h-11 rounded-[10px] border border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-400 flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 mb-2.5">
          <span className="text-xs font-semibold text-slate-800">Tone — pick as many as fit</span>
          <span className="text-[10.5px] text-slate-400">Optional</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {TONE_TAGS.map((tag) => {
            const on = toneTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTone(tag)}
                aria-pressed={on}
                className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="block text-xs font-semibold text-slate-800 mb-2.5">
          What language do you use with customers?
        </span>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => {
            const on = language === lang;
            return (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                aria-pressed={on}
                className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}
              >
                {LANGUAGE_LABEL[lang]}
              </button>
            );
          })}
        </div>
      </div>

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
          onClick={handleSave}
          disabled={saving}
          className="btn-primary justify-center disabled:opacity-45"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save my brand
        </button>
      </div>
    </div>
  );
}
