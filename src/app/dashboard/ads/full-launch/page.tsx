"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Rocket, Loader2, AlertCircle, CheckCircle, ImagePlus, CalendarClock, Search, ArrowLeft, Sparkles, Users, IndianRupee, MapPin, PartyPopper, Check, Store } from "lucide-react";
import ProductPicker from "@/components/ads/ProductPicker";
import ScoreBadge from "@/components/shared/ScoreBadge";

const EXAMPLES = [
  "Swift wanted, Lucknow, budget up to 8 lakh, daily spend 500",
  "Honda City second hand buyers, Delhi NCR, 10-15 lakh range",
  "Tata Nexon SUV interested buyers, Kanpur city, daily budget 500",
];

const EXECUTION_STEPS = [
  "Uploading creative to Meta",
  "Creating campaign",
  "Creating audience & ad set",
  "Creating the ad",
  "Publishing",
];

type Stage = "form" | "previewing" | "preview" | "launching" | "success" | "error";

export default function FullLaunchPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("form");

  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [destination, setDestination] = useState<"instant_form" | "website">("instant_form");
  const [productDestinationUrl, setProductDestinationUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  const [executionStepIndex, setExecutionStepIndex] = useState(0);

  const [competitorLoading, setCompetitorLoading] = useState(false);
  const [competitorAds, setCompetitorAds] = useState<any[]>([]);
  const [competitorError, setCompetitorError] = useState<string | null>(null);
  const [competitorSearched, setCompetitorSearched] = useState(false);

  async function handleCheckCompetitors() {
    setCompetitorLoading(true);
    setCompetitorSearched(true);
    setCompetitorError(null);
    try {
      const res = await fetch(`/api/research/competitor-ads?q=${encodeURIComponent(prompt)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't check competitors right now");
      setCompetitorAds(data.ads ?? []);
    } catch (err: any) {
      setCompetitorError(err.message);
      setCompetitorAds([]);
    } finally {
      setCompetitorLoading(false);
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoBase64(reader.result as string);
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  // Stage 1 -> 2: generate the plan + creative, no Meta calls yet (Plan Card)
  async function handlePreview() {
    setError(null);
    if (!photoBase64) return setError("Upload the photo first");
    if (prompt.trim().length < 10) return setError("Add a bit more detail to the requirement");

    setStage("previewing");
    try {
      const res = await fetch("/api/ads/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_base64: photoBase64, prompt, image_mode: "template" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setDraft(data.draft);
      setPlan(data.plan);
      setStage("preview");
    } catch (err: any) {
      setError(err.message);
      setStage("form");
    }
  }

  // Stage 2 -> 3: actually launch on Meta, with a live step-by-step screen
  async function handleConfirmLaunch() {
    setStage("launching");
    setExecutionStepIndex(0);
    setError(null);

    const stepTimer = setInterval(() => {
      setExecutionStepIndex((i) => (i < EXECUTION_STEPS.length - 1 ? i + 1 : i));
    }, 900);

    try {
      const res = await fetch("/api/ads/adlaunch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: draft.id,
          prompt,
          image_mode: "template",
          scheduled_start: scheduledStart || null,
          destination,
          product_destination_url: productDestinationUrl,
        }),
      });
      const data = await res.json();
      clearInterval(stepTimer);
      setExecutionStepIndex(EXECUTION_STEPS.length - 1);

      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setResult(data);
      setTimeout(() => setStage("success"), 500);
    } catch (err: any) {
      clearInterval(stepTimer);
      setError(err.message);
      setStage("error");
    }
  }

  function handleModify() {
    setStage("form");
  }

  function handleStartOver() {
    setStage("form");
    setPhotoBase64(null);
    setPhotoPreview(null);
    setPrompt("");
    setDraft(null);
    setPlan(null);
    setResult(null);
    setError(null);
    setProductDestinationUrl(null);
    setDestination("instant_form");
  }

  // ------------------------------------------------------------
  // Stage: form
  // ------------------------------------------------------------
  if (stage === "form") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
            <Rocket className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Launch Ad — Full Auto</h1>
            <p className="text-sm text-slate-500">Give a photo + requirement, the full ad gets ready</p>
          </div>
        </div>

        <div className="bg-slate-100 rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">1. Photo</p>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          {photoPreview ? (
            <div className="relative">
              <img src={photoPreview} alt="" className="w-full h-56 object-cover rounded-lg" />
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                <button onClick={() => setShowProductPicker(true)} className="btn-secondary text-xs">
                  <Store className="w-3.5 h-3.5" /> Pick from Store
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-xs">
                  Change Photo
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-slate-100 text-slate-900 h-40 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-purple-400 hover:text-purple-500 transition-colors"
              >
                <ImagePlus className="w-8 h-8" />
                <span className="text-sm font-medium">Select Photo</span>
              </button>
              <button
                onClick={() => setShowProductPicker(true)}
                className="bg-slate-100 text-slate-900 h-40 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-purple-400 hover:text-purple-500 transition-colors"
              >
                <Store className="w-8 h-8" />
                <span className="text-sm font-medium">Pick from Store</span>
              </button>
            </div>
          )}
        </div>

        {showProductPicker && (
          <ProductPicker
            onClose={() => setShowProductPicker(false)}
            onSelect={(photoBase64, promptPrefill, productUrl) => {
              setPhotoBase64(photoBase64);
              setPhotoPreview(photoBase64);
              setPrompt((prev) => (prev.trim() ? prev : promptPrefill));
              if (productUrl) {
                setDestination("website");
                setProductDestinationUrl(productUrl);
              }
              setShowProductPicker(false);
            }}
          />
        )}

        <div className="bg-slate-100 rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">2. Describe your requirement in one line</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Swift wanted, Lucknow, budget up to 8 lakh, daily spend 500"
            className="bg-slate-100 text-slate-900 w-full h-24 p-3 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="space-y-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setPrompt(ex)}
                className="block w-full text-left text-xs text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg px-3 py-2 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>

          <button
            onClick={handleCheckCompetitors}
            disabled={competitorLoading || prompt.trim().length < 3}
            className="btn-secondary text-xs w-full justify-center"
          >
            {competitorLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Check what competitors are running for this
          </button>

          {competitorSearched && !competitorLoading && (
            <div className="space-y-2 pt-1">
              {competitorError ? (
                <p className="text-xs text-slate-400">{competitorError}</p>
              ) : competitorAds.length === 0 ? (
                <p className="text-xs text-slate-400">No active competitor ads found for this.</p>
              ) : (
                competitorAds.slice(0, 3).map((ad, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                    <p className="text-xs font-semibold text-slate-700">{ad.page_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{ad.body ?? ad.title ?? "—"}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="bg-slate-100 rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">3. Where should clicks go?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDestination("instant_form")}
              className={`text-left p-3 rounded-lg border text-xs transition-colors ${
                destination === "instant_form" ? "border-purple-400 ring-2 ring-purple-500/30 bg-purple-500/10" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="font-semibold text-slate-800">Instant Form</p>
              <p className="text-slate-400 mt-0.5">Stays inside Facebook — fastest for the lead</p>
            </button>
            <button
              onClick={() => setDestination("website")}
              className={`text-left p-3 rounded-lg border text-xs transition-colors ${
                destination === "website" ? "border-purple-400 ring-2 ring-purple-500/30 bg-purple-500/10" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="font-semibold text-slate-800">My Website</p>
              <p className="text-slate-400 mt-0.5">Sends clicks to your landing page or own site</p>
            </button>
          </div>
          {productDestinationUrl && destination === "website" && (
            <p className="text-xs text-purple-400 truncate">
              Linked to this exact product page: {productDestinationUrl}
            </p>
          )}
        </div>

        <div className="bg-slate-100 rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">4. Schedule (optional)</p>
          <p className="text-xs text-slate-400">Leave this blank to have it ready now (paused) — you'll activate it yourself from the Campaigns page.</p>
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="datetime-local"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="bg-slate-100 text-slate-900 flex-1 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <button
          onClick={handlePreview}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Sparkles className="w-4 h-4" /> Preview Campaign
        </button>

        {error && (
          <div className="bg-red-500/10 border border-red-700/50 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------
  // Stage: previewing (generating plan + creative)
  // ------------------------------------------------------------
  if (stage === "previewing") {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        <p className="text-sm text-slate-500">Writing your ad copy and building the creative...</p>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Stage: preview (the Plan Card — Block 2)
  // ------------------------------------------------------------
  if (stage === "preview" && plan && draft) {
    const estLow = plan.estimated_leads_low ?? Math.round((plan.daily_budget ?? 500) * 30 / 250);
    const estHigh = plan.estimated_leads_high ?? Math.round((plan.daily_budget ?? 500) * 30 / 120);

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <button onClick={handleModify} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back to edit
        </button>

        <div className="bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <img src={draft.generated_image_url} alt="" className="w-full aspect-square object-cover" />
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{plan.headline}</h2>
              <ScoreBadge score={plan.confidence_score} />
            </div>
            <p className="text-sm text-slate-500">{plan.body}</p>
            {plan.score_reasoning && <p className="text-xs text-slate-400 italic">"{plan.score_reasoning}"</p>}

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Daily Budget</p>
                  <p className="text-sm font-semibold text-slate-800">₹{plan.daily_budget}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Audience</p>
                  <p className="text-sm font-semibold text-slate-800">{plan.targeting_city ?? "All India"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Est. Monthly Leads</p>
                  <p className="text-sm font-semibold text-slate-800">{estLow}-{estHigh}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <span className="badge bg-slate-50 text-slate-600 border-slate-200">
                {destination === "website" ? "Sends to Website" : "Instant Form"}
              </span>
              {scheduledStart && <span className="badge bg-slate-50 text-slate-600 border-slate-200">Scheduled</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleModify} className="btn-secondary flex-1 justify-center">
            Modify
          </button>
          <button onClick={handleConfirmLaunch} className="btn-primary flex-1 justify-center">
            <Rocket className="w-4 h-4" /> Launch Campaign
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Stage: launching (Block 4 — live execution screen)
  // ------------------------------------------------------------
  if (stage === "launching") {
    return (
      <div className="max-w-md mx-auto py-16">
        <div className="space-y-4">
          {EXECUTION_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  i < executionStepIndex ? "bg-green-500" : i === executionStepIndex ? "bg-purple-500/20" : "bg-slate-100"
                }`}
              >
                {i < executionStepIndex ? (
                  <Check className="w-3.5 h-3.5 text-white" />
                ) : i === executionStepIndex ? (
                  <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                )}
              </div>
              <span className={`text-sm ${i <= executionStepIndex ? "text-slate-800 font-medium" : "text-slate-300"}`}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Stage: success
  // ------------------------------------------------------------
  if (stage === "success" && result) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-5">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto animate-fade-in-up">
          <PartyPopper className="w-8 h-8 text-green-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Campaign Successfully Launched!</h2>
          <p className="text-sm text-slate-500 mt-1">It's sitting Paused in Meta Ads Manager — activate it when you're ready from My Campaigns.</p>
        </div>
        <div className="flex items-center gap-3 justify-center">
          <button onClick={handleStartOver} className="btn-secondary">Launch Another</button>
          <Link href="/dashboard/ads/campaigns" className="btn-primary">Go to My Campaigns</Link>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Stage: error
  // ------------------------------------------------------------
  return (
    <div className="max-w-md mx-auto py-16 text-center space-y-5">
      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900">Couldn't launch this one</h2>
        <p className="text-sm text-red-400 mt-1">{error}</p>
      </div>
      <div className="flex items-center gap-3 justify-center">
        <button onClick={handleModify} className="btn-secondary">Back to Edit</button>
        <button onClick={handleConfirmLaunch} className="btn-primary">Try Again</button>
      </div>
    </div>
  );
}
