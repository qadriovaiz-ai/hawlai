"use client";

// ONBOARDING STEP 2 — read what the business already has. P2.
//
// FOUR BRANCHES, CHOSEN BY STEP 1'S STORED ANSWER, never by anything
// hardcoded here: `connectKindFor` owns that mapping and a test fails
// if a presence option has no branch. The founder's instruction was
// explicit about it.
//
// ONLY ONE BRANCH CAN READ A LINK, and this screen says so rather than
// implying otherwise. `analyzeWebsite` fetches a URL and strips the
// HTML to text, needing 50+ readable characters. A Google Maps listing
// and an Instagram profile are both JavaScript-rendered and bot-gated,
// so it gets almost no text from either and throws. Those two branches
// therefore save the link AND ask for a couple of sentences, which is
// what the analysis actually reads — approved 2 November. Telling the
// owner we had read a listing we cannot read would put a false
// sentence on his first screen.
//
// AND THE WEBSITE BRANCH CANNOT TRAP ANYONE. A site that is down,
// blocks us, or is one big JavaScript bundle makes analyzeWebsite
// throw. Without a way out, the owner is stuck on step 2 of his first
// session forever — so a failure shows what went wrong and offers the
// same describe-it-yourself box the other branches use.
//
// Colours are the app's own tokens, not the mockup's light theme.

import { useState } from "react";
import { Loader2, Globe, MapPin, Instagram, Pencil } from "lucide-react";
import { connectKindFor, type ConnectKind, type OnlinePresence } from "@/lib/onboarding/steps";

/** The least the analysis needs to say anything — the API's own floor. */
export const MIN_DESCRIPTION = 10;

/**
 * What each branch asks for.
 *
 * NO TRADE, PRODUCT OR INDUSTRY WORD, placeholders included. This is
 * the second thing every business of every kind sees, and the step it
 * replaces had `jewelry business` in its placeholder (CLAUDE.md
 * rule 3).
 */
export const BRANCHES: Record<
  ConnectKind,
  { title: string; blurb: string; linkLabel: string | null; linkPlaceholder: string; wantsWords: boolean }
> = {
  url: {
    title: "Add your website",
    blurb: "I'll read your pages, products and wording before the next step.",
    linkLabel: "Website address",
    linkPlaceholder: "yourbusiness.com",
    wantsWords: false,
  },
  listing: {
    title: "Add your Google Maps listing",
    blurb:
      "I'll save the link, and read the couple of sentences below — a Maps listing is built in a way I cannot read directly.",
    linkLabel: "Link to your listing",
    linkPlaceholder: "Paste the link from Google Maps",
    wantsWords: true,
  },
  handle: {
    title: "Add your social profile",
    blurb:
      "I'll save the handle, and read the couple of sentences below — social profiles are built in a way I cannot read directly.",
    linkLabel: "Instagram or Facebook handle",
    linkPlaceholder: "@yourbusiness",
    wantsWords: true,
  },
  describe: {
    title: "Tell me about your business",
    blurb: "A couple of sentences is enough. Everything Hawlai writes for you starts from this.",
    linkLabel: null,
    linkPlaceholder: "",
    wantsWords: true,
  },
};

const ICON: Record<ConnectKind, typeof Globe> = {
  url: Globe,
  listing: MapPin,
  handle: Instagram,
  describe: Pencil,
};

/**
 * A bare domain is a URL to a person and not to `analyzeWebsite`,
 * which requires a scheme and returns 400 without one. The reference
 * design's own screen shows a domain typed with no scheme.
 */
/**
 * Does this branch ask the owner to write a couple of sentences?
 *
 * EXPORTED SO IT IS TESTED AS DATA. The first version of this guard
 * grepped the source for `wantsWords: true` and `wantsWords: false`
 * and asserted both appeared — which says nothing about WHICH branch
 * has which, and a mutation that stopped the Maps branch asking for
 * words survived it. The invariant that matters is in
 * onboardingSteps.test.ts: a branch whose link cannot be read MUST ask
 * for words, or the owner reaches step 3 with an empty form.
 */
export function branchAsksForWords(kind: ConnectKind): boolean {
  return BRANCHES[kind].wantsWords;
}

export function normaliseSiteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function ConnectStep({
  presence,
  onResolved,
  onSkip,
}: {
  presence: OnlinePresence;
  onResolved: (answer: { detail: string | null; description: string; draft: any }) => Promise<void> | void;
  onSkip?: () => void;
}) {
  const kind = connectKindFor(presence);
  // Set when the website branch could not read the site. From here the
  // owner answers in his own words instead of being stuck.
  const [fellBack, setFellBack] = useState(false);
  const effective: ConnectKind = fellBack ? "describe" : kind;
  const branch = BRANCHES[effective];
  const Icon = ICON[effective];

  const [link, setLink] = useState("");
  const [words, setWords] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsLink = branch.linkLabel !== null;
  const needsWords = branch.wantsWords;
  const ready =
    (!needsLink || link.trim().length > 0) && (!needsWords || words.trim().length >= MIN_DESCRIPTION);

  async function handleContinue() {
    if (!ready || loading) return;
    setLoading(true);
    setError(null);

    // The link the owner gave, kept whatever the analysis does: it is
    // his record of where the business is, not a by-product of reading
    // it. `fellBack` keeps the original link rather than dropping it.
    const detail = link.trim() || null;

    try {
      // ONE OF TWO EXISTING ENDPOINTS, both of which already log their
      // usage and already refuse to save defaults when the AI is down
      // (lib/ai/aiFailureResponse.ts). No new model call is introduced
      // by this screen.
      const fromWebsite = effective === "url";
      const res = await fetch(
        fromWebsite ? "/api/brand-profile/analyze-website" : "/api/brand-profile/analyze-description",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fromWebsite ? { url: normaliseSiteUrl(link) } : { description: words.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      // The owner's own words, or nothing. NOT the URL: this field is
      // the source the brand voice came from (migration 159), and a
      // link is not a description of a business.
      await onResolved({ detail, description: fromWebsite ? "" : words.trim(), draft: data });
    } catch (err: any) {
      setError(err.message);
      // A SITE WE CANNOT READ IS NOT A DEAD END. Offered rather than
      // forced: the owner may simply have mistyped it.
      if (effective === "url") setFellBack(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-lg space-y-5">
      <div className="flex items-start gap-3.5">
        <span
          className="w-10 h-10 rounded-[10px] bg-brand-500/10 text-brand-400 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Icon className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{branch.title}</h1>
          <p className="text-sm text-slate-500 mt-1">{branch.blurb}</p>
        </div>
      </div>

      {needsLink && (
        <div>
          <label htmlFor="connect-link" className="block text-xs font-semibold text-slate-800 mb-1.5">
            {branch.linkLabel}
          </label>
          <input
            id="connect-link"
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={branch.linkPlaceholder}
            disabled={loading}
            className="input text-sm"
          />
        </div>
      )}

      {needsWords && (
        <div>
          <label htmlFor="connect-words" className="block text-xs font-semibold text-slate-800 mb-1.5">
            What you sell, who buys it, what makes you different
          </label>
          <textarea
            id="connect-words"
            value={words}
            onChange={(e) => setWords(e.target.value)}
            rows={4}
            placeholder="A couple of sentences in your own words — Hindi, English or both"
            disabled={loading}
            className="input text-sm resize-none"
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400">
          {error}
          {fellBack && " — tell me in your own words instead, below."}
        </p>
      )}

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
          onClick={handleContinue}
          disabled={!ready || loading}
          className="btn-primary justify-center disabled:opacity-45"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Continue
        </button>
      </div>
    </div>
  );
}
