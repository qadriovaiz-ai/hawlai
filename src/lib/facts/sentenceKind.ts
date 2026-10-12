// What kind of sentence is this?
//
// PLAN-FACT-BOUND-GENERATION §3: the model will return sentences tagged
// factual / feeling / cta / question, and only factual ones need
// citations. This module is the code side of that — used now to
// classify the owner's RECORDED rows during extraction, and later to
// check the model's own labelling (§4.10).
//
// WHY THE SAME FUNCTION FOR BOTH. If extraction and verification used
// different definitions of "factual", a sentence could be recorded as a
// fact and then rejected as unlabelled, or the reverse. One definition,
// used in both directions.
//
// DELIBERATELY DETERMINISTIC. No model call: this runs on every
// extraction and every verification, and a classification that costs
// money or varies between runs is not a foundation.

/** A sentence's kind. `factual` is the only one that needs citations. */
export type SentenceKind = "factual" | "feeling" | "cta" | "question";

/** A question, in either script. Checked first: a question asserts nothing. */
const QUESTION = /\?\s*$|？\s*$/;

/**
 * An instruction to the reader: order, book, visit, reply, click.
 *
 * A CTA still needs a licence when it names a destination — "order on
 * the store page" rests on there being a store page — so `cta` is not a
 * free pass. It is separated from `factual` because its CLAIM is the
 * link, not the prose, and the two are verified differently.
 */
const CTA = [
  /\b(?:order|buy|shop|book|visit|call|message|dm|reply|click|tap|grab|try)\b[^.!?]{0,30}\b(?:now|today|here|us|me|below|link|page|store|site|bio)\b/i,
  /\blink\s+in\s+(?:bio|the\s+bio)\b/i,
  /\b(?:order|book|shop)\s+(?:it\s+)?(?:on|at|from)\b/i,
  // Hinglish: "abhi order karein", "yahan se le lo"
  /\b(?:abhi|aaj)\b[^.!?]{0,20}\b(?:order|book|le\s+lo|mangwa)/i,
  /(?:आज|अभी)[^।.!?]{0,20}(?:ऑर्डर|मंगवा)/,
];

/**
 * A checkable assertion: a number, a measure, a material, a policy, a
 * comparison, a claimed effect.
 *
 * OVER-INCLUSIVE ON PURPOSE, and the direction matters. Calling a
 * feeling sentence `factual` costs a citation the model has to supply
 * or the sentence goes — annoying, visible, recoverable. Calling a
 * factual sentence `feeling` lets an unsupported claim through with no
 * citation at all, which is the failure this whole design exists to
 * stop. So when in doubt: factual.
 */
const FACTUAL = [
  // Any digit, in either numeral system. A number is the clearest
  // checkable thing there is.
  /[0-9]/,
  /[०-९]/,
  // Money, with or without a symbol.
  /₹|\brs\.?\b|\binr\b|\brupees?\b|\brupaye\b/i,
  // Spelled-out quantities beside a UNIT. Units only — no product
  // nouns. The first version of this line ended "|piece|candle|batch)",
  // and multiTenantVocabulary.test.ts caught the "candle": one
  // business's product noun, compiled into a classifier every business
  // runs. Rule 3, and the test is right.
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty|ninety|hundred)\s+(?:minute|hour|day|week|month|year|gram|kg|ml|litre|liter)/i,
  /\b(?:ek|do|teen|char|paanch|das|bees|chalees|pachas|sau)\s+(?:minute|ghante|ghanta|din|hafte|mahine|saal|gram|kilo)/i,
  // COMPOSITION, said as a RELATION rather than as a list of materials.
  //
  // The first version enumerated soy, paraffin, beeswax, cotton, silk,
  // gluten, dairy… — a candle-and-textile-and-food vocabulary in a file
  // that classifies sentences for every trade, and the multi-tenant
  // test refused it. It was also unnecessary: what makes "made with
  // beeswax" checkable is "made with", not "beeswax", and the relation
  // works for a saree, a ghee and a haircut alike.
  /\b(?:made\s+(?:with|of|from|using)|contains?|ingredients?|composition|free\s+from|without\s+any|no\s+added)\b/i,
  /\b(?:se\s+bana|se\s+banta|se\s+banayi|mila\s+hua|bilkul\s+nahi)\b/i,
  // Process stated as process, again without naming one trade's method.
  /\b(?:hand[-\s]?\w+|by\s+hand|small\s+batch(?:es)?|batch\s+of|pressed|ground|poured|roasted|woven|stitched|cured?|cures|setting\s+time)\b/i,
  /\b(?:haath\s+se|chhote\s+batch|dheere)\b/i,
  // Policy words: shipping, returns, offers, guarantees.
  /\b(?:free|shipping|delivery|return|refund|exchange|warranty|guarantee|discount|off|offer|cod|cash\s+on\s+delivery)\b/i,
  /\b(?:muft|wapsi|chhoot|offer)\b/i,
  // Process and method — the kind of sentence the recorded rows are
  // full of, and which nothing verified before.
  // WHERE A MATERIAL COMES FROM — a supplier, a place, an import.
  //
  // There was no cue for this, so "Soy wax Kanpur ke supplier se aata
  // hai" classified as a FEELING and the supplier fact never became a
  // record at all. The extractor's own test caught it.
  /\b(?:supplier|sourced|comes?\s+from|imported|locally|handpicked|grown)\b/i,
  /\b(?:se\s+aata|se\s+aati|se\s+lete|se\s+mangwa|ka\s+supplier)\b/i,
  // HINGLISH ASSERTIONS, and this gap is worth naming because it is the
  // same asymmetry in a new place.
  //
  // The English cues were far richer than the Hinglish ones, so THREE
  // of the owner's four recorded Hinglish fact sentences classified as
  // FEELING and minted no record at all:
  //
  //   "Kabhi sasta paraffin wax mix nahi karti."   a refusal fact
  //   "Wax double boiler mein melt karti hoon."    a process fact
  //
  // A classifier that reads English facts and hears Hinglish feelings
  // would have under-recorded this owner's entire evidence set — the
  // exact failure the pivot exists to remove, arriving by a new route.
  //
  // A REFUSAL: "nahi karti", "kabhi nahi", "use nahi karte".
  /(?:nahi\s+(?:karti|karta|karte|milati|dalti|use)|kabhi\s+nahi|bilkul\s+nahi|mix\s+nahi)/i,
  // AN ACTION THE OWNER PERFORMS ON THE PRODUCT — the shape every
  // process answer takes. Over-inclusive on purpose: a factual sentence
  // we cannot type still becomes a citable statement, whereas one
  // misread as a feeling becomes nothing.
  /(?:karti\s+hoon|karta\s+hoon|karte\s+hain|milati|milata|dalti|dalta|banati|banata|banate|pour\s+karti|melt\s+karti|set\s+hoti|set\s+hota)/i,
  /(?:करती\s*हूँ|करती\s*हूं|करता\s*हूँ|नहीं\s*करती|नहीं\s*करता)/,
  // A comparison, which no record can license.
  /\b(?:better|best|cheaper|cheapest|stronger|longer|purer|safer|more|most|unlike|than|only\s+one|first)\b/i,
  // A claimed effect on the reader — unlicensable, and it must be
  // labelled factual so the absence of a licence can refuse it.
  /\b(?:sleep|relax|calm|soothe|stress|energy|focus|immunity|digestion|skin|hair|pain|heal|cure|detox|therapeutic|non[-\s]?toxic|hypoallergenic)\b/i,
  // Ratings, counts, social proof — in their COUNT forms only.
  //
  // The first version listed `order`, and "Order on the store page."
  // then classified as factual: a count of orders and an instruction to
  // place one are the same letters doing different jobs. Any digit
  // already makes a sentence factual, so this needs only the plurals
  // that assert a count without one.
  /\b(?:stars?|ratings?|reviews?|customers|orders|sold|bestsell|best[-\s]?sell)\b/i,
];

/**
 * A sentence with no checkable assertion: atmosphere, invitation,
 * description of how something feels.
 *
 * This is the ONLY kind that needs no citation, which makes it the
 * obvious bypass — a model could label everything `feeling`. §4.10
 * closes that by running this same classifier over whatever the model
 * labelled and reclassifying anything that trips FACTUAL. That check is
 * a denylist, and it is the one place the old approach survives: it
 * guards the LABEL, not the content.
 */
export function classifySentence(text: string): SentenceKind {
  const s = String(text ?? "").trim();
  if (!s) return "feeling";
  if (QUESTION.test(s)) return "question";
  // FACTUAL BEFORE CTA, and the order is the decision: "Order now and
  // get free shipping" is a call to action AND a policy claim, and the
  // claim is what needs checking. A sentence that is both is factual.
  if (FACTUAL.some((re) => re.test(s))) return "factual";
  if (CTA.some((re) => re.test(s))) return "cta";
  return "feeling";
}

/** Every sentence that must carry a citation. */
export function needsCitation(kind: SentenceKind): boolean {
  return kind === "factual";
}

/**
 * Someone ELSE's belief, reported — usually in order to correct it.
 *
 * FOUND BY THE OWNER-CONFIRMATION TABLE, before anything depended on
 * it. The intake asks "What do people get wrong?", and this owner
 * answered:
 *
 *   "Log sochte hain ki 10 ghante jalti hai. 40 hours burn hota hai."
 *   (People think it burns 10 hours. It burns 40.)
 *
 * The extractor read BOTH numbers and minted `product.burn_hours = 10`
 * beside `product.burn_hours = 40` — so a row whose entire purpose is
 * to deny a false claim became the evidence FOR it. Copy could then
 * have cited a record saying 10 hours, which is exactly the shape of
 * wrongness fact-binding is meant to end, sourced from the truth
 * layer itself.
 *
 * A reported belief is not a fact about the product. The sentence is
 * skipped; the correction beside it is a separate sentence and is kept.
 *
 * NOT a judgement call about truth — a frame detector. "People think
 * X" tells us nothing about X either way, so there is nothing to
 * record.
 */
const REPORTED_BELIEF = [
  /\b(?:people|customers|everyone|most\s+people|some\s+people|they)\s+(?:think|thinks|assume|assumes|believe|believes|expect|expects|say|says|imagine)\b/i,
  /\b(?:it\s+is\s+(?:often\s+)?assumed|the\s+assumption\s+is|a\s+common\s+(?:myth|misconception|belief))\b/i,
  // Hinglish: "log sochte hain", "aksar log samajhte hain", "lagta hai ki"
  /(?:log\s+(?:sochte|samajhte|maante|kehte)\s+hain|aksar\s+log|sabko\s+lagta|lagta\s+hai\s+ki)/i,
  /(?:लोग\s*सोचते|लोग\s*समझते|लगता\s*है\s*कि)/,
];

export function isReportedBelief(sentence: string): boolean {
  const s = String(sentence ?? "");
  return REPORTED_BELIEF.some((re) => re.test(s));
}
