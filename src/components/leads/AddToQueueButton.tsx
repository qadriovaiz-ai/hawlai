"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall } from "lucide-react";
import type { LeadStatus } from "@/types";
import { Button, buttonClasses } from "@/components/ui";

export default function AddToQueueButton({ leadId, currentStatus }: { leadId: string; currentStatus: LeadStatus }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (currentStatus === "ready_to_call") {
    return (
      <span className={buttonClasses("secondary", "md", "opacity-75 cursor-default")}>
        <PhoneCall className="w-4 h-4 text-purple-500" /> In Queue
      </span>
    );
  }

  if (currentStatus === "called" || currentStatus === "converted") return null;

  async function handleClick() {
    setLoading(true);
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ready_to_call" }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button onClick={handleClick} loading={loading} variant="secondary">
      {!loading && <PhoneCall className="w-4 h-4" />}
      Add to Call Queue
    </Button>
  );
}
