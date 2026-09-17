// What the public store shows: active products and services, each service
// carrying where its "Book" button goes.

import { bookingPageUrl, serviceBookingHref } from "./catalogItem";

export interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[];
  inventory_count: number | null;
  kind?: "product" | "service" | null;
  duration_minutes?: number | null;
  /** A service's booking destination: its own link, else the business's booking page. Null for products, or a service with nowhere to book. */
  book_href?: string | null;
}

export const STOREFRONT_COLUMNS = "id, name, description, price, compare_at_price, images, inventory_count, kind, duration_minutes, booking_url";

export function toStorefrontProduct(row: Record<string, any>, bookingSlug: string | null | undefined): StorefrontProduct {
  const service = row.kind === "service";
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    price: Number(row.price),
    compare_at_price: row.compare_at_price ?? null,
    images: Array.isArray(row.images) ? row.images : [],
    inventory_count: service ? null : row.inventory_count ?? null,
    kind: service ? "service" : "product",
    duration_minutes: service ? row.duration_minutes ?? null : null,
    book_href: service ? serviceBookingHref(row, bookingPageUrl(bookingSlug)) : null,
  };
}

export async function loadStorefrontItems(supabase: any, dealershipId: string): Promise<StorefrontProduct[]> {
  const [{ data: rows }, { data: dealership }] = await Promise.all([
    supabase.from("products").select(STOREFRONT_COLUMNS).eq("dealership_id", dealershipId).eq("is_active", true).order("order_index", { ascending: true }),
    supabase.from("dealerships").select("booking_slug").eq("id", dealershipId).maybeSingle(),
  ]);
  return (rows ?? []).map((r: Record<string, any>) => toStorefrontProduct(r, dealership?.booking_slug));
}
