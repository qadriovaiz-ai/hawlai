// Pure function, no server-only imports — used both in the checkout
// page (to preview the shipping cost as the cart changes) and in
// resolveOrderPricing (the authoritative, server-recomputed amount
// actually charged). orderValue is the order total after discount,
// before shipping — i.e. what a "free shipping above ₹X" threshold
// compares against.

export interface ShippingSettings {
  shipping_mode?: string | null;
  shipping_rate?: number | null;
  shipping_free_threshold?: number | null;
}

export function computeShippingAmount(settings: ShippingSettings | null | undefined, orderValue: number): number {
  const mode = settings?.shipping_mode ?? "free";
  if (mode === "free") return 0;

  const rate = Math.max(0, Number(settings?.shipping_rate ?? 0));
  if (mode === "flat") return rate;

  if (mode === "free_above") {
    const threshold = settings?.shipping_free_threshold != null ? Number(settings.shipping_free_threshold) : null;
    if (threshold != null && orderValue >= threshold) return 0;
    return rate;
  }

  return 0;
}
