// A starting sequence for someone who showed strong interest — V5b.
//
// The trigger exists; this is the shape of what follows it, so the
// owner is not handed an empty builder and asked to invent a drip
// campaign. Every step is EDITABLE before anything is created: the
// button fills the draft, the owner changes what they like, and the
// workflow is still created disabled, as every workflow is.
//
// ─────────────────────────────────────────────────────────────────────
// NOTHING HERE WRITES THE EMAIL, AND THAT IS THE WHOLE POINT
// ─────────────────────────────────────────────────────────────────────
//
// Each step names an EXISTING email task (lib/departments/email), which
// the engine generates from `gatherBusinessFactsSafely` and checks
// against the claims layer. So:
//
//   • no invented case study, testimonial, number or deadline — the
//     founder's "a Day-5 case study needs a case study" is enforced
//     where it was already enforced, rather than by a rule written
//     again here;
//   • `promotional` already says it: feature an active offer exactly as
//     listed, and with none, promote the product itself and never
//     invent a discount;
//   • `sales_sequence` already says trust is "built only from real
//     facts — never invented testimonials or numbers".
//
// Writing custom_subject and custom_body here instead would be MY words
// shipped as the owner's, fixed at template time, fact-checked by
// nothing. A blank the owner fills in is better than a sentence that
// was never true.
//
// RULE 3. No trade, product, category or industry word appears. The
// three steps are a shape — acknowledge, show what is actually there,
// give an easy out — that reads the same for a bakery, a workshop or a
// consultancy.

/** One step, in the shape the workflow builder's draft uses. */
export type SequenceStep = {
  delayDays: number;
  actionType: "send_email";
  emailTaskType: string;
  customSubject: string;
  customBody: string;
  contentType: string;
  contentTopic: string;
};

/** What the suggested workflow is called before the owner renames it. */
export const DEFAULT_INTENT_SEQUENCE_NAME = "After someone shows strong interest";

/**
 * Three emails over five days, and deliberately not four.
 *
 * WHY IT STOPS. The existing auto follow-up in this product is "capped
 * at one auto follow-up to avoid spamming a lead who simply hasn't
 * responded", and that reasoning does not disappear because the trigger
 * is better. Somebody who ignored three emails is answering; a fourth
 * is the popup the founder rejected, in an inbox. The last step gives
 * an explicit easy out, which is the task's own instruction.
 *
 * THE DAYS COUNT FROM THE VISIT, not from the lead — see
 * visitorIntentTrigger. Day 0 therefore means the same day they were
 * looking, which is when a shopkeeper would have said something.
 */
export const DEFAULT_INTENT_SEQUENCE: SequenceStep[] = [
  {
    // "Showed interest but didn't convert — gentle nudge, addresses
    // likely hesitation, soft call to action." Which is exactly what
    // the trigger just measured.
    delayDays: 0,
    actionType: "send_email",
    emailTaskType: "abandoned_cart",
    customSubject: "",
    customBody: "",
    contentType: "",
    contentTopic: "",
  },
  {
    // What is actually available. The facts decide whether that is a
    // real running offer or the product on its own merits — this step
    // cannot invent one either way.
    delayDays: 2,
    actionType: "send_email",
    emailTaskType: "promotional",
    customSubject: "",
    customBody: "",
    contentType: "",
    contentTopic: "",
  },
  {
    // "Low-pressure, easy to reply to, gives an easy out." The last
    // thing a business should send somebody who has not answered.
    delayDays: 5,
    actionType: "send_email",
    emailTaskType: "follow_up",
    customSubject: "",
    customBody: "",
    contentType: "",
    contentTopic: "",
  },
];

/** A fresh copy, so editing the draft cannot mutate the template. */
export function defaultIntentSequence(): SequenceStep[] {
  return DEFAULT_INTENT_SEQUENCE.map((step) => ({ ...step }));
}
