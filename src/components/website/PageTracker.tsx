"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/utils";

export default function PageTracker({ slug }: { slug: string }) {
  useEffect(() => {
    trackEvent(slug, "view");

    function handleClick(e: MouseEvent) {
      const doc = document.documentElement;
      const xPct = (e.pageX / doc.scrollWidth) * 100;
      const yPct = (e.pageY / doc.scrollHeight) * 100;
      trackEvent(slug, "click", { xPct, yPct });
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [slug]);

  return null;
}
