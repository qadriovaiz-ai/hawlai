// Where the visitor is standing, told to the agent — V4b.
//
// The sales agent is on every page of the storefront now (V4a) and has
// no idea which one. Somebody reading a product page and asking "is this
// available?" is asking about THAT product; an agent that has to ask
// which one is worse than a shop assistant who can see what you are
// holding.
//
// THE PAGE KIND IS V3'S, NOT A SECOND COPY. `pageKind` already answers
// "what kind of page is this path" from this application's own route
// table plus the business's own `website_pages.page_type` declarations
// — no trade vocabulary, rule 3 — and it is already tested. A second
// classifier here would be the duplicate-definition mistake this
// codebase has paid for every time.
//
// ─────────────────────────────────────────────────────────────────────
// THE PATH ARRIVES FROM THE BROWSER, SO IT IS A CLAIM, NOT A FACT
// ─────────────────────────────────────────────────────────────────────
//
// Anyone can post any path to a public route. Two rules follow, and
// both are about what the agent is allowed to believe:
//
//   A PRODUCT IS RESOLVED FROM THE BUSINESS'S OWN CATALOGUE, BY ID,
//   never from the path. `/site/x/products/99` tells us an id was in a
//   URL; whether this business sells 99 is a question only the facts
//   answer. An id that matches nothing yields "a product page, but
//   which product is not known" — which stops the model naming one.
//
//   NOTHING FROM THE PATH IS EVER REPEATED BACK. The lines below are
//   built from the kind and from catalogue rows, so a crafted path
//   cannot put words in the agent's mouth. The visitor's own message is
//   the only visitor-supplied text the model sees, and the claims guard
//   reads its reply afterwards either way.
//
// AND KNOWING THE PAGE IS NOT KNOWING THE PERSON. Being on the cart
// page is not having something in the cart; being on checkout is not
// buying. The sentences below say where the visitor is, never what they
// have done — the distinction the whole claims layer exists to keep.

import { pageKind, type PageKind } from "@/lib/growth/intent";
import type { BusinessFacts, CatalogProduct } from "@/lib/claims/businessFacts";

export type VisitorPage = {
  kind: PageKind;
  /** One sentence for the prompt. Never contains anything the visitor sent. */
  line: string;
  /** Only ever a row from this business's own catalogue. */
  product: CatalogProduct | null;
};

/** Kinds worth telling the agent about. `unknown` and `custom` say nothing useful. */
const DESCRIBED: Partial<Record<PageKind, string>> = {
  home: "the home page",
  about: "the about page",
  services: "the services page",
  products: "the catalogue page",
  team: "the team page",
  contact: "the contact page",
  faq: "the FAQ page",
  cart: "the cart page",
  checkout: "the checkout page",
  landing: "a landing page",
};

function productById(facts: BusinessFacts | null | undefined, id: string): CatalogProduct | null {
  for (const p of facts?.products ?? []) {
    if (p.id !== null && String(p.id) === id) return p;
  }
  return null;
}

/** The last path segment, which is where a product id sits. */
function lastSegment(path: string): string {
  const parts = path.split("?")[0].split("#")[0].split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/**
 * What to tell the agent about where the visitor is.
 *
 * Null when there is nothing honest to say — an unidentifiable path, or
 * a page kind that adds nothing. Null is a normal answer, not a failure:
 * the agent simply carries on without it, exactly as it did before V4b.
 */
export function describeVisitorPage(
  path: string | null | undefined,
  declared: Record<string, string> | null | undefined,
  facts: BusinessFacts | null | undefined
): VisitorPage | null {
  const raw = String(path ?? "").trim();
  if (!raw) return null;

  const kind = pageKind(raw, declared);

  if (kind === "product_detail") {
    const product = productById(facts, lastSegment(raw));
    if (!product) {
      // AN ID WE DO NOT SELL. Say where they are and say the product is
      // unknown, rather than letting the model fill the gap.
      return {
        kind,
        line: "The visitor is on a product page, but which product could not be identified from your records — ask them which one rather than guessing.",
        product: null,
      };
    }
    return {
      kind,
      line: `The visitor is looking at "${product.name}" right now — answer about that one unless they ask about something else.`,
      product,
    };
  }

  const where = DESCRIBED[kind];
  if (!where) return null;

  // WHERE THEY ARE, NOT WHAT THEY HAVE DONE. "On the checkout page" is
  // a fact; "is buying" is a claim about a stranger.
  return { kind, line: `The visitor is on ${where} of your website.`, product: null };
}

/**
 * The instruction that makes the agent bring up a genuine running offer.
 *
 * WHY A SALESMAN OPENS WITH IT. The founder's words: a real shopkeeper
 * says "ye offer chal raha hai" without waiting to be asked. Until now
 * the agent only answered.
 *
 * THIS INVENTS NOTHING, AND THAT IS STRUCTURAL RATHER THAN HOPEFUL.
 * `facts.offers` is built from `discount_codes` where `is_active`, each
 * row passed through `discountUsable`, which refuses an inactive code,
 * an EXPIRED one, and one that has hit its usage limit. With no usable
 * offer this returns the empty string and the facts block's own
 * sentence stands — "Active offers: none — do not write any discount,
 * sale or offer" — and `stripUnsupported` in publish mode deletes a
 * discount no record supports before a visitor ever sees it.
 *
 * ONCE, NOT EVERY TURN. A shopkeeper who mentions the deal is useful;
 * one who says it in all four replies is the popup the founder
 * rejected.
 */
export function offerOpeningRule(facts: BusinessFacts | null | undefined): string {
  if (!facts?.offers?.length) return "";
  return [
    "",
    "OFFERS — bring them up, don't wait to be asked:",
    "- There is a real offer running (it is in the verified facts above). Mention it naturally, early, and in your own words — the way a shopkeeper would.",
    "- Say it ONCE. If an offer already appears in the conversation above, do not repeat it; carry on with what they asked.",
    "- State only what the facts say about it. Never add urgency, scarcity or a deadline that is not recorded — no \"selling fast\", \"last chance\" or \"only a few left\".",
    "- If what they are asking about has nothing to do with the offer, answer their question first.",
  ].join("\n");
}
