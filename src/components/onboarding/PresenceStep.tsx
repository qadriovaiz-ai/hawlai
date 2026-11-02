"use client";

// ONBOARDING STEP 1 — where the business already is, and what the
// owner came for. P1.
//
// TWO QUESTIONS ON ONE SCREEN, and that was the founder's call of
// 2 November. The reference design asks only "where does your business
// live online?". But `product_mode` — what the owner WANTS — is read
// to decide which dashboard sections appear and by the pricing tiers,
// so dropping the question would have landed every new customer on the
// same dashboard. One free-text line above the four cards answers
// both, and keeps "Step 1 of N" true instead of adding a sixth screen.
//
// THE CLARIFYING QUESTION DOES NOT TAKE A SCREEN ANY MORE. IntentStep
// replaced the whole view with "Which of these is closest?" when
// routing was unsure. Here the chips appear BELOW the box, on the same
// step: same information, same honesty about not guessing, and the
// step count stays true. `routeIntent` is deliberately not a model
// call — see its own header.
//
// AND AN UNSURE INTENT NEVER BLOCKS SETUP. The presence answer is the
// one step 2 needs. If the typed words do not route confidently the
// owner can pick a chip, but they can also carry on: product_mode
// stays null, which already means "never asked" everywhere that reads
// it, and the words themselves are still saved.
//
// Colours are the app's own tokens, not the mockup's: the mockup is a
// light theme and this app is dark (tailwind.config.ts inverts the
// slate scale). Structure, hierarchy and copy are the design's.

import { useState } from "react";
import { Globe, MapPin, Instagram, Sparkles, Loader2 } from "lucide-react";
import {
  MODE_DESCRIPTIONS,
  MODE_LABELS,
  MODE_SUGGESTIONS,
  routeIntent,
  type ProductMode,
} from "@/lib/onboarding/intentRouter";
import { ONLINE_PRESENCES, type OnlinePresence } from "@/lib/onboarding/steps";

/**
 * The four cards, in the design's order.
 *
 * DERIVED FROM ONLINE_PRESENCES rather than listed separately, so a
 * fifth presence cannot be added to the type without this screen
 * gaining a card for it. The copy is generic by construction: no
 * trade, product or industry word appears, because this screen is the
 * first thing every business of every kind sees (CLAUDE.md rule 3).
 */
const PRESENCE_CARD: Record<
  OnlinePresence,
  { label: string; hint: string; Icon: typeof Globe }
> = {
  website: { label: "Website", hint: "An online store or your own site", Icon: Globe },
  maps: { label: "Google Maps", hint: "Customers come to your location", Icon: MapPin },
  social: { label: "Social media only", hint: "Instagram or Facebook, no website yet", Icon: Instagram },
  none: { label: "Just starting", hint: "No online presence yet — I'll describe it", Icon: Sparkles },
};

export default function PresenceStep({
  ownerName,
  onResolved,
}: {
  ownerName: string | null;
  onResolved: (answer: {
    presence: OnlinePresence;
    productMode: ProductMode | null;
    intentText: string;
  }) => Promise<void> | void;
}) {
  const [presence, setPresence] = useState<OnlinePresence | null>(null);
  const [text, setText] = useState("");
  const [chips, setChips] = useState<ProductMode[] | null>(null);
  const [saving, setSaving] = useState(false);

  async function go(mode: ProductMode | null) {
    if (!presence) return;
    setSaving(true);
    await onResolved({ presence, productMode: mode, intentText: text.trim() });
    setSaving(false);
  }

  async function handleContinue() {
    if (!presence) return;
    const intentText = text.trim();

    // NOTHING TYPED IS NOT AN AMBIGUOUS ANSWER. Routing an empty string
    // and then asking "which of these is closest?" would be asking the
    // owner to clarify something they never said.
    if (!intentText) return go(null);

    const result = routeIntent(intentText);
    // Never silently route someone into the wrong workflow — offer the
    // choice, on this same step.
    if (result.needsClarification || !result.mode) {
      setChips(result.candidates.length ? result.candidates : MODE_SUGGESTIONS.map((s) => s.mode));
      return;
    }
    return go(result.mode);
  }

  return (
    <div className="w-full max-w-lg space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          {ownerName ? `Welcome, ${ownerName}` : "Welcome to Hawlai"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Where does your business live online? This decides how Hawlai learns about it.
        </p>
      </div>

      <div className="space-y-2.5">
        {ONLINE_PRESENCES.map((key) => {
          const { label, hint, Icon } = PRESENCE_CARD[key];
          const chosen = presence === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPresence(key)}
              aria-pressed={chosen}
              className={`w-full text-left card p-4 flex items-center gap-3.5 transition-colors ${
                chosen ? "border-brand-500 bg-brand-500/10" : "hover:border-brand-300"
              }`}
            >
              <span
                className="w-10 h-10 rounded-[10px] bg-brand-500/10 text-brand-400 flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <Icon className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                <span className="block text-xs text-slate-400 mt-0.5">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <label htmlFor="onboarding-intent" className="block text-xs font-semibold text-slate-800 mb-1.5">
          And what would you like Hawlai to do first?{" "}
          <span className="font-normal text-slate-400">Optional — in your own words</span>
        </label>
        <textarea
          id="onboarding-intent"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // What they typed changed, so last answer's chips are stale.
            if (chips) setChips(null);
          }}
          rows={2}
          placeholder="e.g. I need more customers this month"
          className="input text-sm resize-none"
        />
      </div>

      {chips && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            I could not tell from that which of these you meant — pick the closest, or just continue.
          </p>
          <div className="flex flex-wrap gap-2">
            {chips.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => go(mode)}
                disabled={saving}
                title={MODE_DESCRIPTIONS[mode]}
                className="px-3.5 py-2 rounded-full text-xs font-medium border border-slate-300 text-slate-800 hover:border-brand-400 disabled:opacity-50"
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleContinue}
        disabled={!presence || saving}
        className="btn-primary w-full justify-center disabled:opacity-45"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Continue
      </button>
    </div>
  );
}
