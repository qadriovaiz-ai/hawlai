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

export async function validateDiscountCode(supabase: any, dealershipId: string, code: string, subtotal: number): Promise<DiscountCheckResult> {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!normalized) return { valid: false, error: "Enter a code" };

  const { data: discount } = await supabase
    .from("discount_codes")
    .select("*")
    .eq("dealership_id", dealershipId)
    .eq("code", normalized)
    .maybeSingle();

  if (!discount) return { valid: false, error: "Invalid code" };
  if (!discount.is_active) return { valid: false, error: "This code is no longer active" };
  if (discount.expires_at && new Date(discount.expires_at) < new Date()) return { valid: false, error: "This code has expired" };
  if (discount.max_uses != null && discount.used_count >= discount.max_uses) return { valid: false, error: "This code has reached its usage limit" };
  if (discount.min_order_value != null && subtotal < Number(discount.min_order_value)) {
    return { valid: false, error: `Minimum order of ₹${discount.min_order_value} required for this code` };
  }

  const discountAmount = discount.discount_type === "fixed"
    ? Math.min(Number(discount.value), subtotal)
    : Math.round((subtotal * Number(discount.value)) / 100 * 100) / 100;

  return { valid: true, discountId: discount.id, discountAmount };
}
