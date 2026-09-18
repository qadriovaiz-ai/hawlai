// What competitors can claim, by how a business makes money (Advanced
// Strategy step 3, approved 2026-09-19).
//
// A candle shop and a clinic aren't positioned on the same ground: one
// competes on materials, price and delivery, the other on expertise,
// availability and trust. Each claim a competitor makes in public is filed
// under one of these themes, and so is each of the business's own facts —
// the comparison is theme by theme, counted in code.

import type { BusinessModel } from "@/lib/business/businessModel";

export type Theme = { key: string; label: string; hint: string };

export const THEMES: Record<BusinessModel, Theme[]> = {
  products: [
    { key: "price", label: "Price and value", hint: "cheap, affordable, starting at ₹…, best price, value for money" },
    { key: "materials", label: "Materials and quality", hint: "what it's made of, ingredients, premium, long-lasting, tested" },
    { key: "handmade", label: "Handmade, origin and maker", hint: "handmade, small-batch, local, the maker's story, where it's from" },
    { key: "delivery", label: "Delivery and shipping", hint: "free shipping, fast delivery, pan-India, COD, same-day" },
    { key: "offers", label: "Offers and discounts", hint: "sale, % off, coupon, buy-one-get-one, festive offer" },
    { key: "gifting", label: "Gifting and occasions", hint: "gift sets, festivals, weddings, corporate gifts, hampers" },
    { key: "range", label: "Range and customisation", hint: "many options, scents/sizes/colours, personalised, made to order" },
  ],
  services: [
    { key: "expertise", label: "Expertise and credentials", hint: "years of experience, qualifications, specialists, awards" },
    { key: "availability", label: "Availability and speed", hint: "same-day, open 7 days, quick appointments, home visits" },
    { key: "service_price", label: "Price and transparency", hint: "affordable, fixed price, no hidden charges, packages" },
    { key: "guarantee", label: "Guarantees and results", hint: "guaranteed results, free redo, satisfaction promise" },
    { key: "reputation", label: "Reviews and reputation", hint: "5-star, trusted by N clients, testimonials" },
    { key: "convenience", label: "Location and convenience", hint: "near you, easy parking, online booking" },
  ],
  subscription: [
    { key: "plan_price", label: "Plan price", hint: "per month, cheapest plan, annual discount" },
    { key: "included", label: "What's included", hint: "everything in the plan, extras, perks" },
    { key: "flexibility", label: "Flexibility and cancelling", hint: "cancel anytime, pause, no lock-in" },
    { key: "trial", label: "Trial and first month", hint: "free trial, first month free, money-back" },
  ],
  b2b: [
    { key: "reliability", label: "Reliability and consistency", hint: "on-time, consistent quality, trusted suppliers" },
    { key: "lead_time", label: "Lead times", hint: "fast turnaround, delivery in N days" },
    { key: "minimum_order", label: "Minimum order", hint: "low MOQ, bulk pricing, small orders welcome" },
    { key: "custom_work", label: "Custom work", hint: "white label, private label, bespoke, made to spec" },
    { key: "certifications", label: "Certifications and compliance", hint: "ISO, FSSAI, GST, certified, compliant" },
  ],
};

/** The themes for a business's models, in order, each key once. Products when the model isn't known. */
export function themesFor(models: BusinessModel[] | null | undefined): Theme[] {
  const list = models && models.length ? models : (["products"] as BusinessModel[]);
  const seen = new Set<string>();
  const out: Theme[] = [];
  for (const m of list) {
    for (const t of THEMES[m] ?? []) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      out.push(t);
    }
  }
  return out;
}
