"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { trackEvent } from "@/lib/utils";

export default function Popup({
  slug,
  trigger,
  delaySeconds,
  headline,
  body,
  ctaText,
  accentColor,
}: {
  slug: string;
  trigger: string;
  delaySeconds: number;
  headline: string;
  body: string;
  ctaText: string;
  accentColor: string;
}) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    if (trigger === "timed") {
      const timer = setTimeout(() => setShow(true), delaySeconds * 1000);
      return () => clearTimeout(timer);
    }

    // exit_intent — fires when the mouse leaves the top of the viewport
    function handleMouseLeave(e: MouseEvent) {
      if (e.clientY <= 0) {
        setShow(true);
        document.removeEventListener("mouseleave", handleMouseLeave);
      }
    }
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [trigger, delaySeconds, dismissed]);

  useEffect(() => {
    if (show) trackEvent(slug, "popup_shown");
  }, [show, slug]);

  if (!show || dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => { setShow(false); setDismissed(true); }}>
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => { setShow(false); setDismissed(true); }} className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-600">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-xl font-bold text-neutral-900 mb-2 pr-6">{headline}</h3>
        <p className="text-sm text-neutral-600 mb-4">{body}</p>
        <a
          href="#get-in-touch"
          onClick={() => { setShow(false); setDismissed(true); }}
          className="block text-center font-semibold px-4 py-2.5 rounded-lg text-white"
          style={{ backgroundColor: accentColor }}
        >
          {ctaText}
        </a>
      </div>
    </div>
  );
}
