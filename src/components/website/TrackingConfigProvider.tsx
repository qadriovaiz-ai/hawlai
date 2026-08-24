"use client";

import { createContext, useContext } from "react";

// Makes the business's tracking config available to client components
// under the storefront layout (piece 4/7).
//
// A context rather than a public API endpoint: the layout is a server
// component that ALREADY loads these values for TrackingScripts, so
// fetching them again from the checkout page would be a redundant
// round-trip on the most latency-sensitive page in the app. App Router
// can't pass props from a layout to a page, but it can render a client
// provider around them — which is exactly what this is.
//
// Everything here is already public by nature: these ids are visible
// in the page's own tag markup. The Conversions API token is
// deliberately NOT part of this — that's a secret and stays
// server-side only.

export interface TrackingConfig {
  googleAdsConversionId: string | null;
  googleAdsConversionLabel: string | null;
  googleRemarketingEnabled: boolean;
}

const EMPTY: TrackingConfig = {
  googleAdsConversionId: null,
  googleAdsConversionLabel: null,
  googleRemarketingEnabled: false,
};

const TrackingConfigContext = createContext<TrackingConfig>(EMPTY);

export function TrackingConfigProvider({ config, children }: { config: TrackingConfig; children: React.ReactNode }) {
  return <TrackingConfigContext.Provider value={config}>{children}</TrackingConfigContext.Provider>;
}

/** Defaults to everything-off, so a component used outside the provider silently tracks nothing rather than crashing. */
export function useTrackingConfig(): TrackingConfig {
  return useContext(TrackingConfigContext);
}
