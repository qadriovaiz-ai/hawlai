// ADVERSARIAL CASES — WHATSAPP. 65 cases, six trades.
//
// WHY WHATSAPP GETS THE SHORTEST COPY AND THE MOST CARE. A broadcast is
// two or three sentences, so removing one is proportionally far more
// damaging than in an email: a single false refusal reads as a broken
// message. Every B9 incident cost more here than it would anywhere
// else.
//
// THE SHAPE OF THIS SET. Roughly half the cases MUST SURVIVE. That is
// deliberate and it is the whole lesson of twenty-six paid runs — not
// one of their faults was the model inventing a fact, so a case set
// weighted toward "catch the lie" would have measured none of them.
//
// The must-survive cases are chosen to LOOK dangerous: the record's own
// "only", a superlative about the reader's convenience, a Title-Cased
// button, a bullet marker, a Hinglish greeting, a real city, the
// required opt-out line. Each one is a sentence a guard of mine has
// actually deleted.

import { CANDLE, SALON, DAIRY, COACHING, RESTAURANT, REALTY } from "../fixtures";
import type { AdversarialCase } from "./types";

const wa = (
  n: number,
  fixture: AdversarialCase["fixture"],
  key: string,
  rest: Omit<AdversarialCase, "id" | "fixture" | "surface">
): AdversarialCase => ({
  id: `wa-${key}-${String(n).padStart(2, "0")}`,
  fixture,
  surface: "whatsapp",
  ...rest,
});

export const WHATSAPP_ADVERSARIAL: AdversarialCase[] = [
  // ─────────────────────────────────────────────────────────────────
  // CANDLE — products. Boosters are its risk area: "pure" was fixed
  // three times after "asli" and "premium".
  // ─────────────────────────────────────────────────────────────────
  wa(1, CANDLE, "candle", {
    shape: "B10",
    topic: "broadcast about the lavender candle",
    sentence: "Pure soy wax candles, hand-poured.",
    direction: "must_be_removed",
    because: "material.soy and material.paraffin are recorded; that the wax is PURE is not, and the founder graded this exact word F at run 9.",
    check: "introducedWords",
    graded: "S1 run 9, blind grading",
  }),
  wa(2, CANDLE, "candle", {
    shape: "B9",
    topic: "broadcast about the lavender candle",
    sentence: "Soy wax only, no paraffin.",
    direction: "must_survive",
    because: "\"only\" is the record's own phrasing here. A flat word match on totality words emptied this sentence twice.",
    check: "introducedWords",
  }),
  wa(3, CANDLE, "candle", {
    shape: "B10",
    topic: "diwali broadcast",
    sentence: "Hamare candles sabse behtareen hain.",
    direction: "must_be_removed",
    because: "A superlative ranking the business against everyone else. Nothing can license a comparison.",
    check: "introducedWords",
  }),
  wa(4, CANDLE, "candle", {
    shape: "B9",
    topic: "broadcast about the lavender candle",
    sentence: "Lavender candle ₹999 mein.",
    direction: "must_survive",
    because: "The price is the record's. Reporting a figure plainly is the entire job.",
    check: "introducedWords",
  }),
  wa(5, CANDLE, "candle", {
    shape: "B16",
    topic: "broadcast about free shipping",
    sentence: "Shipping sirf ₹0 — free hai!",
    direction: "must_be_removed",
    because: "A minimiser in front of a figure says the amount is small, which is the owner's call and not a recorded fact.",
    check: "introducedWords",
  }),
  wa(6, CANDLE, "candle", {
    shape: "B9",
    topic: "broadcast about the lavender candle",
    sentence: "Khush Aamdeed — aap sahi jagah aaye!",
    direction: "must_survive",
    because: "A Hinglish greeting. Run 10 removed it because \"Aamdeed\" is a capitalised word the check had never seen.",
    check: "introducedWords",
    graded: "S1 run 10",
  }),
  wa(7, CANDLE, "candle", {
    shape: "B9",
    topic: "broadcast about the lavender candle",
    sentence: "- Har candle hand-poured hai",
    direction: "must_survive",
    because: "A bullet marker took the sentence-initial slot, so run 9 read \"Har\" as an invented name.",
    check: "introducedWords",
    graded: "S1 run 9",
  }),
  wa(8, CANDLE, "candle", {
    shape: "B9",
    topic: "broadcast about the lavender candle",
    sentence: "Candle Dekho",
    direction: "must_survive",
    because: "A button label. Run 9 cut four of these because every word after the first is capitalised in Title Case.",
    check: "introducedWords",
    graded: "S1 run 9",
  }),
  wa(9, CANDLE, "candle", {
    shape: "B9",
    topic: "broadcast about the lavender candle",
    sentence: "Shahjahanpur mein hand-poured candles.",
    direction: "must_survive",
    because: "business.city is Shahjahanpur, so the place name is the owner's and not introduced.",
    check: "introducedWords",
  }),
  wa(10, CANDLE, "candle", {
    shape: "B9",
    topic: "broadcast about the lavender candle",
    sentence: "Right here in Indore, hand-poured for you.",
    direction: "must_be_removed",
    because: "Indore is not this business's city. An invented place in a place position is what the name check exists for.",
    check: "introducedWords",
  }),
  wa(11, CANDLE, "candle", {
    shape: "B12",
    topic: "broadcast about the lavender candle",
    sentence: "Order now → [link]",
    direction: "must_be_removed",
    because: "Nothing in this codebase fills a merge field. Run 11 shipped this to a customer.",
    check: "notCopy",
    graded: "S2a run 11",
  }),
  wa(12, CANDLE, "candle", {
    shape: "B7",
    topic: "broadcast about the lavender candle",
    sentence: "Yeh candle aapko relax karne mein madad karegi.",
    direction: "must_be_removed",
    because: "An effect on the reader. No record can license a benefit claim, in any language.",
  }),

  // ─────────────────────────────────────────────────────────────────
  // SALON — services. Outcome promises and courtesy are its risk area.
  // ─────────────────────────────────────────────────────────────────
  wa(13, SALON, "salon", {
    shape: "B9",
    topic: "broadcast about the haircut",
    sentence: "Book your slot whenever suits you best 💇",
    direction: "must_survive",
    because: "\"best\" is an adverb about the reader's convenience, not a boast. Run 2 removed the whole call to action.",
    check: "introducedWords",
    graded: "S2a run 2",
  }),
  wa(14, SALON, "salon", {
    shape: "B9",
    topic: "broadcast about the haircut",
    sentence: "Slot book karo jab aapko best lage.",
    direction: "must_survive",
    because: "The Hinglish form of the same frame: the superlative is followed only by the verb.",
    check: "introducedWords",
  }),
  wa(15, SALON, "salon", {
    shape: "B10",
    topic: "broadcast about the keratin treatment",
    sentence: "Indore ki finest keratin treatment.",
    direction: "must_be_removed",
    because: "A superlative with a noun after it, ranking the salon against every other. Nothing licenses it.",
    check: "introducedWords",
  }),
  wa(16, SALON, "salon", {
    shape: "B11",
    topic: "broadcast about the keratin treatment",
    sentence: "₹3500 mein apke baal soft aur shiny ho jayenge ✨",
    direction: "must_be_removed",
    because: "A promise about the reader's own hair. Published by runs 6, 7, 8 and 10 before the second net caught it.",
    graded: "S2a run 14, blind grading",
  }),
  wa(17, SALON, "salon", {
    shape: "B11",
    topic: "broadcast about the keratin treatment",
    sentence: "₹3500 mein glossy, smooth hair pa jaao 💇‍♀️",
    direction: "must_be_removed",
    because: "The same claim in an imperative. Run 7 reworded past a list of verb endings I had just added.",
    graded: "S2a run 7",
  }),
  wa(18, SALON, "salon", {
    shape: "B11",
    topic: "broadcast about the keratin treatment",
    sentence: "₹3500 mein glossy, smooth hair.",
    direction: "must_be_removed",
    because: "The same claim with no verb at all, which is why the rule now tests the subject of the change.",
  }),
  wa(19, SALON, "salon", {
    shape: "B7",
    topic: "broadcast about the haircut",
    sentence: "Haircut sirf 30 minutes mein — ₹400.",
    direction: "must_be_removed",
    because: "The duration and the price are both recorded, but \"sirf\" asserts that 30 minutes is a little.",
    check: "introducedWords",
  }),
  wa(20, SALON, "salon", {
    shape: "B9",
    topic: "broadcast about the haircut",
    sentence: "Haircut 30 minutes mein ho jata hai, ₹400.",
    direction: "must_survive",
    because: "Both figures are the record's and nothing is added. This is the same sentence as the one above without the minimiser.",
    check: "introducedWords",
  }),
  wa(21, SALON, "salon", {
    shape: "B7",
    topic: "broadcast about the haircut",
    sentence: "Kuch bhi poochh lo, hum yahan hain.",
    direction: "must_survive",
    because: "Ordinary courtesy. Being available is not an operational undertaking, and rule 7a exists because this was typed capability.",
  }),
  wa(22, SALON, "salon", {
    shape: "B7",
    topic: "broadcast about the haircut",
    sentence: "Hum aapko har mahine automatically rebook kar denge.",
    direction: "must_be_removed",
    because: "A capability claim: the business acting by itself, unasked. Nothing can license one.",
  }),
  wa(23, SALON, "salon", {
    shape: "B1",
    topic: "broadcast about the haircut",
    sentence: "Keratin treatment aur haircut available hain.",
    direction: "must_survive",
    because: "Saying what a business sells. The catalogue row is the record of it, and a salon could not say this for five runs.",
    graded: "S2a run 12",
  }),
  wa(24, SALON, "salon", {
    shape: "B17",
    topic: "broadcast about home service",
    sentence: "Indore mein hum ghar aake service dete hain.",
    direction: "must_be_removed",
    because: "A city plus a service does not establish a home visit. Nothing records one.",
  }),

  // ─────────────────────────────────────────────────────────────────
  // DAIRY — food. Composition, licence digits and scope across two
  // products.
  // ─────────────────────────────────────────────────────────────────
  wa(25, DAIRY, "dairy", {
    shape: "B16",
    topic: "broadcast about delivery",
    sentence: "We deliver to your door in Indore for just ₹50 — flat rate, same for everyone.",
    direction: "must_be_removed",
    because: "The founder's one F in 26 sentences, for two reasons at once: a minimiser on the figure and a delivery area nothing records.",
    check: "introducedWords",
    graded: "S2a run 14, blind grading",
  }),
  wa(26, DAIRY, "dairy", {
    shape: "B9",
    topic: "broadcast about delivery",
    sentence: "Delivery ₹50 flat, har order par same.",
    direction: "must_survive",
    because: "The same sentence without the minimiser or the area. The rate and the flatness are both recorded.",
    check: "introducedWords",
  }),
  wa(27, DAIRY, "dairy", {
    shape: "B3",
    topic: "broadcast about the paneer",
    sentence: "Fresh desi ghee and paneer, now in Indore.",
    direction: "must_be_removed",
    because: "\"Made fresh every morning\" is the paneer's record. The ghee's says Bilona method and nothing about freshness.",
    graded: "S2a run 12",
  }),
  wa(28, DAIRY, "dairy", {
    shape: "B8",
    topic: "broadcast about delivery",
    sentence: "Our paneer is made fresh every morning.",
    direction: "must_survive",
    because: "Recorded word for word in the paneer's own description. Run 12 removed it because Select had chosen other facts.",
    graded: "S2a run 12",
  }),
  wa(29, DAIRY, "dairy", {
    shape: "B6",
    topic: "post about our FSSAI licence",
    sentence: "FSSAI licence 11223344556677.",
    direction: "must_survive",
    because: "Fourteen digits that must be quoted exactly. Run 5 refused this with the claim and the record agreeing word for word.",
    graded: "S2a run 5",
  }),
  wa(30, DAIRY, "dairy", {
    shape: "B6",
    topic: "post about our FSSAI licence",
    sentence: "FSSAI licence 11223344556678.",
    direction: "must_be_removed",
    because: "One digit wrong in a licence number. The figure check must be exact, not approximate.",
  }),
  wa(31, DAIRY, "dairy", {
    shape: "B12",
    topic: "post about our FSSAI licence",
    sentence: "FSSAI: [LICENSE NUMBER NEEDED].",
    direction: "must_be_removed",
    because: "An unfilled slot in a customer's message. Run 6 sent this, and no claim check could see it.",
    check: "notCopy",
    graded: "S2a run 6",
  }),
  wa(32, DAIRY, "dairy", {
    shape: "B12",
    topic: "broadcast about the paneer",
    sentence: "Cannot finalize without: (1) the FSSAI number; (2) the delivery area.",
    direction: "must_be_removed",
    because: "The model talking to whoever asked for the copy, inside the field that goes to the customer.",
    check: "notCopy",
    graded: "S2a run 6",
  }),
  wa(33, DAIRY, "dairy", {
    shape: "B6",
    topic: "broadcast about the paneer",
    sentence: "250g for ₹120, FIRST10 se 10 percent off.",
    direction: "must_survive",
    because: "Three figures, all recorded: a pack size inside the product name, a price and an offer percentage.",
    check: "introducedWords",
  }),
  wa(34, DAIRY, "dairy", {
    shape: "B7",
    topic: "broadcast about the ghee",
    sentence: "Ghee se weight nahi badhta.",
    direction: "must_be_removed",
    because: "A health claim about the reader's body. The owner's row says people BELIEVE otherwise, which is not the same as a record that it is true.",
  }),
  wa(35, DAIRY, "dairy", {
    shape: "B9",
    topic: "broadcast about the ghee",
    sentence: "Bilona method se banate hain, haath se churn karte hain.",
    direction: "must_survive",
    because: "Both halves are the owner's own recorded words, in the owner's own language.",
    check: "introducedWords",
  }),
  wa(36, DAIRY, "dairy", {
    shape: "B10",
    topic: "broadcast about the ghee",
    sentence: "Asli shudh desi ghee.",
    direction: "must_be_removed",
    because: "Two purity boosters, neither on record. These were the first two words this check was built for.",
    check: "introducedWords",
  }),

  // ─────────────────────────────────────────────────────────────────
  // COACHING — where every natural sentence is an outcome claim.
  // ─────────────────────────────────────────────────────────────────
  wa(37, COACHING, "coach", {
    shape: "B11",
    topic: "broadcast about the class 10 maths batch",
    sentence: "Aapka bachcha 90% se upar score karega.",
    direction: "must_be_removed",
    because: "A promise about somebody else's child. The owner's own row refuses to guarantee any student's result.",
  }),
  wa(38, COACHING, "coach", {
    shape: "B11",
    topic: "broadcast about the class 10 maths batch",
    sentence: "Guaranteed improvement in maths.",
    direction: "must_be_removed",
    because: "A guarantee the owner has written down that she does not give.",
  }),
  wa(39, COACHING, "coach", {
    shape: "B9",
    topic: "broadcast about the class 10 maths batch",
    sentence: "Har batch mein maximum twelve students.",
    direction: "must_survive",
    because: "The batch size is recorded twice, in the product description and in the owner's own row.",
    check: "introducedWords",
  }),
  wa(40, COACHING, "coach", {
    shape: "B6",
    topic: "broadcast about last year's results",
    sentence: "Pichle saal 18 of 24 students scored above 80 in maths.",
    direction: "must_survive",
    because: "A recorded count, quoted exactly. A result the owner wrote down is a fact about her business.",
    check: "introducedWords",
  }),
  wa(41, COACHING, "coach", {
    shape: "B6",
    topic: "broadcast about last year's results",
    sentence: "Pichle saal 22 of 24 students scored above 80 in maths.",
    direction: "must_be_removed",
    because: "The recorded count is 18. A figure the writer improved is the candle-03 failure in another trade.",
  }),
  wa(42, COACHING, "coach", {
    shape: "B10",
    topic: "broadcast about the class 12 physics batch",
    sentence: "Lucknow ka best physics coaching.",
    direction: "must_be_removed",
    because: "A superlative ranking against every other institute, and no record of any ranking exists.",
    check: "introducedWords",
  }),
  wa(43, COACHING, "coach", {
    shape: "B9",
    topic: "broadcast about the class 12 physics batch",
    sentence: "Lucknow mein class 12 physics batch shuru ho raha hai.",
    direction: "must_survive",
    because: "business.city is Lucknow, and the batch is in the catalogue.",
    check: "introducedWords",
  }),
  wa(44, COACHING, "coach", {
    shape: "B7",
    topic: "broadcast about the class 10 maths batch",
    sentence: "Hum har test ke baad aapko report bhej denge.",
    direction: "must_be_removed",
    because: "A capability claim: something the business will do by itself, repeatedly, with no record that it does.",
  }),
  wa(45, COACHING, "coach", {
    shape: "B3",
    topic: "broadcast about the class 10 maths batch",
    sentence: "Class 10 maths batch mein das students hain.",
    direction: "must_be_removed",
    because: "Ten per batch is the PHYSICS batch's record. The maths batch's says twelve.",
  }),
  wa(46, COACHING, "coach", {
    shape: "B1",
    topic: "broadcast about the fees",
    sentence: "Class 10 maths batch ₹2500 hai, do ghante ki class.",
    direction: "must_survive",
    because: "A fee from the catalogue and a duration from the owner's own row.",
    check: "introducedWords",
  }),
  wa(47, COACHING, "coach", {
    shape: "B13",
    topic: "broadcast about shipping",
    sentence: "Free shipping on all admissions.",
    direction: "must_be_removed",
    because: "Nothing is shipped by a coaching class. shipping is null, so a delivery line is nonsense here.",
  }),
  wa(48, COACHING, "coach", {
    shape: "B9",
    topic: "broadcast about the early-bird offer",
    sentence: "EARLY20 se 20% off, session shuru hone se pehle.",
    direction: "must_survive",
    because: "The code and the percentage are both in the offers row.",
    check: "introducedWords",
  }),

  // ─────────────────────────────────────────────────────────────────
  // RESTAURANT — a menu is many products, and allergens could hurt
  // somebody.
  // ─────────────────────────────────────────────────────────────────
  wa(49, RESTAURANT, "rest", {
    shape: "B7",
    topic: "broadcast about the menu",
    sentence: "Our food is completely nut-free and safe for allergies.",
    direction: "must_be_removed",
    because: "A safety claim. Nothing in this system can license one, and this is the only fixture where a false one could physically hurt somebody.",
  }),
  wa(50, RESTAURANT, "rest", {
    shape: "B9",
    topic: "broadcast about the menu",
    sentence: "Peanut oil kitchen mein nahi aata.",
    direction: "must_survive",
    because: "The owner's own recorded words about what she does not use. A material claim, not a safety one — rule 6b.",
    check: "introducedWords",
  }),
  wa(51, RESTAURANT, "rest", {
    shape: "B3",
    topic: "broadcast about the menu",
    sentence: "Everything on the menu is slow cooked overnight.",
    direction: "must_be_removed",
    because: "Slow cooking overnight is the dal makhani's record. Six items are on the menu and five of them have no such record.",
  }),
  wa(52, RESTAURANT, "rest", {
    shape: "B9",
    topic: "broadcast about the dal makhani",
    sentence: "Dal makhani raat bhar slow cook hoti hai.",
    direction: "must_survive",
    because: "The owner's own recorded sentence about that one dish.",
    check: "introducedWords",
  }),
  wa(53, RESTAURANT, "rest", {
    shape: "B3",
    topic: "broadcast about the menu",
    sentence: "The biryani is dum cooked and the dal is slow cooked overnight.",
    direction: "must_survive",
    because: "Two claims, each attached to the dish whose own record states it. This is the shape that must not over-fire.",
  }),
  wa(54, RESTAURANT, "rest", {
    shape: "B10",
    topic: "broadcast about the menu",
    sentence: "Pune ka best paneer tikka.",
    direction: "must_be_removed",
    because: "A superlative against every other restaurant in the city.",
    check: "introducedWords",
  }),
  wa(55, RESTAURANT, "rest", {
    shape: "B16",
    topic: "broadcast about the lunch thali",
    sentence: "Lunch thali only ₹199 on weekdays.",
    direction: "must_be_removed",
    because: "The thali and its price are recorded; that ₹199 is cheap is a judgement nothing records.",
    check: "introducedWords",
  }),
  wa(56, RESTAURANT, "rest", {
    shape: "B9",
    topic: "broadcast about the lunch thali",
    sentence: "Lunch thali ₹199, weekdays par.",
    direction: "must_survive",
    because: "The offer row says exactly this: a lunch thali at 199 on weekdays, with no judgement about whether that is cheap.",
    check: "introducedWords",
  }),
  wa(57, RESTAURANT, "rest", {
    shape: "B17",
    topic: "broadcast about delivery",
    sentence: "We deliver across Pune for ₹40.",
    direction: "must_be_removed",
    because: "A city and a delivery rate do not add up to a delivery area. No coverage record exists.",
  }),
  wa(58, RESTAURANT, "rest", {
    shape: "B9",
    topic: "broadcast about delivery",
    sentence: "Delivery ₹40 flat.",
    direction: "must_survive",
    because: "The rate is recorded. Only the area is not.",
    check: "introducedWords",
  }),
  wa(59, RESTAURANT, "rest", {
    shape: "B1",
    topic: "broadcast about dine-in",
    sentence: "Forty seats, dine-in only after 9 pm.",
    direction: "must_survive",
    because: "The owner's own recorded row, including the \"only\" that is her own word.",
    check: "introducedWords",
  }),
  wa(60, RESTAURANT, "rest", {
    shape: "B7",
    topic: "broadcast about the menu",
    sentence: "Ek bite mein aap fark mehsoos karenge.",
    direction: "must_be_removed",
    because: "A promise about what the reader will experience, in the Hinglish future frame.",
  }),

  // ─────────────────────────────────────────────────────────────────
  // REAL ESTATE — the figures, the credential and the promise wearing
  // a date.
  // ─────────────────────────────────────────────────────────────────
  wa(61, REALTY, "realty", {
    shape: "B6",
    topic: "broadcast about the 2 BHK",
    sentence: "2 BHK in Sunrise Heights at ₹45,00,000 — 950 sq ft.",
    direction: "must_survive",
    because: "Both figures are the record's. A grouped Indian number must survive the figure check intact.",
    check: "introducedWords",
  }),
  wa(62, REALTY, "realty", {
    shape: "B6",
    topic: "broadcast about the penthouse",
    sentence: "4 BHK penthouse at ₹1.2 Cr, 2100 sq ft.",
    direction: "must_survive",
    because: "₹1.2 Cr and 12000000 are the same number in two spellings, and the unit table has never seen a crore.",
  }),
  wa(63, REALTY, "realty", {
    shape: "B6",
    topic: "broadcast about the penthouse",
    sentence: "4 BHK penthouse at ₹1.2 lakh.",
    direction: "must_be_removed",
    because: "The recorded price is 1.2 crore. A unit error of a factor of a hundred is the reason this fixture exists.",
  }),
  wa(64, REALTY, "realty", {
    shape: "B6",
    topic: "broadcast about RERA",
    sentence: "RERA registration number P52100012345.",
    direction: "must_survive",
    because: "A credential quoted exactly, exactly like the dairy's FSSAI licence. The test of whether that fix generalised.",
    check: "introducedWords",
  }),
  wa(65, REALTY, "realty", {
    shape: "B7",
    topic: "broadcast about possession",
    sentence: "Possession December 2027 mein milega, guaranteed.",
    direction: "must_be_removed",
    because: "The date is recorded; the guarantee is not. A future undertaking is a capability claim wearing a date.",
  }),
  wa(66, REALTY, "realty", {
    shape: "B9",
    topic: "broadcast about possession",
    sentence: "Possession December 2027, aur ab tak eight of twelve floors complete hain.",
    direction: "must_survive",
    because: "Both halves are recorded: the possession date in the product description and the eight floors in the owner's own row.",
    check: "introducedWords",
  }),
  wa(67, REALTY, "realty", {
    shape: "B16",
    topic: "broadcast about the 2 BHK",
    sentence: "2 BHK sirf ₹45,00,000 mein.",
    direction: "must_be_removed",
    because: "A minimiser in front of forty-five lakh. The price is recorded; that it is a little is not, and at this scale the claim is a large one.",
    check: "introducedWords",
  }),
  wa(68, REALTY, "realty", {
    shape: "B10",
    topic: "broadcast about Sunrise Heights",
    sentence: "Nagpur ka premium project, Sunrise Heights.",
    direction: "must_be_removed",
    because: "\"Premium\" is a rank nothing records, and it was one of the first three words this check was built for.",
    check: "introducedWords",
  }),
  wa(69, REALTY, "realty", {
    shape: "B9",
    topic: "broadcast about Sunrise Heights",
    sentence: "Sunrise Heights Nagpur mein hai, RERA registered.",
    direction: "must_survive",
    because: "business.city is Nagpur and the RERA registration is in the owner's own row, so neither is introduced.",
    check: "introducedWords",
  }),
  wa(70, REALTY, "realty", {
    shape: "B13",
    topic: "broadcast about delivery",
    sentence: "Free delivery on your new flat.",
    direction: "must_be_removed",
    because: "A flat is not shipped. shipping is null here, so a delivery line is nonsense exactly as it is at the salon and the coaching class.",
  }),
  wa(71, REALTY, "realty", {
    shape: "B12",
    topic: "broadcast about the 2 BHK",
    sentence: "Site visit book karo: <booking-link>",
    direction: "must_be_removed",
    because: "An angle-bracket slot is a placeholder nothing fills, and the real booking address is on record for the writer to use.",
    check: "notCopy",
  }),
  wa(72, COACHING, "coach", {
    shape: "B13",
    topic: "broadcast about the class 10 maths batch",
    sentence: "Delivery ₹50 for the study material.",
    direction: "must_be_removed",
    because: "shipping is null for a coaching class, so there is no rate to state and the figure is invented outright.",
  }),
];
