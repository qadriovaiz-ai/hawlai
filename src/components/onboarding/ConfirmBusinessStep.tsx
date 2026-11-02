"use client";

// ONBOARDING STEP 3 — "Is this your business?" P3.
//
// THE SCREEN WHOSE WHOLE JOB IS TO BE CHECKED, so every field says
// where its value came from. The reference design headed this screen
// "Pulled from your website", and for two of its three fields that was
// false: the extractor returned a category but no name and no city, so
// those were the owner's own typing from signup being shown back to him
// as an analysis. P3 taught the extractor to return a name and a city
// where the source states them, and lib/onboarding/provenance.ts
// decides what each field is labelled when it does not.
//
// AND THE LABEL FOLLOWS STEP 2's BRANCH. For Maps and social the
// analysis read the owner's couple of sentences, not the listing —
// step 2 says it cannot read either — so those fields say "from what
// you told me" rather than naming a source that was never read.
//
// NOTHING IS SAVED UNTIL HE PRESSES THE BUTTON. The draft is a
// proposal until this point, which is the same rule the flow already
// followed for the brand profile.
//
// Colours are the app's own tokens, not the mockup's light theme.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { resolveField, type FieldSource } from "@/lib/onboarding/provenance";
import type { ConnectKind } from "@/lib/onboarding/steps";

export type ConfirmedBusiness = { name: string; category: string; city: string };

/** A field that has never been answered must be answered here. */
export const REQUIRED_FIELDS: (keyof ConfirmedBusiness)[] = ["name", "category"];

function Field({
  id,
  label,
  value,
  source,
  hint,
  placeholder,
  required,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  source: FieldSource;
  hint: string | null;
  placeholder: string;
  required: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label htmlFor={id} className="text-xs font-semibold text-slate-800">
          {label}
          {required && value.trim() === "" && <span className="text-red-400"> *</span>}
        </label>
        {/* THE PROVENANCE, on the field it belongs to. Absent rather
            than guessed when nobody has said the value yet. */}
        {hint && (
          <span className={`text-[10.5px] ${source === "analysis" ? "text-brand-400" : "text-slate-400"}`}>
            {hint}
          </span>
        )}
      </div>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input text-sm"
      />
    </div>
  );
}

export default function ConfirmBusinessStep({
  kind,
  analysed,
  onRecord,
  onConfirmed,
  onSkip,
}: {
  /** Which branch of step 2 ran, so a label cannot name a source it did not read. */
  kind: ConnectKind;
  /** What the extractor returned. Empty strings where the source did not say. */
  analysed: { business_name?: string; city?: string; business_category?: string } | null;
  /** What is already on the business's record, from signup. */
  onRecord: { name?: string | null; city?: string | null; category?: string | null };
  onConfirmed: (confirmed: ConfirmedBusiness) => Promise<void> | void;
  onSkip?: () => void;
}) {
  const name = resolveField(analysed?.business_name, onRecord.name, kind);
  const category = resolveField(analysed?.business_category, onRecord.category, kind);
  const city = resolveField(analysed?.city, onRecord.city, kind);

  const [fields, setFields] = useState<ConfirmedBusiness>({
    name: name.value,
    category: category.value,
    city: city.value,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A NAME AND A TYPE ARE NEEDED; A CITY IS NOT. Plenty of businesses
  // are not in one place, and an online-only shop asked to name a city
  // would either guess or be stuck.
  const ready = REQUIRED_FIELDS.every((key) => fields[key].trim().length > 0);

  async function handleConfirm() {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirmed({
        name: fields.name.trim(),
        category: fields.category.trim(),
        city: fields.city.trim(),
      });
    } catch (err: any) {
      setError(err.message ?? "Couldn't save that — try again");
    } finally {
      setSaving(false);
    }
  }

  const anyAnalysed = [name.source, category.source, city.source].includes("analysis");

  return (
    <div className="w-full max-w-lg space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Is this your business?</h1>
        <p className="text-sm text-slate-500 mt-1">
          {anyAnalysed
            ? "Fix anything that's off — each line says where I got it from."
            : "I could not work these out, so please fill them in."}
        </p>
      </div>

      <div className="space-y-4">
        <Field
          id="confirm-name"
          label="Business name"
          value={fields.name}
          source={name.source}
          hint={name.label}
          placeholder="What you call your business"
          required
          onChange={(next) => setFields((f) => ({ ...f, name: next }))}
        />
        <Field
          id="confirm-category"
          label="What kind of business is it?"
          value={fields.category}
          source={category.source}
          hint={category.label}
          placeholder="In a few words"
          required
          onChange={(next) => setFields((f) => ({ ...f, category: next }))}
        />
        <Field
          id="confirm-city"
          label="City"
          value={fields.city}
          source={city.source}
          hint={city.label}
          placeholder="Leave blank if you sell everywhere"
          required={false}
          onChange={(next) => setFields((f) => ({ ...f, city: next }))}
        />
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
          onClick={handleConfirm}
          disabled={!ready || saving}
          className="btn-primary justify-center disabled:opacity-45"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Looks right
        </button>
      </div>
    </div>
  );
}
