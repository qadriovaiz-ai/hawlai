// C2 STEP 4a — WHAT DOES THIS SENTENCE ACTUALLY CLAIM?
//
// docs/PLAN-CORE-ARCHITECTURE.md §2.2. This is the step that removes
// the language problem and the paraphrase problem, because matching
// stops happening on words: the text is READ and re-stated as English
// canonical claims, and the entailment step then matches those against
// records.
//
// WHY IT IS THE RISKIEST PART OF THE DESIGN. A claim this step does not
// enumerate is never judged, so a miss PASSES a false sentence
// silently. The denylist's failures were at least visible in the output;
// this one's would not be. So it is measured against the 135
// human-graded sentences of the 13 October baseline before anything
// depends on it, and the measurement is the gate — not an assumption.
//
// IT IS GIVEN NO RECORDS, DELIBERATELY. Two reasons. It cannot be
// talked into agreeing that a claim is supported, because it is never
// asked; and the writer's own citations are never evidence — step 4a
// re-derives the claims from the text alone, so a model that cites a
// fact id while writing something else is caught. Citation is necessary
// and not sufficient, which is the rule this codebase already runs on.
//
// NO NUMBER IS JUDGED HERE. A claim carrying a value goes to code,
// which checks it against the record. The judge only ever sees
// qualitative claims.

import { callClaude } from "@/lib/ai/claude";
import { CLAUDE_MODELS } from "@/lib/models";

/** What a claim is about. `competitor` is the one that needs no licence to refuse. */
export type ClaimSubject = "own_product" | "own_business" | "competitor" | "customer";

export type ClaimType =
  // Decided by code against a record.
  | "price"
  | "offer"
  | "shipping"
  | "duration"
  | "availability"
  | "count"
  | "credential"
  /**
   * A claim about the READER's own situation: that they have placed an
   * order, that it is on its way, that a booking exists, that they are
   * a member, that something is reserved for them.
   *
   * Added 2026-10-16 after the recall gate missed
   * "Aapka lavender candle aa raha hai" — "your lavender candle is on
   * its way" — in a case where no records could be read at all. It
   * asserts that an order exists, and it was phrased as a greeting, so
   * none of the other twelve types fitted and the extractor reported no
   * claim. A claim nobody enumerates is a claim nobody judges.
   */
  | "customer_state"
  // Decided by a licence on the cited record.
  | "material"
  | "process"
  // No source in the system licenses these. See factRecord.LICENCES.
  | "capability"
  | "comparison"
  | "benefit"
  | "safety";

export type ExtractedClaim = {
  /** Which sentence of the input, 0-based. */
  sentenceIndex: number;
  /** English, plain, one assertion: "the candle burns slower than paraffin candles". */
  canonical: string;
  claimType: ClaimType;
  subject: ClaimSubject;
  polarity: "assert" | "deny" | "hedge";
  /** Present only when the claim carries a figure. Code checks these, never a judge. */
  value?: { number: number; unit: string } | null;
  /** Set whenever subject is "competitor" — what the comparison is against. */
  comparedWith?: string | null;
  /**
   * The product or service the sentence is about, or null for the
   * business generally. Read from the SENTENCE, with no records in
   * front of it.
   *
   * Without this the figure check matched a number against any approved
   * claim at all, so the Rose candle could be given the Lavender's
   * price — a scope hole in the arithmetic path, found on 18 October.
   */
  aboutProduct?: string | null;
};

export const CLAIM_TYPES: ClaimType[] = [
  "price", "offer", "shipping", "duration", "availability", "count", "credential",
  "customer_state", "material", "process", "capability", "comparison", "benefit", "safety",
];

/** Claim types a record can never license, whatever is on file. */
export const UNLICENSABLE_TYPES: ClaimType[] = ["capability", "comparison", "benefit", "safety"];

/**
 * Claims that can only be backed by a record about THIS RECIPIENT — a
 * real order row, a real booking — and not by anything about the
 * business in general.
 *
 * `business.paid_orders = 2` does not establish that the person reading
 * this has one of them. getContext carries no per-recipient records
 * today, so in practice nothing in the context can support a
 * customer_state claim and the verifier must refuse it. That is the
 * founder's rule of 2026-10-16: backed by a real order or lead row, or
 * it is false.
 *
 * Kept separate from UNLICENSABLE_TYPES because the difference is real:
 * a benefit claim can never be supported by anything, while this one
 * becomes supportable the day a send carries the recipient's own row.
 */
export const NEEDS_RECIPIENT_RECORD: ClaimType[] = ["customer_state"];

const TOOL = {
  name: "report_claims",
  description:
    "Report every factual claim the text makes. Do not judge whether any of them is true — you have no records and must not guess.",
  input_schema: {
    type: "object",
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sentenceIndex: { type: "integer", description: "Which numbered sentence this claim comes from." },
            canonical: {
              type: "string",
              description:
                "The claim restated in plain English, one assertion only, whatever language the sentence was in. Name the subject explicitly — what the claim is ABOUT and what is being said of it — rather than leaving a bare predicate like 'lasts longer'.",
            },
            claimType: { type: "string", enum: CLAIM_TYPES },
            subject: { type: "string", enum: ["own_product", "own_business", "competitor", "customer"] },
            polarity: {
              type: "string",
              enum: ["assert", "deny", "hedge"],
              description:
                "assert = states it. deny = states it is not so ('no paraffin', 'paraffin nahi'). hedge = suggests it without committing ('deserves a closer look').",
            },
            value: {
              type: "object",
              description: "Only when the claim carries a figure. Copy the figure from the text; never compute one.",
              properties: {
                number: { type: "number" },
                // OPTIONAL, AND THE S2a WHATSAPP RUN OF 2026-10-19 IS
                // WHY. It was required. "Shipping costs 50." states no
                // unit, so the model had to put something in the field
                // and returned "<UNKNOWN>" — which then read as a unit
                // that contradicts the record's "inr", and a true,
                // recorded 50 was removed from the message.
                //
                // Same shape as the boolean that had to be stringified
                // to "false" and was then read as marking the claim
                // untrue: a field that cannot say "there is none" makes
                // the model invent one.
                unit: { type: "string", description: "The unit as the text states it. OMIT this entirely when the text states no unit. Never put a placeholder here." },
              },
              required: ["number"],
            },
            comparedWith: {
              type: "string",
              description: "What the claim compares against, when it compares with anything outside this business.",
            },
            aboutProduct: {
              type: "string",
              description:
                "The name of the ONE product or service this sentence is about, ONLY when the sentence names a particular item. OMIT it for a collective or generic reference — \"the product\", \"the products\", \"our range\", \"each one\" — and omit it when the sentence is about the business generally. A collective reference is the range, not an item.",
            },
          },
          required: ["sentenceIndex", "canonical", "claimType", "subject", "polarity"],
        },
      },
    },
    required: ["claims"],
  },
} as const;

const SYSTEM = `You read marketing copy and list the factual claims it makes. You are a reader, not an editor and not a judge.

RULES
1. One claim per assertion. A sentence making two claims produces two entries; a sentence making none produces none.
2. The text may be in English, Hindi, Hinglish (romanised Hindi) or Devanagari, often mixed inside one sentence. Read all of it. State every claim in plain English.
3. A claim is anything a customer could check and find false. Greetings, feelings, invitations, questions and calls to action are NOT claims.
4. State what the words MEAN, not what they say. A sentence saying this one performs better, lasts longer or is cleaner than the ordinary sort is a comparison, however it is phrased and in whatever language. A sentence saying the business takes care of something for the customer by itself is a capability claim.
5. A claim about anyone else's product or service — named, or implied by phrases like "the ordinary kind", "what most places use", "the usual sort", "ke mukable", "jaisa aksar hota hai" — has subject "competitor" and claimType "comparison". Set comparedWith to whatever it is measured against.
5a. BUT CORRECTING A FALSE BELIEF ABOUT YOUR OWN THING IS NOT A COMPARISON. A confirmation run of 2026-10-20 produced "<the item> lasts 40 hours, not 10 hours" and it came back as "comparison", which nothing can license - so the one sentence the owner had written a Business Knowledge row IN ORDER TO SAY could not be said. The row existed precisely to correct that belief, in the form "people think it is 10". A comparison needs A SECOND PARTY: someone else's product, someone else's price, the ordinary kind, what most places use. "X, not Y" where both X and Y describe THE SAME THING OF YOURS is the recorded figure plus a correction of a belief, and its claimType is whatever the figure is - a duration here, with the recorded number. The correction carries no second claim of its own: nobody is being measured against anybody.
6. A claim that something improves or protects the customer's health, sleep, mood, body or appearance is claimType "benefit". A claim that something IS safe, non-toxic, gentle or suitable for babies, children, pregnancy or sensitive skin is "safety". These are claims even when softly worded.
6a. A BENEFIT IS AN EFFECT ON THE PERSON. A PROPERTY OF THE THING IS NOT. This is the line that decides whether a claim can be supported at all, so read it carefully. "It helps you sleep", "your hair will feel smoother", "you will taste the difference" are about the READER, and no record can support them. "It is fresh", "it is hand-poured", "it burns for 40 hours", "it is made in small batches" are about the THING — its state, its make, its measurements — and those are "material" or "process" claims, which a record can support. A quality the records describe is not a benefit just because a customer would be pleased by it.
6b. BUT A STATEMENT ABOUT WHAT IS OR IS NOT IN SOMETHING IS "material", NOT "safety" — even when the substance named is one people avoid for safety reasons, and even when the sentence is phrased as a negative. "We do not use <substance>", "<substance>-free", "made without <substance>" are material claims: they say what went into the thing. Only a claim that the thing IS SAFE, or safe FOR SOMEONE, is "safety". The difference decides whether the claim can be supported at all, so read it carefully.
6c. IF THE SENTENCE NAMES A STATE THE READER OR THEIR BELONGINGS WILL BE IN, IT IS A BENEFIT CLAIM. THE TEST IS THE SUBJECT OF THE CHANGE, NEVER THE VERB. It does not matter whether the verb is future, imperative, or absent altogether, and it does not matter which language it is in. All of these are the same claim and all are "benefit": "your <thing> will be <quality>", "get <quality> <thing>", "<quality> <thing> in one visit", "walk out with <quality> <thing>", "<quality> <thing>, <price>" with no verb at all, and the Hinglish forms, which put it at the end of the sentence or in an imperative: "<quality> ho jayenge", "ban jayenge", "lagega", "mehsoos hoga", "dikhega", "pa jaao", "paao", "mil jayega". A BARE NOUN PHRASE COUNTS. "Rs 3500 mein glossy, smooth hair" states no verb and promises the same outcome; the claim is the quality attached to the reader's own thing. I patched this rule once with a list of verb endings and the next run simply used a different one, which is why the test above is the subject and not the wording. NOT A BENEFIT: a state of the THING ITSELF (6a), and anything the BUSINESS will do or give - "order ho jayega", "aapko 10% off milega", "delivery ho jayegi" - which are "capability" or "offer" and judged by their own rules. The question to ask is: after this sentence, what is different, and does it belong to the reader or to the seller?
6d. ONE PROPERTY OVER SEVERAL NAMED THINGS IS SEVERAL CLAIMS. "Fresh <thing A> and <thing B>", "<thing A> and <thing B> are hand-made", "all three are organic" — report the claim ONCE PER THING, each with its own aboutProduct, exactly as rule 11 does for two different claims in one sentence. A record about one of the things says nothing about the other, and a single merged claim hides that: the one with evidence carries the one without. This is the commonest way a true record gets stretched to cover something it never mentioned.
7. A claim about what the business or its software WILL DO for the customer on its own — remember, remind, rebook, repeat, deliver or follow up automatically — is claimType "capability", even when it is phrased as reassurance rather than as a promise.
7c. AND DOING WHAT THE CUSTOMER ASKED FOR IS NOT A CAPABILITY CLAIM EITHER. This is the line my own rule got wrong, and the WhatsApp confirmation run of 2026-10-20 found it: "We're based in Indore and happy to get your order to you" came back as "capability", which nothing can license, so a dairy could not say it delivers. Rule 7 lists "deliver" among the automatic actions - and that is only true of delivering something NOBODY ASKED FOR. FULFILLING AN ORDER IS THE OPPOSITE: the customer asked, and a shipping or delivery policy on record is exactly what supports it, so the claimType is "shipping" or "availability". The test is whether the business acts WITHOUT BEING ASKED EACH TIME: reminding, rebooking, renewing, following up by itself, deciding something on the customer's behalf. Sending what somebody ordered is not that, and neither is turning up to an appointment they booked.
7a. BUT ORDINARY COURTESY IS NOT A CAPABILITY CLAIM, and this is the commonest mistake here. "Ask us anything", "we are here", "any questions, just say", "let's get started", "hum yahan hain", "poochh lo", "shuru karein" — being available, willing, glad or ready is not an operational undertaking. It needs no record and it is NOT a claim: report nothing for it, or report it as a call to action. A STATEMENT OF ROLE OR PURPOSE IS COURTESY TOO — "helping you is our job", "that is what we are here for", "aapki madad karna hamara kaam hai". Saying who they are for is not an undertaking to do a particular thing. A capability claim names a SPECIFIC OPERATION the business performs by itself, as a matter of how it operates — rebook, remind, deliver, follow up, renew — without the customer asking each time. If you cannot name the operation, it is not a capability claim.
7b. AND NEITHER IS SELLING THE THING AT ALL. "We offer <service>", "we do <service>", "<service> available here", "hum <service> karte hain" say that the business SELLS something. That is "availability" - a claim that the thing is on offer, which a catalogue record can support - and it is not "capability", which is about the business acting BY ITSELF, without being asked, on the customer's behalf: reminding, rebooking, renewing, delivering, following up. The difference decides whether the claim can be supported at all, because nothing can license a capability claim and a catalogue row licenses an availability one, so typing it wrong deletes a true sentence about what the business does for a living. The gate of 2026-10-20 reported "the business offers keratin treatment" and "the business offers fresh haircuts" as capability; both are availability, and both would have been removed from a salon's own broadcast.
8. Copy figures exactly as written. Never convert, round or compute. A figure written in words, in Devanagari digits or beside a unit in another language is still that figure.
9. A hedge is still a claim. Casting doubt on a widely held belief, or inviting the reader to reconsider one, asserts the opposite of that belief — type it by what is being implied, with polarity "hedge".
10. A sentence about the READER's own situation — that they have ordered something, that it is on its way, that they have a booking, that something is reserved or being prepared for them — is claimType "customer_state", subject "customer". Report it even when it is phrased as a greeting, a welcome or a reassurance, because it asserts that a real order or booking exists.
11. ONE SENTENCE OFTEN CARRIES TWO CLAIMS, AND THE SECOND IS THE ONE THAT GETS MISSED. When a sentence states a real detail and then adds a judgement about it — joined by a dash, a comma, "and", "because", "so", "aur", "kyunki", "isliye", "matlab" — the judgement is ITS OWN CLAIM. Report both. "It is made at <temperature>, because no shortcuts are taken on quality" is two claims: the temperature, and that no shortcuts are taken. The true half does NOT vouch for the other half, and a sentence that opens with a fact is where an unsupported claim is most likely to be hiding.
11a. A CLAIM THAT CARRIES A FIGURE CARRIES NOTHING ELSE, AND THIS IS THE MOST IMPORTANT SPLIT OF ALL. A figure is settled by arithmetic - the figure is compared with the recorded one and the sentence is never read for meaning - so anything ELSE asserted alongside the figure is never examined by anybody unless you report it as its own claim. "Delivery costs Rs 50 anywhere in the city" is TWO claims: the rate, and where the business delivers. "Free shipping on all orders" is two: that shipping is free, and that it applies to every order. "Rs 999 and it burns for 40 hours" is two. Report the figure as its own claim with the figure in it, and every condition, area, guarantee or qualifier beside it as a separate claim with NO figure, so that it reaches the part of the system that can weigh it.
12. A MODIFIER CAN BE A WHOLE CLAIM WITH NO CLAUSE OF ITS OWN. Words like pure, genuine, authentic, finest, premium, real, proper, true, complete, perfect, 100%, asli, shudh, ekdum — attached to a thing the records do name — assert something the records may not. "Pure <product>" is two claims: that it is that product, and that it is pure. Report the modifier separately, every time, even when it is a single word inside a longer phrase.
13. A LINK BETWEEN TWO FACTS IS A THIRD CLAIM. When a sentence says one thing causes, explains, proves or results in another — "so", "which is why", "that is how", "because of this", "isliye", "iska matlab", "usse" — report the LINK as its own claim, on top of the two facts. "It is made at <temperature>, so the scent lasts longer" is three claims: the temperature, the scent lasting longer, and that the first produces the second. Two true facts side by side do not make the connection between them true.
14. A VAGUE PROMISE IS STILL THE PROMISE. "Just come once, we'll take care of the rest", "leave it to us", "baaki hum sambhal lete hain" name nothing and commit to everything: report them as the capability claim they stand for. Never skip a sentence because another sentence nearby says the same thing more plainly — each sentence may be sent, posted or read on its own, and a sentence you pass over is a sentence nobody checks.
15. You have no records. Never say whether a claim is supported.`;

/** Numbered, so a claim can point back at the sentence it came from. */
export function numberSentences(sentences: string[]): string {
  return sentences.map((s, i) => `[${i}] ${s}`).join("\n");
}

export type ExtractResult =
  | { ok: true; claims: ExtractedClaim[]; costInr: number }
  | { ok: false; reason: string; costInr: number };

/**
 * The claims a piece of copy makes, in English, whatever language it is in.
 *
 * FAILS CLOSED. A model failure returns ok: false, and the caller must
 * treat that as "not verified" rather than "nothing found" — an empty
 * claim list and a failed call look identical from the outside and mean
 * opposite things.
 */
export async function extractClaims(
  sentences: string[],
  opts: { logContext?: { supabase: any; dealershipId: string } | null; model?: string } = {}
): Promise<ExtractResult> {
  const clean = sentences.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (!clean.length) return { ok: true, claims: [], costInr: 0 };

  const result = await callClaude(
    {
      // Haiku by default: this is enumeration, not judgement. The
      // founder's gate decides whether it is good enough at Hinglish,
      // and the model is an argument so the gate can price the
      // alternative.
      model: opts.model ?? CLAUDE_MODELS.fast,
      // TEMPERATURE 0, AND LEAVING IT UNSET WAS A REAL BUG.
      //
      // Found in gate run 3 of 2026-10-16. "There is a long-standing
      // assumption that ghee leads to weight gain — but that idea
      // deserves a closer look" was enumerated as a hedged claim in two
      // runs and missed in the third — same sentence, same prompt, three
      // draws, two hits. The default temperature of 1.0 was sampling.
      //
      // This step ENUMERATES; it does not compose. Variation here is not
      // flair, it is a claim that gets checked on Monday and shipped on
      // Tuesday, and no gate can certify a stochastic reader on one
      // draw.
      temperature: 0,
      max_tokens: 2000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: `Sentences:\n${numberSentences(clean)}` }],
    },
    { operation: "claim_extraction", logContext: opts.logContext ?? null, attempts: 2, timeoutMs: 60_000 }
  );

  if (!result.ok) return { ok: false, reason: result.failure.message, costInr: 0 };

  const block = (result.data?.content ?? []).find((c: any) => c?.type === "tool_use" && c?.name === TOOL.name);
  if (!block) return { ok: false, reason: "the model did not use the tool", costInr: result.costInr };

  const raw = Array.isArray(block.input?.claims) ? block.input.claims : null;
  if (!raw) return { ok: false, reason: "the tool call carried no claims array", costInr: result.costInr };

  return {
    ok: true,
    claims: raw.map((c: unknown) => normalise(c)).filter((c: ExtractedClaim | null): c is ExtractedClaim => c !== null),
    costInr: result.costInr,
  };
}

/**
 * One claim, or null.
 *
 * A model-supplied claimType outside the enum is DROPPED rather than
 * coerced: a claim typed "healthy" that silently became "material"
 * would be judged by the wrong rule, and a dropped claim at least shows
 * up as a gap in the recall measurement.
 */
/**
 * A unit, or the empty string when there is none.
 *
 * DEFENSIVE AND DELIBERATE. The schema now lets the model omit the
 * unit, and the prompt tells it to — but a placeholder is what a model
 * reaches for when a field looks obligatory, and an unrecognised unit
 * string is read downstream as a unit that CONTRADICTS the record.
 * sameUnit already treats an absent unit as no mismatch; this makes
 * every way of saying "absent" arrive as absent.
 */
export function placeholderFree(unit: unknown): string {
  const raw = String(unit ?? "").trim();
  const bare = raw.replace(/^[<([{]+|[>)\]}]+$/g, "").trim().toLowerCase();
  const PLACEHOLDERS = new Set(["unknown", "unspecified", "none", "null", "n/a", "na", "nil", "no unit", "undefined", "-", "—", "?"]);
  return PLACEHOLDERS.has(bare) ? "" : raw;
}

function normalise(c: any): ExtractedClaim | null {
  const canonical = String(c?.canonical ?? "").trim();
  if (!canonical) return null;
  const claimType = CLAIM_TYPES.find((t) => t === c?.claimType);
  if (!claimType) return null;
  const subject = (["own_product", "own_business", "competitor", "customer"] as const).find((s) => s === c?.subject);
  if (!subject) return null;
  const polarity = (["assert", "deny", "hedge"] as const).find((p) => p === c?.polarity) ?? "assert";
  const index = Number(c?.sentenceIndex);
  const value =
    c?.value && Number.isFinite(Number(c.value.number))
      ? { number: Number(c.value.number), unit: placeholderFree(c.value.unit) }
      : null;
  return {
    sentenceIndex: Number.isInteger(index) && index >= 0 ? index : 0,
    canonical,
    claimType,
    subject,
    polarity,
    value,
    comparedWith: c?.comparedWith ? String(c.comparedWith).trim() : null,
    aboutProduct: c?.aboutProduct ? String(c.aboutProduct).trim() : null,
  };
}

/** True when nothing on record could ever license this claim. */
export function needsNoRecord(claim: ExtractedClaim): boolean {
  return UNLICENSABLE_TYPES.includes(claim.claimType) || claim.subject === "competitor";
}

// ─────────────────────────────────────────────────────────────────────
// A SECOND NET, ON THE FOUR CLASSES WHERE A MISS CANNOT BE RECOVERED.
//
// THE PROBLEM, measured rather than guessed. salon-04's sentence
// "Rs 3500 mein apke baal soft aur shiny ho jayenge" survived runs 6,
// 7, 8 and 10. Sent on its own, or in a batch of specimens, the
// extractor reports it as `benefit` and the verifier refuses it
// outright — the rule is right and the gate proves it for a rupee. In a
// real five-sentence message among a price, a location and a call to
// action, the same call with the same prompt at temperature 0 simply
// does not mention it. That is a RECALL failure on a long instruction,
// not a reasoning failure.
//
// WHY A RETRY CANNOT FIX IT. Temperature is 0, so asking the same model
// the same question again returns the same answer. A union of two
// identical calls is two bills and one answer.
//
// WHY NOT JUST USE SONNET. It would work — the gate measured Sonnet
// reporting the claim twice where Haiku reported it once — and it
// raises the cost of every piece the product writes by roughly half,
// to fix a miss in four claim classes out of fourteen.
//
// SO: ONE SHORT QUESTION INSTEAD OF A LONGER ANSWER. These four classes
// are the ones where a miss is unrecoverable, because NO record can
// ever license them: a missed price is caught by arithmetic against the
// record, a missed material goes to the judge, but a missed benefit is
// simply published. This pass asks about nothing else, in about thirty
// lines instead of two hundred, and its output is unioned with the main
// extraction.
//
// It is a net under the four classes, not a replacement for the
// extractor. If it and the main pass disagree, both claims stand: the
// verifier refuses either one, which is the safe direction.

const UNLICENSABLE_TOOL = {
  name: "report_unlicensable",
  description: "Report every sentence that promises something to the reader, claims safety, promises the business will act by itself, or compares with anyone else.",
  input_schema: {
    type: "object",
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sentenceIndex: { type: "number", description: "Which sentence, counting from 0." },
            claimType: { type: "string", enum: ["benefit", "safety", "capability", "comparison"] },
            canonical: { type: "string", description: "The claim in plain English, one sentence." },
          },
          required: ["sentenceIndex", "claimType", "canonical"],
        },
      },
    },
    required: ["claims"],
  },
} as const;

const UNLICENSABLE_SYSTEM = `You are given the sentences of one marketing message. Find every sentence that makes one of FOUR kinds of claim, and nothing else. Ignore prices, products, materials, methods, offers, delivery, opening hours and everything else — they are someone else's job.

1. "benefit" — IT PROMISES SOMETHING TO THE READER. The test is the subject of the change: after this sentence, what is different, and does it belong to the READER or to the seller? "your <thing> will be <quality>", "get <quality> <thing>", "<quality> <thing> in one visit", "you will feel", "you will notice", and the same thing with no verb at all — "<price> mein <quality> <thing>". In Hinglish the promise is usually the last word: "ho jayenge", "ban jayenge", "lagega", "mehsoos hoga", "pa jaao", "paao". A state of the THING is not this: "it is fresh", "it burns for 40 hours", "it is hand-poured" are about the product, not about the reader. AND NEITHER IS WHAT THE BUSINESS WILL GIVE OR CHARGE: "you will get 10% off", "aapko 10% off milega", "you pay Rs 50 for delivery", "your first order is discounted" are an OFFER or a PRICE, which a record can support, and reporting them here deletes a true line about the owner's own discount. The test is whether the READER or THEIR BELONGINGS end up in a different state - not whether the sentence has the word "you" in it.

2. "safety" — IT SAYS SOMETHING IS SAFE, gentle, non-toxic, or suitable for babies, children, pregnancy or sensitive skin. Saying what is or is not IN something is not this.

3. "capability" — IT SAYS THE BUSINESS WILL ACT BY ITSELF, unasked, on the reader's behalf: remind, rebook, renew, follow up, deliver automatically, keep track. Selling a service is NOT this — "we offer <service>", "we do <service>", "<service> available" only say what is for sale. Being willing or available is not this either: "ask us anything", "we are here", "poochh lo".

4. "comparison" — IT MEASURES THE BUSINESS AGAINST ANYONE ELSE: better than, unlike, cheaper than, the best in <place>, longer-lasting than.

Report each one with the sentence's index. If a sentence makes none of these four, say nothing about it. An empty list is a perfectly good answer.`;

/**
 * The four unlicensable classes, asked about on their own.
 *
 * Returns claims in the same shape as the main extraction, so the two
 * can be unioned. `subject` and `polarity` are filled in with the only
 * values that matter here — these claims are refused whatever they say.
 */
export async function extractUnlicensable(
  sentences: string[],
  opts: { logContext?: { supabase: any; dealershipId: string } | null; model?: string } = {}
): Promise<ExtractResult> {
  const clean = sentences.map((s) => String(s ?? "").trim());
  if (!clean.some(Boolean)) return { ok: true, claims: [], costInr: 0 };

  const result = await callClaude(
    {
      model: opts.model ?? CLAUDE_MODELS.fast,
      temperature: 0,
      max_tokens: 1000,
      system: UNLICENSABLE_SYSTEM,
      tools: [UNLICENSABLE_TOOL],
      tool_choice: { type: "tool", name: UNLICENSABLE_TOOL.name },
      messages: [{ role: "user", content: clean.map((s, i) => `[${i}] ${s}`).join("\n") }],
    },
    { operation: "claim_extraction", logContext: opts.logContext ?? null, attempts: 2, timeoutMs: 60_000 }
  );

  if (!result.ok) return { ok: false, reason: result.failure.message, costInr: 0 };
  const block = (result.data?.content ?? []).find((c: any) => c?.type === "tool_use" && c?.name === UNLICENSABLE_TOOL.name);
  if (!block) return { ok: false, reason: "the model did not use the tool", costInr: result.costInr };

  const claims: ExtractedClaim[] = (Array.isArray(block.input?.claims) ? block.input.claims : [])
    .map((c: any): ExtractedClaim | null => {
      const claimType = (["benefit", "safety", "capability", "comparison"] as ClaimType[]).find((t) => t === c?.claimType);
      const index = Number(c?.sentenceIndex);
      if (!claimType || !Number.isInteger(index) || index < 0 || index >= clean.length) return null;
      return {
        sentenceIndex: index,
        canonical: String(c?.canonical ?? "").trim() || `a ${claimType} claim`,
        claimType,
        subject: claimType === "comparison" ? "competitor" : "own_product",
        polarity: "assert",
      };
    })
    .filter((c: ExtractedClaim | null): c is ExtractedClaim => c !== null);

  return { ok: true, claims, costInr: result.costInr };
}
