// Does a product already have the value a chat request asks for?
//
// Card 8C68, 28 Nov 2026. The owner asked for "stock 20"; the chat sent
// the price it had already set (₹499) along with it. The one-change-per-
// card rule refused both, the chat dropped the stock, and the owner was
// shown a ₹499 → ₹499 price card. A field that already has the asked
// value is not a change, so the price tool drops it BEFORE counting.
//
// Compared the way the store compares: money by amount ("499" and
// ₹499.00 are equal), stock by number, "" (cleared) only equal to empty.
// ANYTHING THIS CANNOT READ COUNTS AS A CHANGE — keeping a field the
// owner asked for is safe (it is refused or carded as usual); dropping
// one wrongly would silently ignore an instruction. The "was" price is
// not in the catalog read, so it is always kept.

import type { CatalogProduct } from "@/lib/claims/businessFacts";
import { parseStatedPrice } from "@/lib/publish/money";

export type ProductField = "price" | "name" | "description" | "stock" | "compare_price" | "category" | "visibility";

/** `value` is as asked, already trimmed — "" means "clear it". */
export function productAlreadyHas(product: CatalogProduct, field: ProductField, value: string): boolean {
  if (field === "price") {
    const amount = Number(parseStatedPrice(value).amount ?? NaN);
    return Number.isFinite(amount) && Number.isFinite(Number(product.price)) && Math.abs(amount - Number(product.price)) < 0.005;
  }
  if (field === "stock") {
    if (value === "") return product.inventory == null;
    const n = Number(value);
    return product.inventory != null && Number.isFinite(n) && n === product.inventory;
  }
  if (field === "name") return value !== "" && value === (product.name ?? "").trim();
  if (field === "description") return value !== "" && value === (product.description ?? "").trim();
  if (field === "category") return value === (product.category ?? "").trim();
  if (field === "visibility") {
    if (/^show$/i.test(value)) return product.active === true;
    if (/^hide$/i.test(value)) return product.active === false;
    return false;
  }
  return false;
}
