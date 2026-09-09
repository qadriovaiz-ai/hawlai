"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/storefront/attribution";

/**
 * Records which ad brought this visitor, once, on landing.
 *
 * Rendered on the storefront pages a Hawlai ad can point at. Renders
 * nothing and blocks nothing — a visitor whose browser refuses storage
 * still shops normally, they are simply not attributable.
 */
export function CaptureAttribution() {
  useEffect(() => {
    captureAttribution(window.location.href);
  }, []);
  return null;
}
