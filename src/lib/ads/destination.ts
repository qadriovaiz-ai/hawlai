// Where the ad sends people, and therefore what kind of campaign it is.
//
// THESE TWO ARE ONE DECISION, which is why they are resolved together.
// The engine hardcoded objective: "OUTCOME_LEADS" with
// optimization_goal: "LEAD_GENERATION" — correct for the car-dealership
// enquiry ads it was built for, and wrong the moment an ad points at a
// product page. A lead-gen campaign aimed at a storefront either gets
// refused by Meta or optimises for the wrong event and quietly
// underperforms. "Technically launched" is not the same as "working".
//
// THE THIRD SILENT WRONG-THING-SENT-TO-META THIS SESSION, after the
// hardcoded rupee symbol and the null destination link. The shared
// shape is a value that was correct for the original use case, frozen
// as a literal, and then carried unexamined into a new one. Hence a
// pure module with the choice written down, rather than another
// literal further downstream.

export type DestinationKind = "shopify_product" | "external_website" | "landing_page" | "instant_form";

export type ResolvedDestination = {
  kind: DestinationKind;
  /** Null ONLY for instant_form, where the ad stays inside Facebook. */
  url: string | null;
  leadFormId: string | null;
  objective: "OUTCOME_TRAFFIC" | "OUTCOME_LEADS";
  optimizationGoal: "LINK_CLICKS" | "LEAD_GENERATION";
  /** Only set where Meta requires it — LEAD_GENERATION does. */
  promotedObject: { page_id: string } | null;
  /** Shown on the approval card. Says where, in the merchant's terms. */
  label: string;
  /** Shown on the approval card. Says what the campaign is optimising for. */
  objectiveLabel: string;
};

export type DestinationInput = {
  /** The resolved product's public storefront URL, when it has one. */
  productUrl?: string | null;
  /** How to name that product on the card. */
  productLabel?: string | null;
  externalWebsiteUrl?: string | null;
  landingPageUrl?: string | null;
  leadFormId?: string | null;
  pageId?: string | null;
};

/**
 * WHY OUTCOME_TRAFFIC RATHER THAN OUTCOME_SALES for a product page.
 *
 * OUTCOME_SALES optimises for purchase events, which requires a pixel
 * with real conversion history. Without that, Meta has nothing to
 * optimise against: the campaign either fails validation or spends the
 * budget learning from an event that never fires. A first campaign
 * from a shop that has not been advertising is exactly that case.
 *
 * OUTCOME_TRAFFIC with LINK_CLICKS is accepted regardless of pixel
 * state and optimises for the thing that is actually measurable on day
 * one — getting people onto the product page. It is the honest choice
 * for a first ad, and OUTCOME_SALES becomes the right upgrade once the
 * pixel has purchase data behind it.
 */
const WEBSITE_OBJECTIVE = {
  objective: "OUTCOME_TRAFFIC",
  optimizationGoal: "LINK_CLICKS",
  objectiveLabel: "Getting people to the page (traffic)",
} as const;

const FORM_OBJECTIVE = {
  objective: "OUTCOME_LEADS",
  optimizationGoal: "LEAD_GENERATION",
  objectiveLabel: "Collecting enquiries (leads)",
} as const;

/**
 * A URL an ad can actually point at. Rejects blanks and non-http
 * schemes.
 *
 * Exported so the place a merchant SETS their website URL validates it
 * the same way the ad path READS it. Two definitions of "usable" is how
 * a value gets accepted at the settings step and silently dropped at
 * the launch step, leaving an ad with nowhere to go and no explanation.
 *
 * A bare domain ("candlesbyqaaf.com") is what people actually type, so
 * it is upgraded to https rather than rejected.
 */
export function normalizeAdUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
  return usableUrl(withScheme);
}

function usableUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Pick the destination, in priority order, and the objective that goes
 * with it.
 *
 * NEVER returns a null url for a website destination. The previous
 * version passed `destinationUrl: null` with a `!` assertion at the
 * call site, which sent `link: null` to Meta and failed at the fourth
 * of seven Graph calls. A refusal here is a sentence the merchant can
 * act on; that was an error message naming neither cause nor fix.
 */
export function resolveAdDestination(input: DestinationInput): { ok: true; destination: ResolvedDestination } | { ok: false; reason: string } {
  const product = usableUrl(input.productUrl);
  if (product) {
    return {
      ok: true,
      destination: {
        kind: "shopify_product",
        url: product,
        leadFormId: null,
        promotedObject: null,
        label: input.productLabel ? `Your "${input.productLabel}" product page` : "Your product page",
        ...WEBSITE_OBJECTIVE,
      },
    };
  }

  const site = usableUrl(input.externalWebsiteUrl);
  if (site) {
    return {
      ok: true,
      destination: {
        kind: "external_website",
        url: site,
        leadFormId: null,
        promotedObject: null,
        label: "Your website",
        ...WEBSITE_OBJECTIVE,
      },
    };
  }

  const landing = usableUrl(input.landingPageUrl);
  if (landing) {
    return {
      ok: true,
      destination: {
        kind: "landing_page",
        url: landing,
        leadFormId: null,
        promotedObject: null,
        label: "Your Hawlai landing page",
        ...WEBSITE_OBJECTIVE,
      },
    };
  }

  // Last resort, and a genuinely different KIND of ad: the viewer never
  // leaves Facebook and never reaches anything they can buy. Right for
  // an enquiry, wrong for a sale — so it is last, not first.
  if (input.leadFormId && input.pageId) {
    return {
      ok: true,
      destination: {
        kind: "instant_form",
        url: null,
        leadFormId: input.leadFormId,
        promotedObject: { page_id: input.pageId },
        label: "A Facebook lead form (people don't leave Facebook)",
        ...FORM_OBJECTIVE,
      },
    };
  }

  return {
    ok: false,
    reason:
      "This ad has nowhere to send people. Publish the product to your online store, add your website address in Settings, publish a landing page, or connect a Facebook lead form — then I can run it.",
  };
}

/**
 * Tag a destination so the visit is attributable.
 *
 * Left alone when the merchant's own URL is already tagged: overriding
 * a link someone deliberately set up is worse than not tagging.
 */
export function withCampaignTag(url: string, draftId: string): string {
  if (url.includes("utm_source=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}utm_source=facebook&utm_medium=paid_social&utm_campaign=${draftId}`;
}
