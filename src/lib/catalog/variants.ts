// Variants as separate products — V1 of docs/PLAN-INSTAGRAM-SELLER-MODE.md,
// 28 November 2026. NO SCHEMA.
//
// A seller with a kurta in two colours and three sizes adds six products:
// "Kurta – Red – M", "Kurta – Red – L", … Each has its own price and its
// own stock, which is the honest shape: "do you have M?" is answered by
// the product that IS the M, not by a guess about a parent.
//
// THIS FILE ONLY READS NAMES. Products whose names share the part before
// the first separator are siblings; the rest of the name is the option.
// It changes nothing a customer is told by itself: the order flow uses it
// to ASK which one when a customer names only the base, and the DM reply
// is told how to read such names.

/** " – ", " - ", " — ", " | ", " / " — with spaces, so "T-shirt" stays one word. */
const SEPARATOR = /\s+[–—|/-]\s+/;

export function splitVariantName(name: string): { base: string; option: string | null } {
  const clean = String(name ?? "").replace(/\s+/g, " ").trim();
  const at = clean.search(SEPARATOR);
  if (at <= 0) return { base: clean, option: null };
  const m = clean.slice(at).match(SEPARATOR)!;
  return { base: clean.slice(0, at).trim(), option: clean.slice(at + m[0].length).trim() || null };
}

/**
 * The siblings of a base name, as the catalog spells them — or [] when
 * fewer than two products share it (one product is not a choice).
 */
export function variantsOf<T extends { name: string }>(base: string, catalog: T[]): T[] {
  const key = String(base ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!key) return [];
  const siblings = catalog.filter((p) => {
    const s = splitVariantName(p.name);
    return s.option !== null && s.base.toLowerCase() === key;
  });
  return siblings.length >= 2 ? siblings : [];
}

/** Does this catalog sell any product as named variants? */
export function hasVariants(catalog: { name: string }[]): boolean {
  const counts = new Map<string, number>();
  for (const p of catalog) {
    const s = splitVariantName(p.name);
    if (s.option === null) continue;
    const k = s.base.toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if ((counts.get(k) ?? 0) >= 2) return true;
  }
  return false;
}

/**
 * How the model is told to read such a catalog — the "catalog note" of
 * the plan. Only added when the catalog really has variants.
 */
export const VARIANT_NOTE =
  "Some products are options of one item, named like \"Kurta – Red – M\" (item – colour – size). Each is its own product with its own price and stock. When a customer asks about an option (\"do you have it in M?\"), answer ONLY from the product whose name has that exact option; if no product has it, say it isn't available. Never assume an option exists.";
