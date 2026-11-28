import { validateDiscountCode } from "@/lib/discounts";
import { computeShippingAmount } from "@/lib/shipping";
import { isService } from "@/lib/catalog/catalogItem";

// Shared by both order-creation paths (COD, and Razorpay's
// initiate + verify steps) so prices/discounts are always recomputed
// from the live products/discount_codes tables in exactly one place —
// never trusted from what the client sent, and never allowed to drift
// between the two Razorpay steps.

export interface ResolvedOrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

interface ResolvedProduct {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  inventory_count: number | null;
  kind?: string | null;
}

export type OrderPricingResult =
  | {
      ok: true;
      website: { id: string; dealership_id: string };
      resolvedItems: ResolvedOrderItem[];
      productMap: Map<string, ResolvedProduct>;
      subtotal: number;
      discountAmount: number;
      appliedDiscountId: string | null;
      shippingAmount: number;
      total: number;
    }
  | { ok: false; status: number; error: string };

export async function resolveOrderPricing(
  supabase: any,
  slug: string,
  items: any[],
  discountCode?: string | null
): Promise<OrderPricingResult> {
  if (!slug) return { ok: false, status: 400, error: "Missing page reference" };
  if (!Array.isArray(items) || items.length === 0) return { ok: false, status: 400, error: "Your cart is empty" };

  const { data: website } = await supabase
    .from("websites")
    .select("id, dealership_id, published, shipping_mode, shipping_rate, shipping_free_threshold")
    .eq("slug", slug)
    .maybeSingle();
  if (!website || !website.published) return { ok: false, status: 404, error: "This store isn't accepting orders right now" };

  const priced = await priceItems(supabase, website.dealership_id, website, items, discountCode);
  if (!priced.ok) return priced;
  return { ...priced, website };
}

export type BusinessOrderPricingResult =
  | Omit<Extract<OrderPricingResult, { ok: true }>, "website">
  | { ok: false; status: number; error: string };

/**
 * The same prices and discount, for an order that did not come through a
 * storefront — an Instagram DM (Seller Mode, O2, 28 November 2026). A
 * business without a website can sell this way, so the business, not a
 * slug, is the key.
 *
 * SHIPPING IS THE SELLER MODE FLAT FEE, and only that — migration 243,
 * the founder's decision of 28 November 2026: one number on the Seller
 * Mode card, added to every DM order, ₹0 meaning free delivery. Not the
 * website's rules: O2's first version read them, which left a business
 * without a website at a silent ₹0 and a business with one governed by a
 * setting on a different screen.
 */
export async function resolveBusinessOrderPricing(
  supabase: any,
  dealershipId: string,
  items: any[],
  discountCode: string | null | undefined,
  flatShippingFee: number
): Promise<BusinessOrderPricingResult> {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, status: 400, error: "No items in the order" };
  if (!Number.isFinite(flatShippingFee) || flatShippingFee < 0) return { ok: false, status: 500, error: "The delivery fee setting isn't a valid amount" };

  const rules = flatShippingFee > 0 ? { shipping_mode: "flat", shipping_rate: flatShippingFee } : { shipping_mode: "free" };
  return priceItems(supabase, dealershipId, rules, items, discountCode);
}

type PricedItems =
  | (Omit<Extract<OrderPricingResult, { ok: true }>, "website">)
  | { ok: false; status: number; error: string };

/** One business's live products, discount and shipping — the shared core. */
async function priceItems(
  supabase: any,
  dealershipId: string,
  shippingRules: Parameters<typeof computeShippingAmount>[0],
  items: any[],
  discountCode?: string | null
): Promise<PricedItems> {
  const productIds = items.map((it: any) => it.productId).filter(Boolean);
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, price, is_active, inventory_count, kind")
    .in("id", productIds)
    .eq("dealership_id", dealershipId);
  if (productsError) return { ok: false, status: 500, error: "Couldn't verify products" };

  const productMap = new Map<string, ResolvedProduct>((products ?? []).map((p: ResolvedProduct) => [p.id, p]));
  const resolvedItems: ResolvedOrderItem[] = [];
  let subtotal = 0;

  for (const raw of items) {
    const product = productMap.get(raw.productId);
    if (!product || !product.is_active) {
      return { ok: false, status: 400, error: "An item in your cart is no longer available" };
    }
    // A service is booked, not bought through the cart — and would
    // otherwise be charged shipping.
    if (isService(product)) {
      return { ok: false, status: 400, error: `"${product.name}" is booked, not ordered — remove it from your cart and book it from its page` };
    }
    const qty = Math.max(1, Math.min(99, Number(raw.quantity) || 1));
    if (product.inventory_count != null && product.inventory_count < qty) {
      return { ok: false, status: 400, error: `Only ${product.inventory_count} of "${product.name}" left in stock` };
    }
    resolvedItems.push({ product_id: product.id, name: product.name, price: Number(product.price), quantity: qty });
    subtotal += Number(product.price) * qty;
  }

  let discountAmount = 0;
  let appliedDiscountId: string | null = null;
  if (discountCode) {
    const result = await validateDiscountCode(supabase, dealershipId, discountCode, subtotal);
    if (!result.valid) return { ok: false, status: 400, error: result.error ?? "Invalid discount code" };
    discountAmount = result.discountAmount ?? 0;
    appliedDiscountId = result.discountId ?? null;
  }

  const orderValue = Math.max(0, subtotal - discountAmount);
  const shippingAmount = computeShippingAmount(shippingRules, orderValue);
  const total = orderValue + shippingAmount;
  return { ok: true, resolvedItems, productMap, subtotal, discountAmount, appliedDiscountId, shippingAmount, total };
}
