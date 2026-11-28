"use client";

// The DM / Seller Mode settings, read and saved the one way every card
// that shows them must: through /api/social/auto-reply-settings, showing
// what the server ANSWERED, never what was hoped (F4's fix, 28 Nov 2026).
//
// Shared since S5 (28 Nov 2026): Seller Mode, the UPI ID and the delivery
// fee moved to the Instagram Store page, while the DM / comment switches
// stay on the Auto-Reply card. Both read and save the same row through the
// same route — one set of checks (sellerModeBlocker, the fee and UPI
// formats), two places to see them.

import { useEffect, useState } from "react";

export type SellerSettings = {
  dmEnabled: boolean;
  commentEnabled: boolean;
  sellingEnabled: boolean;
  upiVpa: string | null;
  shippingFee: number;
  instagramConnected: boolean;
  facebookConnected: boolean;
  takesOrders: boolean;
  log: any[];
};

export function useSellerSettings() {
  const [s, setS] = useState<SellerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<SellerSettings | null> {
    const d = await fetch("/api/social/auto-reply-settings")
      .then((r) => r.json())
      .catch(() => ({ error: "Couldn't load these settings." }));
    if (d?.error) {
      setError(d.error);
      return null;
    }
    setS(d);
    return d;
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  /** True only when the server said yes. The reason is shown when it didn't. */
  async function save(change: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/social/auto-reply-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      }).catch(() => null);
      const d = await res?.json().catch(() => ({}));
      if (!res?.ok) {
        setError(d?.error ?? "That change wasn't saved.");
        return false;
      }
      await load();
      return true;
    } finally {
      setSaving(false);
    }
  }

  return { s, loading, saving, error, save };
}
