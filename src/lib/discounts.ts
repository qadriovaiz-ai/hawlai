// Shared discount-code validation — used by both the checkout "apply
// code" preview and (critically) by order creation itself, so the
// discount actually charged is always recomputed server-side from the
// live discount_codes row, never trusted from what the client sent.

export interface DiscountCheckResult {
  valid: boolean;
  error?: string;
  discountId?: string;
  discountAmount?: number;
}

/**
 * Whether a discount row can be used at all — active, in date, not used
 * up. Deliberately excludes the minimum-order check, which depends on a
 * particular cart rather than the code itself.
 *
 * Shared so "is this offer live" exists once: checkout validates a code
 * with it, and the claims guard (src/lib/claims) uses the same rule to
 * decide which offers marketing copy may mention. A second copy of this
 * rule would let copy advertise an expired code checkout then refuses.
 */
export function discountUsable(discount: any, now: Date = new Date()): { ok: true } | { ok: false; reason: string } {
  if (!discount) return { ok: false, reason: "Invalid code" };
  if (!discount.is_active) return { ok: false, reason: "This code is no longer active" };
  if (discount.expires_at && new Date(discount.expires_at) < now) return { ok: false, reason: "This code has expired" };
  if (discount.max_uses != null && discount.used_count >= discount.max_uses) return { ok: false, reason: "This code has reached its usage limit" };
  return { ok: true };
}

export async function validateDiscountCode(supabase: any, dealershipId: string, code: string, subtotal: number): Promise<DiscountCheckResult> {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!normalized) return { valid: false, error: "Enter a code" };

  const { data: discount } = await supabase
    .from("discount_codes")
    .select("*")
    .eq("dealership_id", dealershipId)
    .eq("code", normalized)
    .maybeSingle();

  const usable = discountUsable(discount);
  if (!usable.ok) return { valid: false, error: usable.reason };
  if (discount.min_order_value != null && subtotal < Number(discount.min_order_value)) {
    return { valid: false, error: `Minimum order of ₹${discount.min_order_value} required for this code` };
  }

  const discountAmount = discount.discount_type === "fixed"
    ? Math.min(Number(discount.value), subtotal)
    : Math.round((subtotal * Number(discount.value)) / 100 * 100) / 100;

  return { valid: true, discountId: discount.id, discountAmount };
}
