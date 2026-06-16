"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Upload, Loader2, X, CheckCircle, AlertCircle } from "lucide-react";
import { qualifyLead } from "@/lib/ai-engine";

interface UploadResult {
  success: number;
  errors: string[];
}

export default function LeadsHeader({ dealershipId }: { dealershipId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

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

          if (!name) { errors.push(`Row ${i + 2}: Missing name`); continue; }
          if (!phone || phone.length < 10) { errors.push(`Row ${i + 2}: Invalid phone`); continue; }

          const purchaseYear = purchaseYearStr ? parseInt(purchaseYearStr) : null;
          const budget = budgetStr ? parseFloat(budgetStr.replace(/[^0-9.]/g, "")) : null;
          const qualification = qualifyLead({ purchaseYear, budget, phone });

          leads.push({
            dealership_id: dealershipId,
            name,
            phone,
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
            body: JSON.stringify({ leads }),
          });
          const data = await res.json();
          setResult({ success: data.count ?? leads.length, errors });
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
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            id="csv-upload"
          />
          <label
            htmlFor="csv-upload"
            className="btn-primary cursor-pointer"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="w-4 h-4" /> Upload CSV</>
            )}
          </label>
        </div>
      </div>

      {/* CSV Format hint */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700">
          CSV format: <strong>Name, Phone, Vehicle, Purchase Year, Budget</strong> — All leads are automatically scored by the AI engine.
        </p>
      </div>

      {/* Upload result */}
      {result && (
        <div className={`rounded-lg px-4 py-3 mb-4 flex items-start gap-3 ${result.success > 0 ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"}`}>
          {result.success > 0 ? (
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          ) : (
            <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          )}
          <div>
            {result.success > 0 && (
              <p className="text-sm font-medium text-green-700">{result.success} leads imported successfully</p>
            )}
            {result.errors.length > 0 && (
              <ul className="text-xs text-red-600 mt-1 space-y-0.5">
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
