"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Database } from "lucide-react";

export default function SeedButton({ dealershipId }: { dealershipId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleSeed() {
    setLoading(true);
    const res = await fetch("/api/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealershipId }),
    });
    if (res.ok) {
      setDone(true);
      router.refresh();
    }
    setLoading(false);
  }

  if (done) return null;

  return (
    <button onClick={handleSeed} disabled={loading} className="btn-secondary">
      {loading ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Seeding...</>
      ) : (
        <><Database className="w-4 h-4" /> Load Demo Data</>
      )}
    </button>
  );
}
