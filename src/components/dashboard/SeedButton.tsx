"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
    <Button onClick={handleSeed} variant="secondary" loading={loading}>
      {loading ? "Seeding..." : <><Database className="w-4 h-4" /> Load Demo Data</>}
    </Button>
  );
}
