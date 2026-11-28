// Where a product is sold — migration 249, 28 November 2026.
//
// THE FOUNDER'S ASK: one switch per product — Instagram only, Website only,
// or Both (default). An Instagram-only product never appears on the
// website; a Website-only product is never offered in Instagram DM selling.
//
// ONE RULE, ONE PLACE. Every reader asks `soldOn(row, channel)` rather than
// comparing strings itself, so the two channels cannot drift apart.
//
// AN UNKNOWN VALUE READS AS 'both'. That is what every product was before
// this column existed, and what the database defaults to; hiding a product
// because a value could not be read would take it off sale silently.

export type SalesChannel = "both" | "website" | "instagram";
export type Channel = "website" | "instagram";

export const SALES_CHANNELS: { value: SalesChannel; label: string }[] = [
  { value: "both", label: "Website and Instagram" },
  { value: "website", label: "Website only" },
  { value: "instagram", label: "Instagram only" },
];

export function readSalesChannel(value: unknown): SalesChannel {
  return value === "website" || value === "instagram" ? value : "both";
}

/** Is a product with this setting sold on `channel`? */
export function soldOn(salesChannel: unknown, channel: Channel): boolean {
  const set = readSalesChannel(salesChannel);
  return set === "both" || set === channel;
}

/** A value a request may set — anything else is refused, never defaulted. */
export function isSalesChannel(value: unknown): value is SalesChannel {
  return value === "both" || value === "website" || value === "instagram";
}
