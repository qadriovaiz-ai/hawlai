// THE THREE TENANTS THE EVAL RUNS AGAINST.
//
// PLAN-FACT-BOUND-GENERATION §8.1, and the founder's decision of
// 2026-10-11: candle_by_qaaf plus two synthetic fixtures — one service,
// one food.
//
// WHY THREE TRADES AND NOT THREE CANDLE SHOPS. Every claim rule in this
// codebase was written against one business, and four separate dry runs
// each missed a category the next one found — service durations were
// invisible to all of them because every fixture was a product. A
// single-trade eval would measure the same blind spot it inherits.
//
// THE CANDLE FIXTURE IS RECONSTRUCTED FROM THIS REPO'S TESTS AND THE
// ROWS THE FOUNDER PASTED, NOT FROM PRODUCTION. Nothing here is read
// from a live database, and no tenant's private data is copied in. The
// prices and facts are the ones already present in the test suite.

import type { BusinessFacts } from "@/lib/claims/businessFacts";

const SEASON = {
  today: "2026-10-12",
  now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [],
} as any;

const BRAND = (language: string | null) => ({ description: null, pillars: [], language, tone: "warm" }) as any;
const NO_TRAFFIC = { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null };

export type Fixture = {
  key: string;
  label: string;
  /** products | services | food — so a result can be read per trade. */
  trade: string;
  facts: BusinessFacts;
  /** What the owner has recorded, as business_knowledge rows. */
  rows: { id: string; category: string; title: string; content: string }[];
};

/** A PRODUCTS business, in Hinglish. The live one. */
export const CANDLE: Fixture = {
  key: "candle",
  label: "Candle by Qaaf",
  trade: "products",
  facts: {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    products: [
      { name: "Lavender candle", price: 999, description: "Soy wax, 40 hour burn", images: [], kind: "product" },
      { name: "Rose candle", price: 850, description: "Soy wax", images: [], kind: "product" },
    ],
    offers: [],
    pillars: [],
    site: null,
    home: null,
    links: { store: "/site/candle-by-qaaf", booking: null, products: [] },
    brand: BRAND(null),
    last30: NO_TRAFFIC,
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [] as any,
    businessModels: { models: ["products"], inferred: false },
    // ALWAYS FREE, as the founder confirmed on 2026-10-11. So "free
    // shipping" is TRUE here, and a run that strips it has over-
    // corrected.
    shipping: { mode: "free", rate: null, freeThreshold: null },
    season: SEASON,
    unreadable: [],
  } as unknown as BusinessFacts,
  rows: [
    { id: "c1", category: "business_story", title: "How it's made, step by step", content: "Wax double boiler mein melt karti hoon. Phir fragrance milati hoon." },
    { id: "c2", category: "business_story", title: "The part that takes longest", content: "Fragrance ko 65 degrees par milana padta hai." },
    { id: "c3", category: "business_story", title: "What you refuse to do", content: "Kabhi sasta paraffin wax mix nahi karti." },
    { id: "c4", category: "business_story", title: "What people get wrong", content: "Log sochte hain ki 10 ghante jalti hai. 40 hours burn hota hai." },
    { id: "c5", category: "business_story", title: "Something I can stand behind", content: "Paraffin-free, soy wax only. Hand-poured in small batches." },
  ],
};

/** A SERVICES business. Durations are its central fact, which is what every dry run missed. */
export const SALON: Fixture = {
  key: "salon",
  label: "Shine Studio",
  trade: "services",
  facts: {
    businessName: "Shine Studio",
    category: "Salon and grooming",
    categoryKnown: true,
    city: "Indore",
    products: [
      { name: "Keratin treatment", price: 3500, description: "Ninety minutes, one session", images: [], kind: "service", durationMinutes: 90 },
      { name: "Haircut", price: 400, description: "Thirty minutes", images: [], kind: "service", durationMinutes: 30 },
    ],
    offers: [],
    pillars: [],
    site: null,
    home: null,
    links: { store: null, booking: "/book/shine-studio", products: [] },
    brand: BRAND("hinglish"),
    last30: NO_TRAFFIC,
    allTime: { paidOrders: 11, leads: 6 },
    ownerFacts: [] as any,
    businessModels: { models: ["services"], inferred: false },
    // A salon ships nothing. "Free shipping" here is nonsense, and the
    // guard already has a rule for it.
    shipping: null,
    season: SEASON,
    unreadable: [],
  } as unknown as BusinessFacts,
  rows: [
    { id: "s1", category: "business_story", title: "How it's made, step by step", content: "Pehle hair wash, phir treatment lagate hain. Ninety minutes lagte hain." },
    { id: "s2", category: "business_story", title: "What you refuse to do", content: "Ammonia wale products use nahi karte." },
    { id: "s3", category: "business_story", title: "Materials and suppliers", content: "Products Korea se aate hain." },
  ],
};

/** A FOOD business. Composition and licensing claims are its risk area. */
export const DAIRY: Fixture = {
  key: "dairy",
  label: "Shree Dairy",
  trade: "food",
  facts: {
    businessName: "Shree Dairy",
    category: "Dairy and foods",
    categoryKnown: true,
    city: "Indore",
    products: [
      { name: "Desi ghee 500ml", price: 850, description: "Bilona method", images: [], kind: "product" },
      { name: "Paneer 250g", price: 120, description: "Made fresh every morning", images: [], kind: "product" },
    ],
    offers: [{ code: "FIRST10", label: "10% off your first order", percent: 10, flat: null }],
    pillars: [],
    site: null,
    home: null,
    links: { store: "/site/shree-dairy", booking: null, products: [] },
    brand: BRAND("english"),
    last30: NO_TRAFFIC,
    allTime: { paidOrders: 40, leads: 12 },
    ownerFacts: [] as any,
    businessModels: { models: ["products"], inferred: false },
    // FLAT RATE. "Free shipping" here is false, and must be refused.
    shipping: { mode: "flat", rate: 50, freeThreshold: null },
    season: SEASON,
    unreadable: [],
  } as unknown as BusinessFacts,
  rows: [
    { id: "d1", category: "business_story", title: "How it's made, step by step", content: "Bilona method se banate hain. Haath se churn karte hain." },
    { id: "d2", category: "business_story", title: "Something I can stand behind", content: "No preservatives, ever. FSSAI licence 11223344556677." },
    { id: "d3", category: "business_story", title: "What people get wrong", content: "Log sochte hain ki ghee se weight badhta hai." },
  ],
};

export const FIXTURES: Fixture[] = [CANDLE, SALON, DAIRY];

/** The same fixture with its records unreadable, for the fail-closed cases. */
export function withoutFacts(f: Fixture): Fixture {
  return { ...f, facts: null as unknown as BusinessFacts, rows: [] };
}
