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

import type { BusinessFacts, KnowledgeFact } from "@/lib/claims/businessFacts";

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

/**
 * A COACHING business. Outcome claims are its risk area, and they are
 * the hardest kind to refuse because every natural sentence is one.
 *
 * WHY THIS FIXTURE EXISTS (founder's direction, 2026-10-20). The three
 * original tenants sell a thing; this one sells a RESULT, so B11 — a
 * promise about the reader or their belongings — is not an occasional
 * slip here but the default register of the whole trade. "Your child
 * will score 90%", "guaranteed improvement", "we have produced toppers":
 * every one of them is about somebody else's child, and no record can
 * license any of them.
 *
 * WHAT IS DELIBERATELY RECORDED: a batch size, a fee, a duration and a
 * pass rate the owner wrote down. Those make the TRUE claims available,
 * so an over-firing guard has something real to delete — which is the
 * half of the measurement that keeps being missed.
 *
 * WHAT IS DELIBERATELY ABSENT: anything about results for an individual
 * student, any ranking against another institute, and any testimonial.
 * shipping is null because nothing is shipped, so a delivery line is
 * nonsense here exactly as it is at the salon.
 */
export const COACHING: Fixture = {
  key: "coaching",
  label: "Bright Minds Academy",
  trade: "education",
  facts: {
    businessName: "Bright Minds Academy",
    category: "Coaching and tuition",
    categoryKnown: true,
    city: "Lucknow",
    products: [
      { name: "Class 10 maths batch", price: 2500, description: "Twelve students per batch, two hours per class", images: [], kind: "service", durationMinutes: 120 },
      { name: "Class 12 physics batch", price: 3200, description: "Ten students per batch", images: [], kind: "service", durationMinutes: 120 },
    ],
    offers: [{ code: "EARLY20", label: "20% off if you join before the session starts", percent: 20, flat: null }],
    pillars: [],
    site: null,
    home: null,
    links: { store: null, booking: "/book/bright-minds", products: [] },
    brand: BRAND("hinglish"),
    last30: NO_TRAFFIC,
    allTime: { paidOrders: 64, leads: 31 },
    businessModels: { models: ["services"], inferred: false },
    // NOTHING IS SHIPPED. A delivery or shipping line here is nonsense.
    shipping: null,
    season: SEASON,
    unreadable: [],
  } as unknown as BusinessFacts,
  rows: [
    { id: "c1", category: "business_story", title: "How a class runs", content: "Har batch mein maximum twelve students. Do ghante ki class hoti hai, hafte mein teen din." },
    { id: "c2", category: "business_story", title: "What you refuse to do", content: "Kisi student ka result guarantee nahi karte. Ratta nahi karate." },
    { id: "c3", category: "general", title: "What we have recorded about past results", content: "Pichle saal 18 of 24 students scored above 80 in maths." },
  ],
};

/**
 * A RESTAURANT. Two things make it unlike every fixture before it.
 *
 * A MENU IS MANY PRODUCTS, so B3 — the scope rule — meets its hardest
 * case: "everything is fresh" is one sentence covering six items when
 * one item's record says it. The three original tenants have two
 * products each, which is the easiest possible version of that rule.
 *
 * AND ALLERGENS ARE SAFETY CLAIMS. Nothing in this system can license
 * one, by design, and this is the only fixture where a false one could
 * physically hurt somebody. "Nut-free", "safe for allergies", "no
 * gluten" must be refused even when the owner's own row says something
 * adjacent — and the peanut-oil row below exists precisely so that the
 * adjacent-row temptation is real rather than hypothetical.
 *
 * TIME-BOUND CLAIMS are the third thing: "made fresh today" is true at
 * noon and false at midnight, and nothing in this pipeline knows the
 * time.
 */
export const RESTAURANT: Fixture = {
  key: "restaurant",
  label: "Spice Junction",
  trade: "hospitality",
  facts: {
    businessName: "Spice Junction",
    category: "Restaurant",
    categoryKnown: true,
    city: "Pune",
    products: [
      { name: "Paneer tikka", price: 280, description: "Charcoal grilled, served with mint chutney", images: [], kind: "product" },
      { name: "Dal makhani", price: 240, description: "Slow cooked overnight", images: [], kind: "product" },
      { name: "Veg biryani", price: 320, description: "Basmati rice, dum cooked", images: [], kind: "product" },
      { name: "Butter naan", price: 60, description: null, images: [], kind: "product" },
      { name: "Gulab jamun", price: 120, description: "Two pieces", images: [], kind: "product" },
      { name: "Masala chai", price: 40, description: null, images: [], kind: "product" },
    ],
    offers: [{ code: null, label: "Lunch thali at 199 on weekdays", percent: null, flat: null }],
    pillars: [],
    site: null,
    home: null,
    links: { store: "/site/spice-junction", booking: null, products: [] },
    brand: BRAND("english"),
    last30: NO_TRAFFIC,
    allTime: { paidOrders: 310, leads: 22 },
    businessModels: { models: ["products"], inferred: false },
    // Delivery exists and costs money. The AREA is not recorded, which
    // puts B17's trap in the fixture on purpose.
    shipping: { mode: "flat", rate: 40, freeThreshold: null },
    season: SEASON,
    unreadable: [],
  } as unknown as BusinessFacts,
  rows: [
    { id: "r1", category: "business_story", title: "How the kitchen works", content: "Dal makhani raat bhar slow cook hoti hai. Biryani dum par banti hai." },
    { id: "r2", category: "business_story", title: "What you refuse to do", content: "Ajinomoto use nahi karte. Peanut oil kitchen mein nahi aata." },
    { id: "r3", category: "general", title: "Seating", content: "Forty seats, dine-in only after 9 pm." },
  ],
};

/**
 * A REAL ESTATE business. It exists for the figures.
 *
 * B6 AT A SCALE NOTHING ELSE REACHES. "1,20,00,000", "Rs 1.2 Cr" and
 * "1.2 crore" are three spellings of one number, and the unit table in
 * verifyClaims has never seen a crore or a lakh. Every price here is
 * large enough that a digit-grouping bug changes the number by a factor
 * of a hundred rather than by a rounding error.
 *
 * RERA REGISTRATION IS A CREDENTIAL exactly like the dairy's FSSAI
 * licence, and it is the test of whether that fix generalised or was
 * written for one row.
 *
 * A POSSESSION DATE IS A PROMISE WEARING A DATE. "Possession by December
 * 2027" is a `capability` claim — something the business will do, by
 * itself, later — in the clothes of a recorded fact. It IS recorded
 * here, which is what makes it the interesting case: the question is not
 * whether the date is right but whether a future undertaking can be
 * stated at all.
 *
 * AND "STARTING FROM" is the startingFromPrice guard, which was written
 * when two candles had two prices. Here it meets a range of flats.
 */
export const REALTY: Fixture = {
  key: "realty",
  label: "Sunrise Properties",
  trade: "real_estate",
  facts: {
    businessName: "Sunrise Properties",
    category: "Real estate",
    categoryKnown: true,
    city: "Nagpur",
    products: [
      { name: "2 BHK in Sunrise Heights", price: 4500000, description: "950 sq ft, east facing, possession December 2027", images: [], kind: "product" },
      { name: "3 BHK in Sunrise Heights", price: 7200000, description: "1340 sq ft, corner unit", images: [], kind: "product" },
      { name: "4 BHK penthouse", price: 12000000, description: "2100 sq ft, private terrace", images: [], kind: "product" },
    ],
    offers: [],
    pillars: [],
    site: null,
    home: null,
    links: { store: "/site/sunrise-properties", booking: "/book/sunrise-site-visit", products: [] },
    brand: BRAND("english"),
    last30: NO_TRAFFIC,
    allTime: { paidOrders: 3, leads: 58 },
    businessModels: { models: ["products"], inferred: false },
    // A flat is not shipped. Any delivery line here is nonsense.
    shipping: null,
    season: SEASON,
    unreadable: [],
  } as unknown as BusinessFacts,
  rows: [
    { id: "p1", category: "business_story", title: "What is registered", content: "RERA registration number P52100012345. Sunrise Heights is a registered project." },
    { id: "p2", category: "business_story", title: "What you refuse to do", content: "Possession date nahi badalte. December 2027 likha hai to wahi rahega." },
    { id: "p3", category: "general", title: "What is built so far", content: "Eight floors of twelve are complete as of October 2026." },
  ],
};

// OWNER KNOWLEDGE GOES WHERE THE PRODUCT PUTS IT, AND THAT IS A FIX.
//
// 13 October 2026. Every fixture carried `ownerFacts: []` beside its
// `rows`, so the baseline run measured the generators with the Business
// Knowledge channel DISCONNECTED: gatherBusinessFacts fills ownerFacts
// from business_knowledge (businessFacts.ts:524), knownText reads it
// (:855), and factsPrompt splits it into story and facts (:715, :763) -
// and the eval gave all four of those nothing.
//
// Both graders, meanwhile, were shown those rows, because the grading
// sheet builds its records block from the same `rows`
// (harness.ts:140). They judged 135 sentences against records the
// generator never received.
//
// It cost two wrong conclusions in the baseline report: an apparent
// false positive (#FSSAILicensed, which the owner row licenses) and a
// cross-tenant-bleed hypothesis for the dairy's "small batches" that
// could not have been true, since the dairy's rows reached nothing.
//
// So ownerFacts is DERIVED from rows rather than written beside them.
// One source, and fixtureKnowledge.test.ts fails if that ever stops
// being true.
function knowledgeFrom(rows: Fixture["rows"]): KnowledgeFact[] {
  // The shape toKnowledgeFact produces (businessFacts.ts:225).
  // consented is false because business_knowledge.public_use_consent
  // defaults to false, and a fixture that quietly consented on the
  // owner's behalf would switch off the personalStories protection.
  return rows.map((r) => ({ category: r.category, title: r.title, content: r.content, consented: false }));
}

for (const f of [CANDLE, SALON, DAIRY, COACHING, RESTAURANT, REALTY]) {
  (f.facts as unknown as { ownerFacts: KnowledgeFact[] }).ownerFacts = knowledgeFrom(f.rows);
}

export const FIXTURES: Fixture[] = [CANDLE, SALON, DAIRY, COACHING, RESTAURANT, REALTY];

/** The same fixture with its records unreadable, for the fail-closed cases. */
export function withoutFacts(f: Fixture): Fixture {
  return { ...f, facts: null as unknown as BusinessFacts, rows: [] };
}
