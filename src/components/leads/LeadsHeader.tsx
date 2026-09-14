"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Upload, Download, Loader2, X, CheckCircle, AlertCircle } from "lucide-react";
import { qualifyLead } from "@/lib/ai-engine";
import { buttonClasses } from "@/components/ui";
import { CSV_CONSENT_SOURCES } from "@/lib/email/consentSources";

interface UploadResult {
  success: number;
  errors: string[];
}

export default function LeadsHeader({ dealershipId, exportHref }: { dealershipId: string; exportHref?: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  // An uploaded list is only accepted with the owner's confirmation of
  // where these people's consent came from — the server enforces it too.
  const [consentSource, setConsentSource] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const consentReady = Boolean(consentSource) && consentConfirmed;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Record<string, string>[];
        const leads = [];
        const errors: string[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const name = row["Name"] ?? row["name"] ?? "";
          const phone = row["Phone"] ?? row["phone"] ?? "";
          const vehicle = row["Vehicle"] ?? row["vehicle"] ?? "";
          const purchaseYearStr = row["Purchase Year"] ?? row["purchase_year"] ?? "";
          const budgetStr = row["Budget"] ?? row["budget"] ?? "";
          const email = (row["Email"] ?? row["email"] ?? "").trim();

          if (!name) { errors.push(`Row ${i + 2}: Missing name`); continue; }
          if (!phone || phone.length < 10) { errors.push(`Row ${i + 2}: Invalid phone`); continue; }
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`Row ${i + 2}: Invalid email`); continue; }

          const purchaseYear = purchaseYearStr ? parseInt(purchaseYearStr) : null;
          const budget = budgetStr ? parseFloat(budgetStr.replace(/[^0-9.]/g, "")) : null;
          const qualification = qualifyLead({ purchaseYear, budget, phone });

          leads.push({
            dealership_id: dealershipId,
            name,
            phone,
            email: email || null,
            vehicle: vehicle || null,
            purchase_year: purchaseYear,
            budget,
            ai_score: qualification.score,
            lead_temperature: qualification.temperature,
            qualification_reason: qualification.reason,
            source: "csv_upload",
            status: "new",
          });
        }

        if (leads.length > 0) {
          const res = await fetch("/api/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leads, consent: { source: consentSource, confirmed: consentConfirmed } }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) setResult({ success: 0, errors: [data.error ?? "Upload failed — nothing was imported.", ...errors] });
          else setResult({ success: data.count ?? leads.length, errors });
        } else {
          setResult({ success: 0, errors });
        }

        setUploading(false);
        router.refresh();
        if (fileRef.current) fileRef.current.value = "";
      },
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage and qualify your leads</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Owners and admins only; carries the table's temperature and status filters. */}
          {exportHref && (
            <a href={exportHref} className={buttonClasses("secondary", "md")}>
              <Download className="w-4 h-4" /> Export CSV
            </a>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            id="csv-upload"
            disabled={!consentReady || uploading}
          />
          <label
            htmlFor="csv-upload"
            aria-disabled={!consentReady}
            title={consentReady ? undefined : "Confirm where these contacts came from first"}
            className={buttonClasses("primary", "md", consentReady ? "cursor-pointer" : "cursor-not-allowed opacity-50")}
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="w-4 h-4" /> Upload CSV</>
            )}
          </label>
        </div>
      </div>

      {/* Consent — required before a list can be uploaded */}
      <div className="card p-4 mb-4 space-y-3">
        <label htmlFor="csv-consent-source" className="text-sm font-semibold text-slate-700 block">Where did these contacts come from?</label>
        <select
          id="csv-consent-source"
          value={consentSource}
          onChange={(e) => setConsentSource(e.target.value)}
          className="bg-slate-100 text-slate-900 w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Choose one…</option>
          {Object.entries(CSV_CONSENT_SOURCES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} className="mt-0.5" />
          <span>Everyone in this file gave my business their details and agreed to hear from us. I didn&apos;t buy, rent or scrape this list.</span>
        </label>
      </div>

      {/* CSV Format hint */}
      <div className="bg-blue-500/10 border border-blue-700/40 rounded-lg px-4 py-3 mb-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300">
          CSV format: <strong>Name, Phone, Email, Vehicle, Purchase Year, Budget</strong> (Email is optional) — All leads are automatically scored by the AI engine.
        </p>
      </div>

      {/* Upload result */}
      {result && (
        <div className={`rounded-lg px-4 py-3 mb-4 flex items-start gap-3 ${result.success > 0 ? "bg-green-500/10 border border-green-700/40" : "bg-red-500/10 border border-red-700/40"}`}>
          {result.success > 0 ? (
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          ) : (
            <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          )}
          <div>
            {result.success > 0 && (
              <p className="text-sm font-medium text-green-300">{result.success} leads imported successfully</p>
            )}
            {result.errors.length > 0 && (
              <ul className="text-xs text-red-400 mt-1 space-y-0.5">
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                {result.errors.length > 5 && <li>...and {result.errors.length - 5} more errors</li>}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
