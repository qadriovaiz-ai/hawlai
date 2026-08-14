"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FlaskConical } from "lucide-react";

export default function TestVariantButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ads/campaigns/${campaignId}/variant-group`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start a variant test");
      router.push(`/dashboard/ads/full-launch?variantGroupId=${data.variantGroupId}&variantLabel=${encodeURIComponent(data.nextLabel)}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button onClick={handleClick} disabled={loading} className="btn-secondary text-xs">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
        Test a variant
      </button>
      {error && <p className="text-[10.5px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}
