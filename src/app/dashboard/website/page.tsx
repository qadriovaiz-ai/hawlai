"use client";

import { useState, useEffect, useRef } from "react";
import { Globe, Loader2, Sparkles, ImagePlus, Check, ExternalLink, AlertCircle, Plus, X, Link2 } from "lucide-react";
import { LANDING_THEMES } from "@/lib/landingThemes";

interface CarListing {
  name: string;
  price?: string;
  image_url?: string;
}

export default function WebsitePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingExternal, setSavingExternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [slug, setSlug] = useState("");
  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [offerText, setOfferText] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [published, setPublished] = useState(false);
  const [theme, setTheme] = useState("navy_amber");
  const [cars, setCars] = useState<CarListing[]>([]);
  const [externalUrl, setExternalUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCarIndex, setUploadingCarIndex] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/website")
      .then((res) => res.json())
      .then((data) => {
        const page = data?.landingPage;
        if (page) {
          setSlug(page.slug ?? "");
          setHeadline(page.headline ?? "");
          setSubheadline(page.subheadline ?? "");
          setOfferText(page.offer_text ?? "");
          setHeroImageUrl(page.hero_image_url ?? "");
          setPublished(page.published ?? false);
          setTheme(page.theme ?? "navy_amber");
          setCars(page.car_listings ?? []);
        }
        setExternalUrl(data?.externalWebsiteUrl ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/website/generate-copy", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setHeadline(data.headline);
      setSubheadline(data.subheadline);
      setOfferText(data.offer_text);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function uploadImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch("/api/website/upload-hero", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photo_base64: reader.result, filename: "img" }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Upload failed");
          resolve(data.url);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleHeroChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      setHeroImageUrl(await uploadImage(file));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleCarImageChange(e: React.ChangeEvent<HTMLInputElement>, index: number) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCarIndex(index);
    try {
      const url = await uploadImage(file);
      setCars((prev) => prev.map((c, i) => (i === index ? { ...c, image_url: url } : c)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingCarIndex(null);
    }
  }

  function addCar() {
    setCars((prev) => [...prev, { name: "", price: "" }]);
  }
  function updateCar(index: number, field: keyof CarListing, value: string) {
    setCars((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }
  function removeCar(index: number) {
    setCars((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave(publishOverride?: boolean) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/website", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          headline,
          subheadline,
          offer_text: offerText,
          hero_image_url: heroImageUrl,
          published: publishOverride ?? published,
          theme,
          car_listings: cars.filter((c) => c.name.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      if (publishOverride !== undefined) setPublished(publishOverride);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveExternalUrl() {
    setSavingExternal(true);
    setError(null);
    try {
      const res = await fetch("/api/website", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_website_url: externalUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingExternal(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading...
      </div>
    );
  }

  const publicUrl = slug ? `/p/${slug}` : null;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <Globe className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Website</h1>
          <p className="text-sm text-slate-500">A public landing page for your dealership — or link one you already have</p>
        </div>
      </div>

      {/* Already have a website? */}
      <div className="card p-5 space-y-3">
        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-slate-400" /> Already have your own website?
        </label>
        <p className="text-xs text-slate-400">If you set this, ads can point here instead of the built-in page below.</p>
        <div className="flex items-center gap-2">
          <input
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://your-dealership-website.com"
            className="bg-slate-100 text-slate-900 flex-1 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button onClick={handleSaveExternalUrl} disabled={savingExternal} className="btn-secondary text-sm">
            {savingExternal ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">— or use Hawlai's built-in page —</p>

      <div className="card p-5 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Page URL</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400 shrink-0">/p/</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="your-dealership-name"
            className="bg-slate-100 text-slate-900 flex-1 p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        {publicUrl && (
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:underline inline-flex items-center gap-1">
            Preview page <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="card p-5 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Theme</label>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(LANDING_THEMES).map((t) => (
            <button
              key={t.key}
              onClick={() => setTheme(t.key)}
              className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                theme === t.key ? "border-purple-400 ring-2 ring-purple-100" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex shrink-0">
                <div className="w-4 h-4 rounded-l" style={{ backgroundColor: t.dark }} />
                <div className="w-4 h-4 rounded-r" style={{ backgroundColor: t.accent }} />
              </div>
              <span className="text-xs font-medium text-slate-700">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">Content</label>
          <button onClick={handleGenerate} disabled={generating} className="btn-secondary text-xs">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate with AI
          </button>
        </div>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Headline"
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          value={subheadline}
          onChange={(e) => setSubheadline(e.target.value)}
          placeholder="Subheadline"
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          value={offerText}
          onChange={(e) => setOfferText(e.target.value)}
          placeholder="Offer / call to action"
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div className="card p-5 space-y-3">
        <label className="text-sm font-semibold text-slate-700 block">Hero Image (optional)</label>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleHeroChange} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-slate-100 text-slate-900 w-full border-2 border-dashed border-slate-200 rounded-lg py-4 flex flex-col items-center gap-2 hover:border-purple-300 transition-colors"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          ) : heroImageUrl ? (
            <img src={heroImageUrl} alt="" className="max-h-32 rounded-lg" />
          ) : (
            <>
              <ImagePlus className="w-5 h-5 text-slate-400" />
              <span className="text-xs text-slate-500">Upload an image</span>
            </>
          )}
        </button>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">Featured Cars (optional)</label>
          <button onClick={addCar} className="btn-secondary text-xs">
            <Plus className="w-3.5 h-3.5" /> Add car
          </button>
        </div>
        {cars.length === 0 && <p className="text-xs text-slate-400">Add specific cars/offers to show in a gallery on the page.</p>}
        {cars.map((car, i) => (
          <div key={i} className="bg-slate-100 text-slate-900 flex items-center gap-2 border border-slate-100 rounded-lg p-2.5">
            <input
              ref={i === 0 ? carFileInputRef : undefined}
              type="file"
              accept="image/*"
              onChange={(e) => handleCarImageChange(e, i)}
              className="hidden"
              id={`car-file-${i}`}
            />
            <label htmlFor={`car-file-${i}`} className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer overflow-hidden">
              {uploadingCarIndex === i ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : car.image_url ? (
                <img src={car.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImagePlus className="w-4 h-4 text-slate-400" />
              )}
            </label>
            <input
              value={car.name}
              onChange={(e) => updateCar(i, "name", e.target.value)}
              placeholder="Car name"
              className="bg-slate-100 text-slate-900 flex-1 p-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <input
              value={car.price ?? ""}
              onChange={(e) => updateCar(i, "price", e.target.value)}
              placeholder="Price"
              className="bg-slate-100 text-slate-900 w-28 p-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button onClick={() => removeCar(i)} className="text-slate-300 hover:text-red-500 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => handleSave()} disabled={saving} className="btn-secondary flex-1 justify-center">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saved ? "Saved" : "Save Draft"}
        </button>
        <button
          onClick={() => handleSave(!published)}
          disabled={saving || !slug}
          className={published ? "btn-secondary flex-1 justify-center text-amber-600" : "btn-primary flex-1 justify-center"}
        >
          {published ? "Unpublish" : "Publish Page"}
        </button>
      </div>
      {published && <p className="text-xs text-green-600 text-center">✅ Live — accepting leads from the public</p>}
    </div>
  );
}
