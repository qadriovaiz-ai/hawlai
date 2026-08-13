"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Building2, Check, Lock } from "lucide-react";

interface Business {
  id: string;
  dealership_name: string;
  city: string | null;
  plan: string;
  active: boolean;
}

export default function BusinessSwitcherCard({ initialBusinesses, multiBusinessAllowed }: { initialBusinesses: Business[]; multiBusinessAllowed: boolean }) {
  const router = useRouter();
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [switching, setSwitching] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function switchTo(id: string) {
    setSwitching(id);
    setError(null);
    try {
      const res = await fetch("/api/business/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealershipId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't switch");
      setBusinesses((prev) => prev.map((b) => ({ ...b, active: b.id === id })));
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSwitching(null);
    }
  }

  async function addBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealershipName: name, city }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create business");
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 bg-brand-500/20 rounded-lg flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4 text-brand-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Your Businesses</p>
          <p className="text-xs text-slate-400">Switch which business you're managing, or add another</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {businesses.map((b) => (
          <div key={b.id} className="flex items-center justify-between bg-slate-200 rounded-lg p-2.5 gap-2">
            <div className="min-w-0">
              <p className="text-sm text-slate-700 truncate">{b.dealership_name}</p>
              <p className="text-xs text-slate-400 truncate">{b.city ?? "—"} · {b.plan}</p>
            </div>
            {b.active ? (
              <span className="flex items-center gap-1 text-xs text-green-500 font-medium shrink-0"><Check className="w-3.5 h-3.5" /> Active</span>
            ) : (
              <button onClick={() => switchTo(b.id)} disabled={switching === b.id} className="btn-secondary text-xs shrink-0">
                {switching === b.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Switch
              </button>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {!multiBusinessAllowed ? (
        <div className="flex items-center justify-between gap-2 bg-slate-200 rounded-lg p-2.5">
          <span className="flex items-center gap-1.5 text-xs text-slate-500"><Lock className="w-3.5 h-3.5" /> Adding another business needs the Agency plan</span>
          <Link href="/dashboard/billing" className="text-xs text-brand-400 hover:underline shrink-0">Upgrade</Link>
        </div>
      ) : showAddForm ? (
        <form onSubmit={addBusiness} className="space-y-2">
          <input
            type="text"
            placeholder="Business name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
          <input
            type="text"
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="input"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={adding || !name.trim()} className="btn-primary text-xs flex-1 justify-center">
              {adding && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create business
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary text-xs">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowAddForm(true)} className="btn-secondary text-xs w-full justify-center">
          + Add another business
        </button>
      )}
    </div>
  );
}
