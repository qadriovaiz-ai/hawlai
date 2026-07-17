"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/utils";

export default function PageTracker({ slug, variant }: { slug: string; variant?: string | null }) {
  useEffect(() => {
    trackEvent(slug, "view", undefined, variant);

    function handleClick(e: MouseEvent) {
      const doc = document.documentElement;
      const xPct = (e.pageX / doc.scrollWidth) * 100;
      const yPct = (e.pageY / doc.scrollHeight) * 100;
      trackEvent(slug, "click", { xPct, yPct }, variant);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [slug, variant]);

  return null;
}
