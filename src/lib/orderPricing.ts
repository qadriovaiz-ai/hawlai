import { validateDiscountCode } from "@/lib/discounts";

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

  const { data: website } = await supabase.from("websites").select("id, dealership_id, published").eq("slug", slug).maybeSingle();
  if (!website || !website.published) return { ok: false, status: 404, error: "This store isn't accepting orders right now" };

  const productIds = items.map((it: any) => it.productId).filter(Boolean);
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, price, is_active, inventory_count")
    .in("id", productIds)
    .eq("dealership_id", website.dealership_id);
  if (productsError) return { ok: false, status: 500, error: "Couldn't verify products" };

  const productMap = new Map<string, ResolvedProduct>((products ?? []).map((p: ResolvedProduct) => [p.id, p]));
  const resolvedItems: ResolvedOrderItem[] = [];
  let subtotal = 0;

  for (const raw of items) {
    const product = productMap.get(raw.productId);
    if (!product || !product.is_active) {
      return { ok: false, status: 400, error: "An item in your cart is no longer available" };
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
    const result = await validateDiscountCode(supabase, website.dealership_id, discountCode, subtotal);
    if (!result.valid) return { ok: false, status: 400, error: result.error ?? "Invalid discount code" };
    discountAmount = result.discountAmount ?? 0;
    appliedDiscountId = result.discountId ?? null;
  }

  const total = Math.max(0, subtotal - discountAmount);
  return { ok: true, website, resolvedItems, productMap, subtotal, discountAmount, appliedDiscountId, total };
}
