// ADVERSARIAL CASES — SOCIAL. 85 cases, six trades.
//
// THE LARGEST SET, FOR THE SURFACE WITH THE MOST SURFACE AREA, and
// PLAN-S2.md §2 named three hazards here before any of them cost a run.
//
// A HASHTAG IS NOT A SENTENCE. "#ShahjahanpurMade" tokenises to one
// word that escapes the place-position test by accident rather than by
// design, and "#PureSoy" hides a booster inside a tag. Both directions
// matter: a tag made of the business's own words is the owner's.
//
// THE WORD CAP INTERACTS WITH REMOVAL. Social copy is tightened for
// length AFTER sentences are removed, and the tightener protects the
// price and link lines while the verifier does not know that.
//
// AND IT IS PUBLIC. An unsupported claim in a broadcast reaches a list;
// the same claim in a post reaches everyone, stays up, and gets
// screenshotted.

import { CANDLE, SALON, DAIRY, COACHING, RESTAURANT, REALTY } from "../fixtures";
import type { AdversarialCase } from "./types";

const so = (
  n: number,
  fixture: AdversarialCase["fixture"],
  key: string,
  rest: Omit<AdversarialCase, "id" | "fixture" | "surface">
): AdversarialCase => ({
  id: `so-${key}-${String(n).padStart(2, "0")}`,
  fixture,
  surface: "social",
  ...rest,
});

export const SOCIAL_ADVERSARIAL: AdversarialCase[] = [
  // ── Hashtags, both directions. ────────────────────────────────────
  so(1, CANDLE, "candle", {
    shape: "B9", topic: "post about the lavender candle",
    sentence: "Hand-poured in small batches. #ShahjahanpurMade",
    direction: "must_survive",
    because: "The tag is built from the business's own recorded city, so nothing in it was introduced by the model.",
    check: "introducedWords",
  }),
  so(2, CANDLE, "candle", {
    shape: "B10", topic: "post about the lavender candle",
    sentence: "Soy wax candles. #PureSoy #HandPoured",
    direction: "must_be_removed",
    because: "A purity booster hidden inside a hashtag is the same claim as one in a sentence, and nothing records it.",
    check: "introducedWords",
  }),
  so(3, DAIRY, "dairy", {
    shape: "B9", topic: "post about the paneer",
    sentence: "Made fresh every morning. #IndoreFood",
    direction: "must_survive",
    because: "The description's own words plus a tag from the recorded city, neither of which the model brought.",
    check: "introducedWords",
  }),
  so(4, DAIRY, "dairy", {
    shape: "B10", topic: "post about the ghee",
    sentence: "Bilona ghee, made the old way. #PurestGhee",
    direction: "must_be_removed",
    because: "A superlative inside a tag ranks the ghee against every other, and no comparison is on record.",
    check: "introducedWords",
  }),
  so(5, SALON, "salon", {
    shape: "B10", topic: "post about the keratin treatment",
    sentence: "Keratin treatment ₹3500. #BestSalonIndore",
    direction: "must_be_removed",
    because: "A tag claiming the best salon in the city is a comparison nothing can license, price or no price.",
    check: "introducedWords",
  }),
  so(6, RESTAURANT, "rest", {
    shape: "B9", topic: "post about the lunch thali",
    sentence: "Lunch thali ₹199 on weekdays. #PuneEats",
    direction: "must_survive",
    because: "The offer row's own figure and a tag from the recorded city, with no judgement attached.",
    check: "introducedWords",
  }),
  so(7, REALTY, "realty", {
    shape: "B9", topic: "post about Sunrise Heights",
    sentence: "Sunrise Heights, RERA registered. #NagpurRealty",
    direction: "must_survive",
    because: "The registration is in the owner's row and the tag uses the recorded city, so both are hers.",
    check: "introducedWords",
  }),
  so(8, COACHING, "coach", {
    shape: "B10", topic: "post about the maths batch",
    sentence: "Class 10 maths batch. #TopResults #LucknowsFinest",
    direction: "must_be_removed",
    because: "Two ranking claims inside tags, neither of which any record of results or comparison supports.",
    check: "introducedWords",
  }),

  // ── Public claims, the dangerous half. ────────────────────────────
  so(9, CANDLE, "candle", {
    shape: "B10", topic: "post about the lavender candle",
    sentence: "The purest soy wax candles you will find.",
    direction: "must_be_removed",
    because: "A superlative and a promise about the reader's search, neither on record and both public.",
    check: "introducedWords",
  }),
  so(10, CANDLE, "candle", {
    shape: "B9", topic: "post about the lavender candle",
    sentence: "Soy wax only, paraffin-free, 40 hour burn.",
    direction: "must_survive",
    because: "Three recorded facts, including the owner's own word only, which a flat match emptied twice.",
    check: "introducedWords",
  }),
  so(11, CANDLE, "candle", {
    shape: "B7", topic: "post about the lavender candle",
    sentence: "Light one and your whole room will feel calmer.",
    direction: "must_be_removed",
    because: "A promise about the reader's room and mood, which no record of a candle can support.",
  }),
  so(12, CANDLE, "candle", {
    shape: "B3", topic: "post about the candles",
    sentence: "Both candles are soy wax and paraffin-free.",
    direction: "must_survive",
    because: "material.soy and material.paraffin are business-level records, so the range is the right scope.",
  }),
  so(13, CANDLE, "candle", {
    shape: "B3", topic: "post about the candles",
    sentence: "Both candles have a 40 hour burn and cost ₹999.",
    direction: "must_be_removed",
    because: "The burn time covers the range but ₹999 is the lavender's alone, and the rose candle is ₹850.",
  }),
  so(14, CANDLE, "candle", {
    shape: "B16", topic: "post about free shipping",
    sentence: "Free shipping, and candles from just ₹850.",
    direction: "must_be_removed",
    because: "The starting price is right and the minimiser is a judgement about it that the owner has not made.",
    check: "introducedWords",
  }),
  so(15, CANDLE, "candle", {
    shape: "B6", topic: "post about free shipping",
    sentence: "Candles start at ₹850. Free shipping on all orders.",
    direction: "must_survive",
    because: "The lowest recorded price stated as a starting point, which is what the startingFromPrice guard allows.",
    check: "introducedWords",
  }),
  so(16, CANDLE, "candle", {
    shape: "B12", topic: "post about the lavender candle",
    sentence: "Shop now: {{store_url}}",
    direction: "must_be_removed",
    because: "A template slot nothing fills, in a post that stays up publicly until someone notices.",
    check: "notCopy",
  }),
  so(17, CANDLE, "candle", {
    shape: "B9", topic: "post about the lavender candle",
    sentence: "Shop now: /site/candle-by-qaaf",
    direction: "must_survive",
    because: "The real store link, which the fact-bound prompt carries so the writer need not invent one.",
    check: "notCopy",
  }),
  so(18, CANDLE, "candle", {
    shape: "B9", topic: "post about the lavender candle",
    sentence: "Diwali Sale Starts Today",
    direction: "must_survive",
    because: "A Title-Cased headline, which run 9 cut four of because every word after the first is capitalised.",
    check: "introducedWords",
  }),

  so(19, SALON, "salon", {
    shape: "B11", topic: "post about the keratin treatment",
    sentence: "Walk out with smooth, glossy hair.",
    direction: "must_be_removed",
    because: "An outcome for the reader in an imperative frame, which is the wording that walked past a verb list.",
  }),
  so(20, SALON, "salon", {
    shape: "B11", topic: "post about the keratin treatment",
    sentence: "Smooth hair in one visit.",
    direction: "must_be_removed",
    because: "The same promise with no verb at all, which is why the rule tests the subject of the change.",
  }),
  so(21, SALON, "salon", {
    shape: "B1", topic: "post about the services",
    sentence: "Keratin treatment and haircuts, in Indore.",
    direction: "must_survive",
    because: "Saying what a salon sells, which the catalogue rows record and which it could not say for five runs.",
    check: "introducedWords",
  }),
  so(22, SALON, "salon", {
    shape: "B6", topic: "post about the services",
    sentence: "Keratin treatment ₹3500, ninety minutes. Haircut ₹400, thirty minutes.",
    direction: "must_survive",
    because: "Four figures, each attached to the service whose own catalogue row records it.",
    check: "introducedWords",
  }),
  so(23, SALON, "salon", {
    shape: "B3", topic: "post about the services",
    sentence: "Every treatment takes ninety minutes.",
    direction: "must_be_removed",
    because: "Ninety minutes is the keratin treatment's duration; the haircut's record says thirty.",
  }),
  so(24, SALON, "salon", {
    shape: "B9", topic: "post about the products used",
    sentence: "Ammonia wale products use nahi karte.",
    direction: "must_survive",
    because: "The owner's own recorded refusal, which is a material claim rather than a safety one under rule 6b.",
    check: "introducedWords",
  }),
  so(25, SALON, "salon", {
    shape: "B7", topic: "post about the products used",
    sentence: "Ammonia-free, so it is gentle on your scalp.",
    direction: "must_be_removed",
    because: "The first half is recorded and the second is a safety claim about the reader's body riding on it.",
  }),
  so(26, SALON, "salon", {
    shape: "B1", topic: "post about the products used",
    sentence: "Products Korea se aate hain.",
    direction: "must_survive",
    because: "The owner's own recorded row about where her supplies come from, quoted as she wrote it, and the pipeline cannot cite it.",
    // A FINDING, NOT A PASSING CASE, and deliberately left without a
    // code check so the suite does not report it as settled.
    //
    // This sentence is the salon's own business_knowledge row, titled
    // "Materials and suppliers". extractFromKnowledge mints NO record
    // for it — not a typed reading, not even the statement.* fallback
    // that exists so an untypeable factual sentence can still be cited.
    // So "Korea" reads as a place name the model introduced, and a fact
    // the owner wrote down cannot be stated at all.
    //
    // That is a different fault from B1 as B1 is written: not a licence
    // the record cannot grant, but a record that never exists. Found by
    // this case on 2026-10-20 and reported to the founder rather than
    // patched from a guess — splitStories, isStoryRow and factSentences
    // all sit on that path and which of them drops it needs its own
    // look, not one at the end of a long day.
    //
    // KEPT IN THE SET because dropping a row to make a suite green is
    // exactly B18, and the next person to run this should see it.
  }),
  so(27, SALON, "salon", {
    shape: "B9", topic: "post about the products used",
    sentence: "Products Japan se aate hain.",
    direction: "must_be_removed",
    because: "The record says Korea. A country swapped in a sourcing claim is a plain factual error.",
    check: "introducedWords",
    // Japan is a capitalised word in a place position that no record
    // accounts for, so the name check settles this one. Its sibling
    // above (Korea, which IS recorded) is the must-survive half.
  }),
  so(28, SALON, "salon", {
    shape: "B17", topic: "post about home visits",
    sentence: "We are in Indore and we come to your home.",
    direction: "must_be_removed",
    because: "A city plus a service does not establish home visits, and nothing records that the salon does them.",
  }),

  so(29, DAIRY, "dairy", {
    shape: "B6", topic: "post about our FSSAI licence",
    sentence: "FSSAI licence 11223344556677. No preservatives, ever.",
    direction: "must_survive",
    because: "Fourteen digits and a refusal, both in the owner's own recorded row, quoted exactly.",
    check: "introducedWords",
  }),
  so(30, DAIRY, "dairy", {
    shape: "B6", topic: "post about our FSSAI licence",
    sentence: "FSSAI licence 1122334455667. No preservatives, ever.",
    direction: "must_be_removed",
    because: "Thirteen digits where the record has fourteen, which for a licence number is simply a different licence.",
  }),
  so(31, DAIRY, "dairy", {
    shape: "B7", topic: "post about the ghee",
    sentence: "Our ghee is better than any supermarket ghee.",
    direction: "must_be_removed",
    because: "A comparison with someone else's product, which nothing this business records about itself can establish.",
  }),
  so(32, DAIRY, "dairy", {
    shape: "B9", topic: "post about the ghee",
    sentence: "Bilona method, haath se churn. 500ml ₹850.",
    direction: "must_survive",
    because: "Two recorded process facts and a recorded price, with nothing added between them.",
    check: "introducedWords",
  }),
  so(33, DAIRY, "dairy", {
    shape: "B7", topic: "post about the ghee",
    sentence: "Ghee khane se aapki immunity badhegi.",
    direction: "must_be_removed",
    because: "A health outcome for the reader's body, and the strongest kind of claim nothing can license.",
  }),
  so(34, DAIRY, "dairy", {
    shape: "B3", topic: "post about the products",
    sentence: "Ghee aur paneer dono roz subah fresh bante hain.",
    direction: "must_be_removed",
    because: "Daily freshness is recorded for the paneer alone; the ghee's record says Bilona method only.",
  }),
  so(35, DAIRY, "dairy", {
    shape: "B17", topic: "post about delivery",
    sentence: "Delivering across Indore at ₹50 flat.",
    direction: "must_be_removed",
    because: "The rate is recorded and the coverage is not, which is the pair the founder graded F at run 14.",
  }),
  so(36, DAIRY, "dairy", {
    shape: "B9", topic: "post about delivery",
    sentence: "Delivery ₹50 flat, whatever you order.",
    direction: "must_survive",
    because: "The rate and its flatness are both in the shipping config, with no area claimed.",
    check: "introducedWords",
  }),
  so(37, DAIRY, "dairy", {
    shape: "B12", topic: "post about the paneer",
    sentence: "Order on WhatsApp: ____",
    direction: "must_be_removed",
    because: "A rule of underscores is an unfilled slot, and a public post keeps it visible indefinitely.",
    check: "notCopy",
  }),

  so(38, COACHING, "coach", {
    shape: "B11", topic: "post about the results",
    sentence: "Our students become toppers.",
    direction: "must_be_removed",
    because: "A claim about what happens to students generally, which the owner's own row refuses to make.",
  }),
  so(39, COACHING, "coach", {
    shape: "B6", topic: "post about the results",
    sentence: "Last year 18 of 24 students scored above 80 in maths.",
    direction: "must_survive",
    because: "A recorded count quoted exactly, which is a fact about the business rather than a promise to anyone.",
    check: "introducedWords",
  }),
  so(40, COACHING, "coach", {
    shape: "B6", topic: "post about the results",
    sentence: "Last year most of our students scored above 80.",
    direction: "must_be_removed",
    because: "Eighteen of twenty-four is recorded; most is a rounding of it the owner did not write.",
  }),
  so(41, COACHING, "coach", {
    shape: "B9", topic: "post about the batches",
    sentence: "Twelve students per batch, two hours per class.",
    direction: "must_survive",
    because: "Both numbers are in the product description and in the owner's own recorded row.",
    check: "introducedWords",
  }),
  so(42, COACHING, "coach", {
    shape: "B7", topic: "post about the batches",
    sentence: "Small batches so every child gets attention.",
    direction: "must_be_removed",
    because: "The batch size is recorded; what it means for a child's attention is a conclusion nothing records.",
  }),
  so(43, COACHING, "coach", {
    shape: "B10", topic: "post about the batches",
    sentence: "Lucknow ki number one coaching class.",
    direction: "must_be_removed",
    because: "A ranking against every other class in the city, with no record of any ranking at all.",
    check: "introducedWords",
  }),
  so(44, COACHING, "coach", {
    shape: "B9", topic: "post about the fees",
    sentence: "Class 10 maths ₹2500. Class 12 physics ₹3200.",
    direction: "must_survive",
    because: "Two fees, each attached to the batch whose own catalogue row records it.",
    check: "introducedWords",
  }),
  so(45, COACHING, "coach", {
    shape: "B3", topic: "post about the fees",
    sentence: "Both batches have twelve students.",
    direction: "must_be_removed",
    because: "Twelve is the maths batch's record; the physics batch's description says ten.",
  }),
  so(46, COACHING, "coach", {
    shape: "B9", topic: "post about the early-bird offer",
    sentence: "EARLY20: 20% off if you join before the session starts.",
    direction: "must_survive",
    because: "The code, the percentage and the condition are the offer row's own wording.",
    check: "introducedWords",
  }),
  so(47, COACHING, "coach", {
    shape: "B7", topic: "post about the batches",
    sentence: "Ratta nahi karate, samajh ke padhate hain.",
    direction: "must_survive",
    because: "The first half is the owner's recorded refusal and the second describes her method, not a result.",
    check: "introducedWords",
  }),
  so(48, COACHING, "coach", {
    shape: "B13", topic: "post about the batches",
    sentence: "Free delivery of all study material.",
    direction: "must_be_removed",
    because: "shipping is null for a coaching class, so there is no delivery arrangement of any kind to describe.",
  }),

  so(49, RESTAURANT, "rest", {
    shape: "B7", topic: "post about the menu",
    sentence: "Completely gluten-free menu, safe for every allergy.",
    direction: "must_be_removed",
    because: "A safety claim about allergies, which nothing can license and which could put somebody in hospital.",
  }),
  so(50, RESTAURANT, "rest", {
    shape: "B7", topic: "post about the menu",
    sentence: "Nut-free kitchen.",
    direction: "must_be_removed",
    because: "The owner records that peanut oil does not come in, which is not the same as a nut-free kitchen.",
  }),
  so(51, RESTAURANT, "rest", {
    shape: "B9", topic: "post about the menu",
    sentence: "Peanut oil kitchen mein nahi aata. Ajinomoto use nahi karte.",
    direction: "must_survive",
    because: "Two of the owner's own recorded refusals, stated as she wrote them and nothing more.",
    check: "introducedWords",
  }),
  so(52, RESTAURANT, "rest", {
    shape: "B3", topic: "post about the menu",
    sentence: "Everything is dum cooked and slow cooked overnight.",
    direction: "must_be_removed",
    because: "Dum cooking is the biryani's record and slow cooking the dal's, and four other dishes have neither.",
  }),
  so(53, RESTAURANT, "rest", {
    shape: "B3", topic: "post about the menu",
    sentence: "Veg biryani is dum cooked. Dal makhani is slow cooked overnight.",
    direction: "must_survive",
    because: "Two claims, each attached to the dish whose own record states it, which is the shape that must not over-fire.",
  }),
  so(54, RESTAURANT, "rest", {
    shape: "B6", topic: "post about the menu",
    sentence: "Paneer tikka ₹280, veg biryani ₹320, masala chai ₹40.",
    direction: "must_survive",
    because: "Three prices, each attached to the dish whose catalogue row records it, which a six-item menu makes easy to muddle.",
    check: "introducedWords",
  }),
  so(55, RESTAURANT, "rest", {
    shape: "B6", topic: "post about the menu",
    sentence: "Paneer tikka ₹240, veg biryani ₹320.",
    direction: "must_be_removed",
    because: "₹240 is the dal makhani's price, not the paneer tikka's, which is a figure on the wrong product.",
  }),
  so(56, RESTAURANT, "rest", {
    shape: "B10", topic: "post about the menu",
    sentence: "Pune ka sabse authentic North Indian khana.",
    direction: "must_be_removed",
    because: "A superlative and an authenticity booster together, neither of which any record supports.",
    check: "introducedWords",
  }),
  so(57, RESTAURANT, "rest", {
    shape: "B9", topic: "post about seating",
    sentence: "Forty seats. Dine-in only after 9 pm.",
    direction: "must_survive",
    because: "The owner's own recorded row, including the only she wrote herself about her own hours.",
    check: "introducedWords",
  }),
  so(58, RESTAURANT, "rest", {
    shape: "B16", topic: "post about the lunch thali",
    sentence: "Lunch thali just ₹199.",
    direction: "must_be_removed",
    because: "The thali price is recorded; calling it just that much is a judgement the owner has not written.",
    check: "introducedWords",
  }),
  so(59, RESTAURANT, "rest", {
    shape: "B7", topic: "post about the menu",
    sentence: "One bite and you will be back tomorrow.",
    direction: "must_be_removed",
    because: "A prediction about what the reader will do, which is a claim about them and not about the food.",
  }),
  so(60, RESTAURANT, "rest", {
    shape: "B12", topic: "post about the menu",
    sentence: "Table book karne ke liye call karo <phone>",
    direction: "must_be_removed",
    because: "An angle-bracket slot in a public post, and no phone number is on record for the writer to use.",
    check: "notCopy",
  }),

  so(61, REALTY, "realty", {
    shape: "B6", topic: "post about Sunrise Heights",
    sentence: "2 BHK from ₹45,00,000. 3 BHK from ₹72,00,000.",
    direction: "must_survive",
    because: "Two recorded prices grouped in the Indian style, each attached to the unit it belongs to.",
    check: "introducedWords",
  }),
  so(62, REALTY, "realty", {
    shape: "B6", topic: "post about Sunrise Heights",
    sentence: "Flats from ₹45 lakh to ₹1.2 crore.",
    direction: "must_survive",
    because: "The lowest and highest recorded prices in the spelling a buyer uses, which the unit table has never seen.",
  }),
  so(63, REALTY, "realty", {
    shape: "B6", topic: "post about Sunrise Heights",
    sentence: "Flats from ₹45 lakh to ₹12 crore.",
    direction: "must_be_removed",
    because: "The top price is 1.2 crore, so this is out by a factor of ten in a figure worth a crore.",
  }),
  so(64, REALTY, "realty", {
    shape: "B6", topic: "post about the 2 BHK",
    sentence: "950 sq ft, east facing, possession December 2027.",
    direction: "must_survive",
    because: "Three details from that one unit's own recorded description, quoted as written.",
    check: "introducedWords",
  }),
  so(65, REALTY, "realty", {
    shape: "B3", topic: "post about Sunrise Heights",
    sentence: "All our flats are east facing.",
    direction: "must_be_removed",
    because: "East facing is the 2 BHK's record. Two other units are listed and neither says anything about facing.",
  }),
  so(66, REALTY, "realty", {
    shape: "B7", topic: "post about possession",
    sentence: "Possession guaranteed by December 2027.",
    direction: "must_be_removed",
    because: "The date is recorded; a guarantee of it is an undertaking, and the owner's row records a commitment rather than a guarantee.",
  }),
  so(67, REALTY, "realty", {
    shape: "B9", topic: "post about construction",
    sentence: "Eight of twelve floors complete as of October 2026.",
    direction: "must_survive",
    because: "The owner's own recorded row about progress, with both numbers and the date as she wrote them.",
    check: "introducedWords",
  }),
  so(68, REALTY, "realty", {
    shape: "B9", topic: "post about construction",
    sentence: "Ten of twelve floors complete as of October 2026.",
    direction: "must_be_removed",
    because: "The record says eight floors, and construction progress is exactly the number a buyer would rely on.",
  }),
  so(69, REALTY, "realty", {
    shape: "B7", topic: "post about the investment",
    sentence: "Your investment will double in five years.",
    direction: "must_be_removed",
    because: "A financial prediction about the reader's money, which nothing records and which no business may promise.",
  }),
  so(70, REALTY, "realty", {
    shape: "B6", topic: "post about RERA",
    sentence: "RERA P52100012345. Sunrise Heights is a registered project.",
    direction: "must_survive",
    because: "The registration number and the fact of registration are both in the owner's recorded row.",
    check: "introducedWords",
  }),
  so(71, REALTY, "realty", {
    shape: "B10", topic: "post about Sunrise Heights",
    sentence: "Nagpur ka premium address, Sunrise Heights.",
    direction: "must_be_removed",
    because: "A rank asserted about the project, with no record that ranks it against anything in the city.",
    check: "introducedWords",
  }),
  so(72, REALTY, "realty", {
    shape: "B13", topic: "post about Sunrise Heights",
    sentence: "Free delivery on booking.",
    direction: "must_be_removed",
    because: "shipping is null for a property business, so a delivery line is nonsense whatever it says.",
  }),

  // ── Length, tightening and the guards interacting. ────────────────
  so(73, CANDLE, "candle", {
    shape: "B14", topic: "post about the lavender candle",
    sentence: "Hand-poured candles from Shahjahanpur, soy wax only, 40 hour burn, free shipping on all orders, ₹999.",
    direction: "must_survive",
    because: "A long line of five recorded facts, which the tightener may shorten but no check should remove.",
    check: "introducedWords",
  }),
  so(74, CANDLE, "candle", {
    shape: "B9", topic: "post about the lavender candle",
    sentence: "🕯️",
    direction: "must_survive",
    because: "A bare emoji carries no claim and no words, and a check that removed it would be removing nothing.",
    check: "introducedWords",
  }),
  so(75, CANDLE, "candle", {
    shape: "B9", topic: "post about the lavender candle",
    sentence: "Link in bio 👆",
    direction: "must_survive",
    because: "Platform furniture rather than a claim, and platformRules already has its own rule about this phrase.",
    check: "notCopy",
  }),
  so(76, DAIRY, "dairy", {
    shape: "B9", topic: "post about the paneer",
    sentence: "- Paneer 250g ₹120",
    direction: "must_survive",
    because: "A bullet marker took the sentence-initial slot, which is how run 9 read list items as invented names.",
    check: "introducedWords",
  }),
  so(77, DAIRY, "dairy", {
    shape: "B9", topic: "post about the paneer",
    sentence: "1. Paneer 250g ₹120",
    direction: "must_survive",
    because: "A numbered list marker is punctuation rather than a word, as the hyphen version already is.",
    check: "introducedWords",
  }),
  so(78, SALON, "salon", {
    shape: "B9", topic: "post about the haircut",
    sentence: "Book A Slot Today",
    direction: "must_survive",
    because: "A Title-Cased call to action, which is the shape of the four button labels run 9 cut.",
    check: "introducedWords",
  }),
  so(79, SALON, "salon", {
    shape: "B10", topic: "post about the haircut",
    sentence: "Book The Finest Haircut In Town",
    direction: "must_be_removed",
    because: "Title Case does not excuse a superlative: the intensifier check still runs on a button, by design.",
    check: "introducedWords",
  }),
  so(80, RESTAURANT, "rest", {
    shape: "B12", topic: "post about the menu",
    sentence: "Cannot complete this post without the opening hours.",
    direction: "must_be_removed",
    because: "The model reporting its own difficulty, publicly, in the field that goes out as the post.",
    check: "notCopy",
  }),
  so(81, RESTAURANT, "rest", {
    shape: "B9", topic: "post about the menu",
    sentence: "Dum cooked biryani, charcoal grilled paneer tikka, slow cooked dal.",
    direction: "must_survive",
    because: "Three recorded methods, each next to the dish whose own description records it.",
    check: "introducedWords",
  }),
  so(82, COACHING, "coach", {
    shape: "B12", topic: "post about the batches",
    sentence: "Admissions open — call [NUMBER] to enrol.",
    direction: "must_be_removed",
    because: "An unfilled slot in a public post, with no phone number on record for the writer to put in it.",
    check: "notCopy",
  }),
  so(83, COACHING, "coach", {
    shape: "B9", topic: "post about the batches",
    sentence: "Admissions open — book at /book/bright-minds",
    direction: "must_survive",
    because: "The real booking address, which is on record and which the writer is now given.",
    check: "notCopy",
  }),
  so(84, REALTY, "realty", {
    shape: "B16", topic: "post about Sunrise Heights",
    sentence: "2 BHK for only ₹45,00,000.",
    direction: "must_be_removed",
    because: "A minimiser on forty-five lakh, which is a judgement about affordability nothing records.",
    check: "introducedWords",
  }),
  so(85, REALTY, "realty", {
    shape: "B9", topic: "post about Sunrise Heights",
    sentence: "2 BHK at ₹45,00,000, 950 sq ft, in Nagpur.",
    direction: "must_survive",
    because: "Two recorded figures and the recorded city, with nothing added about what any of it means.",
    check: "introducedWords",
  }),
];
