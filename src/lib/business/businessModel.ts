// What KIND of business this is — the structured signal every department
// branches on. business_category stays free text ("Home fragrance",
// "Real estate") for prompts; this says how the business makes money.
//
// WHY (approved 2026-09-17): nothing in Hawlai reliably knew whether a
// business sells products, services, subscriptions or to other businesses.
// Branching from a free-text category is how car-dealership defaults
// survived unnoticed for so long. More than one model is allowed — a
// salon sells services and products.

export const BUSINESS_MODELS = ["products", "services", "subscription", "b2b"] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];

export const BUSINESS_MODEL_OPTIONS: Record<BusinessModel, { label: string; hint: string }> = {
  products: { label: "Products", hint: "Customers buy goods from you — in a shop, online or both" },
  services: { label: "Services", hint: "Appointments, consultations, classes, projects or bookings" },
  subscription: { label: "Subscriptions or memberships", hint: "Customers pay you regularly for a plan" },
  b2b: { label: "Business customers (B2B)", hint: "You mainly sell to other businesses, not individuals" },
};

/** A valid, de-duplicated list in canonical order — or null when the input isn't a list of known models. */
export function cleanBusinessModels(input: unknown): BusinessModel[] | null {
  if (!Array.isArray(input)) return null;
  if (!input.every((m) => typeof m === "string" && (BUSINESS_MODELS as readonly string[]).includes(m))) return null;
  return BUSINESS_MODELS.filter((m) => input.includes(m));
}

/**
 * The models to act on: what the owner said, else a guess from what's on
 * record (a catalogue of products → a products business), flagged as a
 * guess so screens can ask the owner to confirm.
 */
export function effectiveBusinessModels(
  declared: unknown,
  signals: { productCount: number }
): { models: BusinessModel[]; inferred: boolean } {
  const clean = cleanBusinessModels(declared);
  if (clean && clean.length) return { models: clean, inferred: false };
  return { models: signals.productCount > 0 ? ["products"] : [], inferred: true };
}

export function describeBusinessModels(models: BusinessModel[]): string {
  if (!models.length) return "not set";
  return models.map((m) => BUSINESS_MODEL_OPTIONS[m].label.toLowerCase()).join(", ");
}
