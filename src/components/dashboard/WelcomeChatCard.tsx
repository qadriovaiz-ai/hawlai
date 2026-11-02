"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, ArrowRight } from "lucide-react";
import PresenceStep from "@/components/onboarding/PresenceStep";
import ConnectStep from "@/components/onboarding/ConnectStep";
import ConfirmBusinessStep, { type ConfirmedBusiness } from "@/components/onboarding/ConfirmBusinessStep";
import BrandStep, { type BrandAnswer } from "@/components/onboarding/BrandStep";
import PhotosStep from "@/components/onboarding/PhotosStep";
import { connectKindFor, nextStep } from "@/lib/onboarding/steps";
import { DEFAULT_LANGUAGE, composeToneOfVoice, hinglishFrom, type PreferredLanguage, type ToneTag } from "@/lib/onboarding/brand";
import OnboardingProgress from "@/components/onboarding/OnboardingProgress";
import { type OnlinePresence, type StepKey } from "@/lib/onboarding/steps";
import { MODE_LABELS, type ProductMode } from "@/lib/onboarding/intentRouter";
import { BUSINESS_MODELS, BUSINESS_MODEL_OPTIONS, type BusinessModel } from "@/lib/business/businessModel";

interface BrandVoiceDraft {
  personality_traits: string[];
  vocabulary_preferences: { favor: string[]; avoid: string[] };
  sentence_rhythm: string;
  formality_level: "casual" | "conversational" | "professional" | "formal";
  hinglish_ok: boolean;
  punctuation_emoji_style: { emoji_usage: string; exclamation_marks: string };
}

interface AnalyzeResult {
  summary: string;
  business_category: string;
  tone_of_voice: string;
  target_persona: any;
  messaging_pillars: string[];
  brand_voice_draft: BrandVoiceDraft;
}

// Multi-step conversational onboarding: the free-text business
// description (unchanged) drafts a full brand profile including a
// best-effort structured Brand Voice, then 3 short follow-up questions
// let the owner's own words override the parts a description alone
// can't reliably infer (formality, language mixing, personality words,
// words to avoid) — all part of the SAME flow, one combined save at
// the end, not a disconnected second form.
// "intent" is the new first step (UX Transformation piece 4): ask what
// the customer WANTS before asking who they are. The brand-voice steps
// that follow are unchanged — they were always good, they just
// answered the second question first.
// THE STEP NAMES NOW COME FROM THE REGISTRY (onboarding P1). They used
// to be a union written here, with no count attached to it, which is
// how the bar had nowhere truthful to read a total from.
type Step = StepKey;

const FORMALITY_CHOICES: { label: string; value: BrandVoiceDraft["formality_level"] }[] = [
  { label: "Formal", value: "formal" },
  { label: "Somewhere in between", value: "conversational" },
  { label: "Casual", value: "casual" },
];

export default function WelcomeChatCard({ dealershipName, ownerName }: { dealershipName: string; ownerName: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("presence");
  // What the step order needs to know. `hinglish` decides whether
  // language_notes is a step at all, so the total on the bar changes
  // with it — see lib/onboarding/steps.ts.
  const [presence, setPresence] = useState<OnlinePresence | null>(null);
  // What signup already put on the record, so step 3 can say which of
  // its fields came from an analysis and which are the owner's own
  // typing being shown back to him.
  const [onRecord, setOnRecord] = useState<{ name?: string | null; city?: string | null; category?: string | null }>({});
  const [productMode, setProductMode] = useState<ProductMode | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [draft, setDraft] = useState<AnalyzeResult | null>(null);

  const [formality, setFormality] = useState<BrandVoiceDraft["formality_level"] | null>(null);
  // ONE ANSWER FOR LANGUAGE, set by step 4's pills. It used to be two
  // fields answering the same question — brand_voice.hinglish_ok from a
  // yes/no step, and preferred_language, which was written as
  // "hinglish" for every business regardless of that answer.
  const [language, setLanguage] = useState<PreferredLanguage>(DEFAULT_LANGUAGE);
  const [brandColors, setBrandColors] = useState<string[]>([]);
  const [toneTags, setToneTags] = useState<ToneTag[]>([]);
  const [regionalNotes, setRegionalNotes] = useState("");
  const [personalityInput, setPersonalityInput] = useState("");
  const [avoidWordsInput, setAvoidWordsInput] = useState("");
  const [businessModels, setBusinessModels] = useState<BusinessModel[]>([]);

  // Saved as soon as it's known rather than batched into the final
  // submit: if someone abandons onboarding after this step, knowing
  // what they came for is still worth having.
  // THE ORDER COMES FROM THE REGISTRY, not from each handler guessing
  // its successor. A step inserted into STEP_ORDER is then actually
  // walked, instead of being counted on the bar and never reached —
  // which is how P4 would have skipped `brand` while still numbering it.
  function goAfter(current: StepKey) {
    setStep(nextStep(current, { presence, hinglish: hinglishFrom(language) }) ?? "done");
  }

  async function handlePresenceResolved(answer: {
    presence: OnlinePresence;
    productMode: ProductMode | null;
    intentText: string;
  }) {
    setPresence(answer.presence);
    setProductMode(answer.productMode);
    try {
      await fetch("/api/dealership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          online_presence: answer.presence,
          // NULL IS SENT ON PURPOSE when routing was not sure: it
          // already means "never asked" everywhere product_mode is
          // read, and a guess here routes someone into the wrong
          // workflow silently.
          ...(answer.productMode ? { product_mode: answer.productMode } : {}),
          ...(answer.intentText ? { onboarding_intent_text: answer.intentText } : {}),
        }),
      });
    } catch {
      // Best-effort — a failed save here shouldn't trap someone on the
      // first screen of their first session. They continue in the mode
      // they picked; only the persisted record is lost.
    }
    setStep("connect");
  }

  // STEP 2 — whichever of the four branches step 1 chose. The analysis
  // it returns is the same shape the single describe box used to
  // produce, so everything downstream — the brand-voice questions and
  // the one combined save — is unchanged.
  async function handleConnectResolved(answer: { detail: string | null; description: string; draft: any }) {
    setDescription(answer.description);
    setDraft(answer.draft);
    if (answer.detail) {
      try {
        await fetch("/api/dealership", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ online_presence_detail: answer.detail }),
        });
      } catch {
        // Best-effort, like the presence save above: a failed write
        // here must not trap someone on the second screen of their
        // first session. The analysis they just gave is already held.
      }
    }
    // Read before step 3 renders rather than inside it: this await is
    // already behind step 2's spinner, so the confirm screen appears
    // complete instead of filling in after the owner is looking at it.
    try {
      const res = await fetch("/api/dealership");
      if (res.ok) {
        const d = await res.json();
        setOnRecord({ name: d?.dealership_name ?? null, city: d?.city ?? null, category: d?.business_category ?? null });
      }
    } catch {
      // Nothing on record is a state step 3 already handles: every
      // field then asks to be filled in and claims no source.
    }
    goAfter("connect");
  }

  // STEP 3 — the owner has checked what the analysis decided. These are
  // saved NOW rather than batched into the final save, because he has
  // just been asked to confirm them and a later failure would silently
  // discard a correction he already made.
  async function handleBusinessConfirmed(confirmed: ConfirmedBusiness) {
    const res = await fetch("/api/dealership", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealership_name: confirmed.name,
        business_category: confirmed.category,
        city: confirmed.city,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Couldn't save that — try again");
    }
    setOnRecord({ name: confirmed.name, city: confirmed.city, category: confirmed.category });
    goAfter("confirm");
  }

  // STEP 4 — colours, tone words and language. Held in state and
  // written with the one combined save at the end, like the brand-voice
  // answers that follow it: nothing here is a correction the owner has
  // just been asked to confirm, so there is nothing to lose by waiting.
  function handleBrandSaved(answer: BrandAnswer) {
    setBrandColors(answer.colors);
    setToneTags(answer.toneTags);
    setLanguage(answer.language);
    // NOT goAfter(): it would read the language from state, which React
    // has not applied yet, and a Hinglish answer would be walked as
    // though it were not.
    setStep(nextStep("brand", { presence, hinglish: hinglishFrom(answer.language) }) ?? "done");
  }

  function chooseFormality(value: BrandVoiceDraft["formality_level"]) {
    setFormality(value);
    goAfter("formality");
  }

  async function finalizeAndSave() {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      const personality_traits = personalityInput.trim()
        ? personalityInput.split(",").map((s) => s.trim()).filter(Boolean)
        : draft.brand_voice_draft.personality_traits;
      const avoid = avoidWordsInput.trim()
        ? avoidWordsInput.split(",").map((s) => s.trim()).filter(Boolean)
        : draft.brand_voice_draft.vocabulary_preferences.avoid;

      const brand_voice = {
        personality_traits,
        vocabulary_preferences: { favor: draft.brand_voice_draft.vocabulary_preferences.favor, avoid },
        sentence_rhythm: draft.brand_voice_draft.sentence_rhythm,
        formality_level: formality ?? draft.brand_voice_draft.formality_level,
        // DERIVED FROM THE ONE ANSWER, so the flow cannot disagree with
        // itself about language.
        hinglish_ok: hinglishFrom(language),
        regional_language_notes: regionalNotes.trim() || null,
        punctuation_emoji_style: { ...draft.brand_voice_draft.punctuation_emoji_style, notes: null },
        source: "conversational_extraction" as const,
      };

      await Promise.all([
        fetch("/api/brand-profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // THE OWNER'S WORDS WHEN HE PICKED ANY, the drafted sentence
            // when he did not. tone_of_voice stays the free text every
            // prompt reads; tone_tags is the array the pills own.
            tone_of_voice: composeToneOfVoice(toneTags, draft.tone_of_voice),
            tone_tags: toneTags,
            brand_colors: brandColors,
            target_persona: draft.target_persona,
            messaging_pillars: draft.messaging_pillars,
            // WAS HARDCODED. The flow asked about language, stored the
            // answer in brand_voice.hinglish_ok, and then wrote
            // "hinglish" here for every business — so the question was
            // asked and the field it belonged to was assumed.
            preferred_language: language,
            brand_voice,
            // The owner's own words, kept as the source the voice came
            // from (migration 159). Saved here rather than at the
            // describe step so nothing persists until they confirm —
            // the derived profile is a proposal until this point.
            business_description: description.trim(),
          }),
        }),
        // THE CATEGORY IS NO LONGER WRITTEN HERE — onboarding P3. Step 3
        // shows the owner what the analysis decided and lets him
        // correct it, and this call would have overwritten that
        // correction with the model's version at the end of the flow.
        // Writing it twice from two places is how the second one wins
        // without anybody choosing that.
        fetch("/api/dealership", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboarding_completed: true, ...(businessModels.length ? { business_models: businessModels } : {}) }),
        }),
      ]);

      setProfile({ ...draft, brand_voice });
      setStep("done");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSkip() {
    await fetch("/api/dealership", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed: true }),
    });
    router.refresh();
  }

  function handleContinue() {
    router.refresh();
  }

  const SkipForNow = () => (
    <button onClick={handleSkip} className="text-xs text-slate-400 hover:text-slate-600">
      Skip for now
    </button>
  );

  // THE BAR, ON EVERY COUNTED STEP. It renders nothing for "done" and
  // nothing for a step this owner is not asked, so there is no screen
  // where it can read "Step 0 of 7". Both numbers come from the
  // registry — see lib/onboarding/steps.ts.
  const Progress = () => (
    <div className="mb-6">
      <OnboardingProgress step={step} answers={{ presence, hinglish: hinglishFrom(language) }} />
    </div>
  );

  if (step === "presence") {
    return (
      <div className="w-full max-w-xl animate-fade-in-up">
        <Progress />
        <PresenceStep ownerName={ownerName} onResolved={handlePresenceResolved} />
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="w-full max-w-xl animate-fade-in-up">
        <Progress />
        <ConfirmBusinessStep
          kind={connectKindFor(presence ?? "none")}
          analysed={draft}
          onRecord={onRecord}
          onConfirmed={handleBusinessConfirmed}
          onSkip={handleSkip}
        />
      </div>
    );
  }

  if (step === "photos") {
    return (
      <div className="w-full max-w-xl animate-fade-in-up">
        <Progress />
        <PhotosStep onFinished={() => goAfter("photos")} onSkip={handleSkip} />
      </div>
    );
  }

  if (step === "brand") {
    return (
      <div className="w-full max-w-xl animate-fade-in-up">
        <Progress />
        <BrandStep defaultLanguage={language} onSaved={handleBrandSaved} onSkip={handleSkip} />
      </div>
    );
  }

  if (step === "done" && profile) {
    return (
      <div className="w-full max-w-xl animate-fade-in-up">
        <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Check className="w-7 h-7 text-green-400" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center leading-tight">
          Got it — here's what I set up
        </h1>
        <p className="text-slate-500 text-center mt-2">{profile.summary}</p>

        <div className="bg-slate-100 rounded-2xl border border-slate-200 p-5 space-y-3 shadow-sm mt-6">
          {profile.business_category && (
            <div>
              <p className="text-xs text-slate-400">Business Type</p>
              <p className="text-sm font-medium text-slate-800">{profile.business_category}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400">Tone of Voice</p>
            <p className="text-sm font-medium text-slate-800">{profile.tone_of_voice}</p>
          </div>
          {profile.brand_voice?.personality_traits?.length > 0 && (
            <div>
              <p className="text-xs text-slate-400">Personality</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {profile.brand_voice.personality_traits.map((p: string, i: number) => (
                  <span key={i} className="text-xs bg-brand-500/10 text-brand-600 px-2 py-1 rounded-full">{p}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400">Formality &amp; Language</p>
            <p className="text-sm font-medium text-slate-800 capitalize">
              {profile.brand_voice?.formality_level} · {profile.brand_voice?.hinglish_ok ? "Hindi/English mixing okay" : "One language at a time"}
            </p>
          </div>
          {profile.messaging_pillars?.length > 0 && (
            <div>
              <p className="text-xs text-slate-400">Key Points</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {profile.messaging_pillars.map((p: string, i: number) => (
                  <span key={i} className="text-xs bg-purple-500/10 text-purple-300 px-2 py-1 rounded-full">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 text-center mt-3">You can fine-tune all of this anytime in Settings → Brand Voice.</p>
        <button
          onClick={handleContinue}
          className="w-full mt-5 bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm shadow-brand-600/30"
        >
          Continue to Dashboard <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (step === "business_model") {
    const toggleModel = (m: BusinessModel) =>
      setBusinessModels((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : BUSINESS_MODELS.filter((x) => x === m || prev.includes(x))));
    return (
      <div className="w-full max-w-xl text-center animate-fade-in-up">
        <Progress />
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">How does your business make money?</h1>
        <p className="text-slate-500 mt-2">Tick everything that applies — this sets up your lead stages and how Hawlai writes about what you offer.</p>
        <div className="mt-6 space-y-2 text-left">
          {BUSINESS_MODELS.map((m) => (
            <label key={m} className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${businessModels.includes(m) ? "border-brand-500 bg-brand-500/5" : "border-slate-200 bg-slate-100 hover:border-brand-500"}`}>
              <input type="checkbox" checked={businessModels.includes(m)} onChange={() => toggleModel(m)} className="mt-1 w-4 h-4 accent-purple-600" />
              <span>
                <span className="text-sm font-medium text-slate-800">{BUSINESS_MODEL_OPTIONS[m].label}</span>
                <span className="block text-xs text-slate-500">{BUSINESS_MODEL_OPTIONS[m].hint}</span>
              </span>
            </label>
          ))}
        </div>
        <button
          onClick={() => setStep("formality")}
          disabled={!businessModels.length}
          className="w-full mt-5 bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={() => setStep("formality")} className="mt-3 text-xs text-slate-400 hover:text-slate-600">Not sure — skip this</button>
      </div>
    );
  }

  if (step === "formality") {
    return (
      <div className="w-full max-w-xl text-center animate-fade-in-up">
        <Progress />
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">How do you usually talk to customers?</h1>
        <p className="text-slate-500 mt-2">Formal, casual, or somewhere in between?</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          {FORMALITY_CHOICES.map((c) => (
            <button
              key={c.value}
              onClick={() => chooseFormality(c.value)}
              className="px-5 py-3 rounded-xl border border-slate-200 bg-slate-100 hover:border-brand-500 hover:bg-brand-500/5 text-sm font-medium text-slate-800 transition-colors"
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="mt-6"><SkipForNow /></div>
      </div>
    );
  }

  if (step === "language_notes") {
    return (
      <div className="w-full max-w-xl text-center animate-fade-in-up">
        <Progress />
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">Anything else about language?</h1>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">Optional — e.g. a regional language your customers respond well to.</p>
        <div className="mt-6 bg-slate-100 border border-slate-200 rounded-2xl shadow-sm text-left max-w-md mx-auto">
          <textarea
            value={regionalNotes}
            onChange={(e) => setRegionalNotes(e.target.value)}
            placeholder="e.g. Customers respond well to a Marathi greeting"
            autoFocus
            className="w-full h-20 p-4 text-sm bg-transparent text-slate-900 placeholder-slate-500 border-0 resize-none focus:outline-none rounded-2xl"
          />
        </div>
        <div className="mt-6 flex items-center justify-center gap-4">
          <button onClick={() => setStep("personality")} className="text-xs text-slate-400 hover:text-slate-600">Skip</button>
          <button
            onClick={() => setStep("personality")}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 text-white text-sm font-semibold transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === "personality") {
    return (
      <div className="w-full max-w-xl text-center animate-fade-in-up">
        <Progress />
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">3-4 words for your brand's personality?</h1>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">e.g. confident, warm, direct — separate with commas</p>
        <div className="mt-6 bg-slate-100 border border-slate-200 rounded-2xl shadow-sm text-left max-w-md mx-auto">
          <input
            value={personalityInput}
            onChange={(e) => setPersonalityInput(e.target.value)}
            placeholder={draft?.brand_voice_draft.personality_traits.join(", ") || "confident, warm, direct"}
            autoFocus
            className="w-full p-4 text-sm bg-transparent text-slate-900 placeholder-slate-500 border-0 focus:outline-none rounded-2xl"
          />
        </div>
        <div className="mt-6 flex items-center justify-center gap-4">
          <button onClick={() => setStep("avoid_words")} className="text-xs text-slate-400 hover:text-slate-600">Skip — use what I inferred</button>
          <button
            onClick={() => setStep("avoid_words")}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 text-white text-sm font-semibold transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === "avoid_words") {
    return (
      <div className="w-full max-w-xl text-center animate-fade-in-up">
        <Progress />
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">Any words you'd never want us to use?</h1>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">Optional — separate with commas. Last question, then you're set.</p>
        <div className="mt-6 bg-slate-100 border border-slate-200 rounded-2xl shadow-sm text-left max-w-md mx-auto">
          <input
            value={avoidWordsInput}
            onChange={(e) => setAvoidWordsInput(e.target.value)}
            placeholder="e.g. cheap, discount, hurry"
            autoFocus
            disabled={loading}
            className="w-full p-4 text-sm bg-transparent text-slate-900 placeholder-slate-500 border-0 focus:outline-none rounded-2xl disabled:opacity-60"
          />
        </div>
        <div className="mt-6 flex items-center justify-center gap-4">
          <button onClick={finalizeAndSave} disabled={loading} className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-40">Skip</button>
          <button
            onClick={finalizeAndSave}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 hover:brightness-110 text-white text-sm font-semibold transition-all flex items-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Finish"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
      </div>
    );
  }

  // STEP 2 BY NAME, NOT BY FALLING THROUGH. It used to be the
  // fallthrough — inherited from the describe box it replaced — which
  // meant any step without a block of its own silently rendered step 2.
  // A test now asserts each of the five design screens is both
  // numbered and reached, and it caught this.
  //
  // presence is null only if someone reaches this without answering
  // step 1, which the flow does not allow — so it falls back to the
  // branch that needs nothing, rather than rendering a blank screen.
  if (step === "connect") {
    return (
    <div className="w-full max-w-xl animate-fade-in-up">
      <Progress />
      {productMode && (
        <p className="text-xs font-medium text-brand-500 mb-2">Setting up {MODE_LABELS[productMode]}</p>
      )}
      <ConnectStep
        presence={presence ?? "none"}
        onResolved={handleConnectResolved}
        onSkip={handleSkip}
      />
      </div>
    );
  }

  // EVERY StepKey HAS A BLOCK ABOVE, so this is unreachable — and
  // TypeScript cannot prove that, so it is written as "start again"
  // rather than as a blank screen. A new step added to the registry
  // without a screen lands here and sends the owner back to step 1,
  // which is visible, instead of rendering nothing at all.
  return (
    <div className="w-full max-w-xl animate-fade-in-up">
      <Progress />
      <PresenceStep ownerName={ownerName} onResolved={handlePresenceResolved} />
    </div>
  );
}
