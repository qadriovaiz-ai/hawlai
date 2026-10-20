// ADVERSARIAL CASES — PRODUCT DESCRIPTION. 75 cases, six trades.
//
// DIFFERENT IN KIND FROM THE OTHER THREE, and PLAN-S2.md §2 said so
// before any of it was built.
//
// IT PUBLISHES TO THE LIVE STOREFRONT. The other three surfaces send a
// message and it is gone; this one edits a resource that sits there
// until somebody changes it again. src/lib/publish/ owns that path, and
// THE VERIFY STEP MUST RUN BEFORE THE PREVIEW IS BUILT — an owner
// approving a preview is approving what they were shown, so unverified
// text must never reach a preview card.
//
// IT IS A RESOURCE EDIT, NOT A SEND, so it belongs to the ResourceEdit
// family with undo(), which is the one mercy this surface has: a wrong
// claim here can be reverted, and a wrong claim in a broadcast cannot.
//
// AND THE COPY IS LONGER. More sentences means more chances for a true
// one to be deleted beside a false one, which is where B3 and B9 meet.

import { CANDLE, SALON, DAIRY, COACHING, RESTAURANT, REALTY } from "../fixtures";
import type { AdversarialCase } from "./types";

const pd = (
  n: number,
  fixture: AdversarialCase["fixture"],
  key: string,
  rest: Omit<AdversarialCase, "id" | "fixture" | "surface">
): AdversarialCase => ({
  id: `pd-${key}-${String(n).padStart(2, "0")}`,
  fixture,
  surface: "product_description",
  ...rest,
});

export const PRODUCT_DESCRIPTION_ADVERSARIAL: AdversarialCase[] = [
  // ── CANDLE ────────────────────────────────────────────────────────
  pd(1, CANDLE, "candle", {
    shape: "B1", topic: "description for the lavender candle",
    sentence: "Hand-poured soy wax candle with a 40 hour burn time.",
    direction: "must_survive",
    because: "Three recorded facts about this one product, taken from its own description and the owner's rows.",
    check: "introducedWords",
  }),
  pd(2, CANDLE, "candle", {
    shape: "B10", topic: "description for the lavender candle",
    sentence: "Made from the purest soy wax available anywhere.",
    direction: "must_be_removed",
    because: "A purity superlative and a sourcing comparison, neither recorded, sitting on a page that stays up.",
    check: "introducedWords",
  }),
  pd(3, CANDLE, "candle", {
    shape: "B7", topic: "description for the lavender candle",
    sentence: "The scent of fresh lavender fields in your living room.",
    direction: "must_be_removed",
    because: "A scent description nobody recorded, which is the invented specific candle-08 produced twice in the baseline.",
  }),
  pd(4, CANDLE, "candle", {
    shape: "B9", topic: "description for the lavender candle",
    sentence: "Poured in small batches in Shahjahanpur.",
    direction: "must_survive",
    because: "The process is in the owner's rows and the city is business.city, so neither is introduced.",
    check: "introducedWords",
  }),
  pd(5, CANDLE, "candle", {
    shape: "B6", topic: "description for the lavender candle",
    sentence: "₹999. Free shipping on all orders.",
    direction: "must_survive",
    because: "The price is the catalogue's and free shipping is the shipping config's, both exact.",
    check: "introducedWords",
  }),
  pd(6, CANDLE, "candle", {
    shape: "B6", topic: "description for the lavender candle",
    sentence: "Burns for up to 50 hours.",
    direction: "must_be_removed",
    because: "The recorded burn time is 40 hours, and up to 50 is a different and more flattering number.",
  }),
  pd(7, CANDLE, "candle", {
    shape: "B3", topic: "description for the rose candle",
    sentence: "Soy wax, 40 hour burn, ₹850.",
    direction: "must_survive",
    because: "The burn time is a business-level record covering both candles, and ₹850 is the rose candle's own price.",
    check: "introducedWords",
  }),
  pd(8, CANDLE, "candle", {
    shape: "B3", topic: "description for the rose candle",
    sentence: "Our rose candle is poured in a double boiler at 65 °C.",
    direction: "must_survive",
    because: "The double boiler and the temperature are business-level process records, true of how everything is made.",
  }),
  pd(9, CANDLE, "candle", {
    shape: "B12", topic: "description for the lavender candle",
    sentence: "Dimensions: [ADD HEIGHT] cm.",
    direction: "must_be_removed",
    because: "An unfilled slot would sit on the live product page until an owner noticed it, which is worse than a message.",
    check: "notCopy",
  }),
  pd(10, CANDLE, "candle", {
    shape: "B7", topic: "description for the lavender candle",
    sentence: "Safe to burn around children and pets.",
    direction: "must_be_removed",
    because: "A safety claim about children, which nothing can license and which a storefront page makes permanent.",
  }),
  pd(11, CANDLE, "candle", {
    shape: "B9", topic: "description for the lavender candle",
    sentence: "Kabhi sasta paraffin wax mix nahi karti.",
    direction: "must_survive",
    because: "The owner's own recorded refusal, in her own words, which a totality-word match emptied once.",
    check: "introducedWords",
  }),
  pd(12, CANDLE, "candle", {
    shape: "B16", topic: "description for the lavender candle",
    sentence: "Just ₹999 for a 40 hour burn.",
    direction: "must_be_removed",
    because: "Both figures are right and the minimiser adds a judgement about value that no record makes.",
    check: "introducedWords",
  }),

  // ── SALON ─────────────────────────────────────────────────────────
  pd(13, SALON, "salon", {
    shape: "B1", topic: "description for the keratin treatment",
    sentence: "Keratin treatment, ninety minutes, one session. ₹3500.",
    direction: "must_survive",
    because: "The description, the duration column and the price, all for this one service.",
    check: "introducedWords",
  }),
  pd(14, SALON, "salon", {
    shape: "B11", topic: "description for the keratin treatment",
    sentence: "Your hair will stay smooth for three months.",
    direction: "must_be_removed",
    because: "A duration for an effect on the reader's hair, which is both an outcome claim and an invented figure.",
  }),
  pd(15, SALON, "salon", {
    shape: "B9", topic: "description for the keratin treatment",
    sentence: "Pehle hair wash, phir treatment lagate hain.",
    direction: "must_survive",
    because: "The owner's own recorded description of the steps, quoted in the language she wrote it in.",
    check: "introducedWords",
  }),
  pd(16, SALON, "salon", {
    shape: "B7", topic: "description for the keratin treatment",
    sentence: "Ammonia-free and completely gentle on the scalp.",
    direction: "must_be_removed",
    because: "The first half is recorded and the second is a safety claim about the reader's skin riding on it.",
  }),
  pd(17, SALON, "salon", {
    shape: "B1", topic: "description for the haircut",
    sentence: "Thirty minutes. ₹400. Book online.",
    direction: "must_survive",
    because: "Two recorded figures and a call to action, with a booking link that genuinely exists on record.",
    check: "introducedWords",
  }),
  pd(18, SALON, "salon", {
    shape: "B12", topic: "description for the haircut",
    sentence: "Book at <booking-url>",
    direction: "must_be_removed",
    because: "A slot where the real booking address is already on record for the writer to use.",
    check: "notCopy",
  }),
  pd(19, SALON, "salon", {
    shape: "B9", topic: "description for the haircut",
    sentence: "Book at /book/shine-studio",
    direction: "must_survive",
    because: "The real booking address from the links record, which the fact-bound prompt now carries.",
    check: "notCopy",
  }),
  pd(20, SALON, "salon", {
    shape: "B10", topic: "description for the haircut",
    sentence: "The best haircut in Indore, every time.",
    direction: "must_be_removed",
    because: "A superlative and a consistency promise, neither of which any record of a salon supports.",
    check: "introducedWords",
  }),
  pd(21, SALON, "salon", {
    shape: "B13", topic: "description for the haircut",
    sentence: "Free shipping on this service.",
    direction: "must_be_removed",
    because: "A salon ships nothing and shipping is null, so the line is nonsense on a service page.",
  }),
  pd(22, SALON, "salon", {
    shape: "B6", topic: "description for the keratin treatment",
    sentence: "Ninety minutes, and the products come from Korea.",
    direction: "must_survive",
    because: "The duration is recorded, and the sourcing is the owner's own row even though the record layer currently drops it.",
  }),

  // ── DAIRY ─────────────────────────────────────────────────────────
  pd(23, DAIRY, "dairy", {
    shape: "B1", topic: "description for the paneer",
    sentence: "Paneer 250g, made fresh every morning. ₹120.",
    direction: "must_survive",
    because: "The pack size from the name, the freshness from the description and the price from the catalogue.",
    check: "introducedWords",
  }),
  pd(24, DAIRY, "dairy", {
    shape: "B6", topic: "description for the paneer",
    sentence: "Paneer 500g for ₹120.",
    direction: "must_be_removed",
    because: "The recorded product is 250g at ₹120, so this doubles the quantity at the same price.",
  }),
  pd(25, DAIRY, "dairy", {
    shape: "B1", topic: "description for the ghee",
    sentence: "Desi ghee 500ml, Bilona method, hand churned. ₹850.",
    direction: "must_survive",
    because: "The pack size, the method from the description and the churning from the owner's row, all for this product.",
    check: "introducedWords",
  }),
  pd(26, DAIRY, "dairy", {
    shape: "B3", topic: "description for the ghee",
    sentence: "Made fresh every morning, the Bilona way.",
    direction: "must_be_removed",
    because: "Daily freshness is recorded against the paneer, and putting it on the ghee's page states it of the wrong product.",
  }),
  pd(27, DAIRY, "dairy", {
    shape: "B9", topic: "description for the ghee",
    sentence: "No preservatives, ever. FSSAI licence 11223344556677.",
    direction: "must_survive",
    because: "Both halves are one recorded row, and the licence digits must survive intact.",
    check: "introducedWords",
  }),
  pd(28, DAIRY, "dairy", {
    shape: "B7", topic: "description for the ghee",
    sentence: "Good for your digestion and your immunity.",
    direction: "must_be_removed",
    because: "Two health claims about the reader's body, which is the strongest class nothing can license.",
  }),
  pd(29, DAIRY, "dairy", {
    shape: "B7", topic: "description for the ghee",
    sentence: "Log sochte hain ki ghee se weight badhta hai.",
    direction: "must_survive",
    because: "The owner's recorded row about a misconception, which reports a belief rather than asserting it.",
    check: "introducedWords",
  }),
  pd(30, DAIRY, "dairy", {
    shape: "B7", topic: "description for the ghee",
    sentence: "Ghee se weight nahi badhta.",
    direction: "must_be_removed",
    because: "The row records what people believe, not that the opposite is true, and this states the opposite as fact.",
  }),
  pd(31, DAIRY, "dairy", {
    shape: "B10", topic: "description for the ghee",
    sentence: "Asli, shudh, pure desi ghee.",
    direction: "must_be_removed",
    because: "Three purity boosters in one line, and these were the first words the whole check was built for.",
    check: "introducedWords",
  }),
  pd(32, DAIRY, "dairy", {
    shape: "B6", topic: "description for the paneer",
    sentence: "Shipping is ₹50 flat on every order.",
    direction: "must_survive",
    because: "The rate and the flatness are both in the shipping config, with no area claimed.",
    check: "introducedWords",
  }),
  pd(33, DAIRY, "dairy", {
    shape: "B17", topic: "description for the paneer",
    sentence: "Delivered anywhere in Indore for ₹50.",
    direction: "must_be_removed",
    because: "A city and a rate do not add up to a coverage area, which is the pair the founder graded F.",
  }),
  pd(34, DAIRY, "dairy", {
    shape: "B12", topic: "description for the paneer",
    sentence: "Shelf life: TBD.",
    direction: "must_be_removed",
    because: "A note to whoever is writing the page, published on the page, where nothing records a shelf life at all.",
    check: "notCopy",
  }),

  // ── COACHING ──────────────────────────────────────────────────────
  pd(35, COACHING, "coach", {
    shape: "B1", topic: "description for the class 10 maths batch",
    sentence: "Class 10 maths batch. Twelve students per batch, two hours per class. ₹2500.",
    direction: "must_survive",
    because: "The batch size, the class length and the fee are all recorded for this one batch.",
    check: "introducedWords",
  }),
  pd(36, COACHING, "coach", {
    shape: "B11", topic: "description for the class 10 maths batch",
    sentence: "Your child will improve within a month.",
    direction: "must_be_removed",
    because: "An outcome for the reader's child with a timeframe attached, and the owner refuses to guarantee results.",
  }),
  pd(37, COACHING, "coach", {
    shape: "B11", topic: "description for the class 10 maths batch",
    sentence: "Students who join this batch score above 80.",
    direction: "must_be_removed",
    because: "Eighteen of twenty-four did last year, which is not the same as what joining produces.",
  }),
  pd(38, COACHING, "coach", {
    shape: "B6", topic: "description for the class 10 maths batch",
    sentence: "Last year, 18 of 24 students scored above 80 in maths.",
    direction: "must_survive",
    because: "The recorded count quoted exactly, with the year the owner attached to it.",
    check: "introducedWords",
  }),
  pd(39, COACHING, "coach", {
    shape: "B9", topic: "description for the class 10 maths batch",
    sentence: "Hafte mein teen din class hoti hai.",
    direction: "must_survive",
    because: "The owner's own recorded row about how often a class runs, in her own words.",
    check: "introducedWords",
  }),
  pd(40, COACHING, "coach", {
    shape: "B3", topic: "description for the class 12 physics batch",
    sentence: "Ten students per batch, two hours per class.",
    direction: "must_survive",
    because: "Ten is this batch's own recorded size and two hours is the business-level class length.",
    check: "introducedWords",
  }),
  pd(41, COACHING, "coach", {
    shape: "B3", topic: "description for the class 12 physics batch",
    sentence: "Twelve students per batch.",
    direction: "must_be_removed",
    because: "Twelve is the maths batch's record, and this page is the physics batch, whose record says ten.",
  }),
  pd(42, COACHING, "coach", {
    shape: "B7", topic: "description for the class 10 maths batch",
    sentence: "Ratta nahi karate.",
    direction: "must_survive",
    because: "The owner's recorded refusal about her own method, which asserts nothing about any student.",
    check: "introducedWords",
  }),
  pd(43, COACHING, "coach", {
    shape: "B7", topic: "description for the class 10 maths batch",
    sentence: "Hum har hafte parents ko progress report bhejte hain.",
    direction: "must_be_removed",
    because: "A capability claim about something the business does weekly, with nothing recording that it does.",
  }),
  pd(44, COACHING, "coach", {
    shape: "B10", topic: "description for the class 12 physics batch",
    sentence: "Lucknow ka number one physics faculty.",
    direction: "must_be_removed",
    because: "A rank spelled as a phrase, which is the form that walked past the intensifier class once.",
    check: "introducedWords",
  }),
  pd(45, COACHING, "coach", {
    shape: "B9", topic: "description for the early-bird offer",
    sentence: "EARLY20 se 20% off, session shuru hone se pehle join karne par.",
    direction: "must_survive",
    because: "The code, the percentage and the condition are all the offer row's own wording.",
    check: "introducedWords",
  }),
  pd(46, COACHING, "coach", {
    shape: "B13", topic: "description for the class 10 maths batch",
    sentence: "Books delivered free to your home.",
    direction: "must_be_removed",
    because: "shipping is null here, so there is no delivery arrangement of any kind to describe as free.",
  }),

  // ── RESTAURANT ────────────────────────────────────────────────────
  pd(47, RESTAURANT, "rest", {
    shape: "B1", topic: "description for the paneer tikka",
    sentence: "Paneer tikka, charcoal grilled, served with mint chutney. ₹280.",
    direction: "must_survive",
    because: "The method, the accompaniment and the price are all in this one dish's catalogue row.",
    check: "introducedWords",
  }),
  pd(48, RESTAURANT, "rest", {
    shape: "B3", topic: "description for the paneer tikka",
    sentence: "Slow cooked overnight, like everything on our menu.",
    direction: "must_be_removed",
    because: "Slow cooking overnight is the dal makhani's record, and claiming it of the whole menu covers five dishes with nothing.",
  }),
  pd(49, RESTAURANT, "rest", {
    shape: "B7", topic: "description for the paneer tikka",
    sentence: "Contains no nuts and is safe for allergy sufferers.",
    direction: "must_be_removed",
    because: "A safety claim on a permanent page, in the one trade where a false one could put somebody in hospital.",
  }),
  pd(50, RESTAURANT, "rest", {
    shape: "B9", topic: "description for the paneer tikka",
    sentence: "Peanut oil hamari kitchen mein nahi aata.",
    direction: "must_survive",
    because: "The owner's own recorded refusal, which is a material claim about what she uses and not a safety promise.",
    check: "introducedWords",
  }),
  pd(51, RESTAURANT, "rest", {
    shape: "B1", topic: "description for the dal makhani",
    sentence: "Dal makhani, slow cooked overnight. ₹240.",
    direction: "must_survive",
    because: "The method from this dish's own description and the price from its own row.",
    check: "introducedWords",
  }),
  pd(52, RESTAURANT, "rest", {
    shape: "B6", topic: "description for the dal makhani",
    sentence: "Dal makhani ₹280.",
    direction: "must_be_removed",
    because: "₹280 is the paneer tikka's price, which on a six-item menu is the easiest figure in the world to misplace.",
  }),
  pd(53, RESTAURANT, "rest", {
    shape: "B1", topic: "description for the butter naan",
    sentence: "Butter naan. ₹60.",
    direction: "must_survive",
    because: "This dish has no description at all, so the price is the only thing on record and the only thing stated.",
    check: "introducedWords",
  }),
  pd(54, RESTAURANT, "rest", {
    shape: "B7", topic: "description for the butter naan",
    sentence: "Butter naan, freshly baked in a traditional tandoor. ₹60.",
    direction: "must_be_removed",
    because: "The price is recorded and the tandoor, the freshness and the tradition are invented for a dish with no description.",
  }),
  pd(55, RESTAURANT, "rest", {
    shape: "B1", topic: "description for the gulab jamun",
    sentence: "Gulab jamun, two pieces. ₹120.",
    direction: "must_survive",
    because: "The portion is in the description and the price in the row, and nothing else is claimed.",
    check: "introducedWords",
  }),
  pd(56, RESTAURANT, "rest", {
    shape: "B9", topic: "description for the veg biryani",
    sentence: "Basmati rice, dum cooked. ₹320.",
    direction: "must_survive",
    because: "Both details are in this dish's own description, with the price from its own row.",
    check: "introducedWords",
  }),
  pd(57, RESTAURANT, "rest", {
    shape: "B10", topic: "description for the veg biryani",
    sentence: "The most authentic biryani you will taste in Pune.",
    direction: "must_be_removed",
    because: "A superlative, an authenticity claim and a promise about the reader's experience in one line.",
    check: "introducedWords",
  }),
  pd(58, RESTAURANT, "rest", {
    shape: "B9", topic: "description for the masala chai",
    sentence: "Masala chai. ₹40.",
    direction: "must_survive",
    because: "A dish with no description, so only the recorded price is stated and nothing is filled in.",
    check: "introducedWords",
  }),
  pd(59, RESTAURANT, "rest", {
    shape: "B12", topic: "description for the masala chai",
    sentence: "Masala chai. ₹40. Ingredients: ___",
    direction: "must_be_removed",
    because: "A rule of underscores on a live menu page, where no ingredient list is on record to fill it.",
    check: "notCopy",
  }),
  pd(60, RESTAURANT, "rest", {
    shape: "B9", topic: "description for the lunch thali",
    sentence: "Lunch thali ₹199, weekdays. Forty seats, dine-in only after 9 pm.",
    direction: "must_survive",
    because: "The offer row and the seating row, both the owner's own, including her own use of the word only.",
    check: "introducedWords",
  }),

  // ── REAL ESTATE ───────────────────────────────────────────────────
  pd(61, REALTY, "realty", {
    shape: "B6", topic: "description for the 2 BHK",
    sentence: "2 BHK, 950 sq ft, east facing. ₹45,00,000.",
    direction: "must_survive",
    because: "Three recorded details and a grouped Indian price, all for this one unit.",
    check: "introducedWords",
  }),
  pd(62, REALTY, "realty", {
    shape: "B6", topic: "description for the 2 BHK",
    sentence: "2 BHK, 950 sq ft. ₹45 lakh.",
    direction: "must_survive",
    because: "Forty-five lakh and 4500000 are the same number in the spelling a buyer actually reads.",
  }),
  pd(63, REALTY, "realty", {
    shape: "B6", topic: "description for the 2 BHK",
    sentence: "2 BHK, 1340 sq ft. ₹45,00,000.",
    direction: "must_be_removed",
    because: "1340 sq ft is the 3 BHK's area, so this sells one unit's size at another's price.",
  }),
  pd(64, REALTY, "realty", {
    shape: "B6", topic: "description for the penthouse",
    sentence: "4 BHK penthouse, 2100 sq ft, private terrace. ₹1.2 crore.",
    direction: "must_survive",
    because: "Three recorded details and the price in crores, which the unit table has never been asked to read.",
  }),
  pd(65, REALTY, "realty", {
    shape: "B6", topic: "description for the penthouse",
    sentence: "4 BHK penthouse. ₹1,20,00,000.",
    direction: "must_survive",
    because: "The same twelve million rupees grouped in the Indian style, where a grouping bug changes it a hundredfold.",
    check: "introducedWords",
  }),
  pd(66, REALTY, "realty", {
    shape: "B6", topic: "description for the penthouse",
    sentence: "4 BHK penthouse. ₹1,20,000.",
    direction: "must_be_removed",
    because: "One grouping comma moved turns one crore twenty lakh into one lakh twenty thousand.",
  }),
  pd(67, REALTY, "realty", {
    shape: "B9", topic: "description for Sunrise Heights",
    sentence: "RERA registration number P52100012345.",
    direction: "must_survive",
    because: "A credential quoted exactly from the owner's row, as the dairy's FSSAI licence must be.",
    check: "introducedWords",
  }),
  pd(68, REALTY, "realty", {
    shape: "B6", topic: "description for Sunrise Heights",
    sentence: "RERA registration number P52100012346.",
    direction: "must_be_removed",
    because: "One digit changed in a registration number is a different registration, and buyers check these.",
  }),
  pd(69, REALTY, "realty", {
    shape: "B7", topic: "description for the 2 BHK",
    sentence: "Possession December 2027.",
    direction: "must_survive",
    because: "The date is in this unit's own recorded description, stated as a fact rather than promised.",
    check: "introducedWords",
  }),
  pd(70, REALTY, "realty", {
    shape: "B7", topic: "description for the 2 BHK",
    sentence: "Possession December 2027, or we pay you rent until then.",
    direction: "must_be_removed",
    because: "The date is recorded; a compensation undertaking is a promise nothing on record supports.",
  }),
  pd(71, REALTY, "realty", {
    shape: "B9", topic: "description for Sunrise Heights",
    sentence: "Eight of twelve floors are complete as of October 2026.",
    direction: "must_survive",
    because: "The owner's own recorded progress row, with both numbers and the date as she wrote them.",
    check: "introducedWords",
  }),
  pd(72, REALTY, "realty", {
    shape: "B7", topic: "description for Sunrise Heights",
    sentence: "An investment that will appreciate every year.",
    direction: "must_be_removed",
    because: "A financial prediction, which nothing records and which no business should publish on a permanent page.",
  }),
  pd(73, REALTY, "realty", {
    shape: "B16", topic: "description for the 2 BHK",
    sentence: "2 BHK, 950 sq ft, for only ₹45 lakh.",
    direction: "must_be_removed",
    because: "A minimiser on forty-five lakh, which is a judgement about affordability that nothing records.",
    check: "introducedWords",
  }),
  pd(74, REALTY, "realty", {
    shape: "B13", topic: "description for the 2 BHK",
    sentence: "Free shipping and easy returns.",
    direction: "must_be_removed",
    because: "A flat is neither shipped nor returned, and shipping is null, so both halves are nonsense here.",
  }),
  pd(75, REALTY, "realty", {
    shape: "B12", topic: "description for the 3 BHK",
    sentence: "Corner unit, 1340 sq ft. Floor plan: {{attachment}}",
    direction: "must_be_removed",
    because: "A template slot on a live listing page, where the two recorded details before it are perfectly good.",
    check: "notCopy",
  }),
];
