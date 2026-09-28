// The email marketing tasks, as plain data.
//
// This lives apart from the agent that runs them because the picker UI is
// a client component: importing the agent for this one constant pulled the
// whole server module graph — Claude client, usage logging, the
// service-role Supabase client — into browser JavaScript. See
// tests/clientBundleBoundary.test.ts.
//
// Nothing here may import anything. That is the point.

export interface EmailTaskMeta {
  key: string;
  label: string;
  instructions: string;
}

/** The output shape every task that produces one visual email asks for. */
const VISUAL = `Return {subject, previewText, headline (under 60 characters), intro (1–2 short sentences), bullets (0–3 short points, only if they help), ctaLabel (2–4 words for the button — for a service, a booking action such as "Book a consultation"; never "Shop" or "Buy" for a service), product (the exact name of the product or service it features from the facts, or ""), body (the same message as plain text, under 120 words)}. Never put a link or web address in any field — Hawlai adds the button link.`;

export const EMAIL_TASKS: EmailTaskMeta[] = [
  { key: "welcome_email", label: "Welcome Email", instructions: `A welcome email for a new lead/customer — warm, sets expectations for what happens next, no hard sell. ${VISUAL}` },
  { key: "abandoned_cart", label: "Abandoned Cart", instructions: `An abandoned-cart/inquiry follow-up email for someone who showed interest but didn't convert — gentle nudge, addresses likely hesitation, soft call to action to continue. ${VISUAL}` },
  { key: "promotional", label: "Promotional Email", instructions: `A promotional email for an offer or product — if the facts list an active offer, feature it exactly as listed (code and terms); if not, promote the product itself and never invent a discount. Strong call to action. ${VISUAL}` },
  { key: "newsletter", label: "Newsletter", instructions: "A newsletter email: return {subject, previewText, headline (under 60 characters), sections: [{heading, body}], ctaLabel (2–4 words), product (a product name from the facts it spotlights, or \"\"), body (the whole newsletter as plain text)} — 3 short sections (e.g. update, tip, spotlight), each body 1–2 sentences, casual and value-first, not salesy. Never put a link or web address in any field." },
  { key: "sales_sequence", label: "Sales Sequence", instructions: "A 3-email sales sequence for nurturing a warm lead toward a decision: return {emails: [{step, subject, body}]} — each email should have a distinct angle (value, trust built only from real facts — never invented testimonials or numbers — and a clear next step) and escalate naturally." },
  { key: "follow_up", label: "Follow-up Email", instructions: `A follow-up email for a lead who went quiet after initial contact — low-pressure, easy to reply to, gives an easy out ('let me know if now isn't the right time'). ${VISUAL}` },
  { key: "personalization", label: "Personalization Tips", instructions: "5 practical personalization tactics for making emails feel individually written rather than mass-blasted, specific to this business type: return {tips: [{tactic, howTo}]}." },
];
