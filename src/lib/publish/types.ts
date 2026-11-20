// The shared publish-action contract. Platform-agnostic by design.
//
// FOR REVIEW. No platform implements this yet.
//
// Shopify writes and WordPress publishing are the same problem with
// two API clients behind it: propose a change, show a human exactly
// what it will do, take a decision, then execute somewhere specific.
// Everything above execute() is shared; only execute() and preview()
// know which platform they are talking to.

import type { RiskLevel } from "@/lib/executionPolicy";

export type PlatformId = "shopify" | "wordpress" | "woocommerce" | "meta" | "hawlai_shop" | "hawlai_site";

/**
 * What a platform can be asked to do.
 *
 * NOT A UNIVERSAL SET, and that is the point. The instinct is to
 * define one vocabulary every platform implements, but the platforms
 * genuinely differ: Shopify has products, prices and discount codes;
 * WordPress has posts, pages and media and NO native promo-code
 * concept at all — coupons there belong to WooCommerce, a separate
 * plugin with its own API, present only if the site runs it.
 *
 * Modelling a universal "create discount" would produce a tool the
 * assistant offers on sites that cannot do it, and a failure the
 * merchant experiences as the product lying to them. Each platform
 * declares what it supports; the tool layer reads that.
 */
export type ActionKey =
  | "update_product_price"
  | "update_product_description"
  /** Rename a product in the merchant's own storefront — what customers see. */
  | "update_product_name"
  | "create_discount_code"
  | "publish_post"
  | "update_post"
  /**
   * Create a Meta campaign, ad set and ad — all PAUSED.
   *
   * Approving this spends nothing. Meta bills on the ad's effective
   * status and every object is created paused, so the money decision
   * is the SEPARATE activation step. It is still approval-gated:
   * creating real ad objects in a merchant's account under their
   * brand is not something an assistant should do unasked, and the
   * creative and audience are exactly what a human needs to check.
   */
  | "launch_ad_campaign"
  /**
   * Turn a paused campaign ON — campaign, ad set and ad — and verify
   * Meta will actually deliver it. THE money step: nothing spends until
   * this runs, so it is always approval-gated and critical.
   */
  | "activate_ad_campaign"
  /**
   * Set the <title> and meta description of one page on the business's
   * own site — the two lines a stranger reads in a search result.
   *
   * Approval-gated because it is public-facing copy about the business,
   * written from a chat message. Title and description travel on ONE
   * card rather than two, unlike the product fields: they are read
   * together in a search result and an owner approving one without
   * seeing the other is approving half a sentence.
   */
  | "update_page_meta"
  /**
   * Change the words IN one page of the business's own site — a heading,
   * a paragraph, a button label — addressed by block id.
   *
   * Separate from update_page_meta on purpose, and the separation is a
   * safety property rather than tidiness: the meta action owns seo_title
   * and meta_description, the two lines Google reads, and this one must
   * never touch them. One action key that could write either would make
   * "chat changed my search title" and "chat changed my homepage" the
   * same audit record.
   *
   * Approval-gated because there is no draft layer inside a published
   * site: website_pages IS what /site/{slug} renders, so an approved
   * edit is public the moment it saves.
   */
  | "update_page_text"
  /**
   * Change the words on a COLLECTION page of the merchant's store — the
   * paragraph a customer reads above a group of products.
   *
   * A separate key from `update_page_text`, and the separation is not
   * tidiness. `update_page_text` addresses a block inside a page of the
   * business's OWN Hawlai site; this one writes to a live external
   * storefront. `update_page_meta` is on the L2 unattended-autonomy
   * allowlist and `growth/measures.ts` scores both page keys against
   * `page_events`, a table that holds no external-storefront data.
   * Riding a merchant's storefront in on either key would have widened
   * unattended autonomy onto a live shop and scored the result against
   * visits it cannot see.
   *
   * Deliberately NOT the collection's search title and description.
   * Those are a second decision about the same object, read in a search
   * result rather than on the page, and merging them into this key
   * would make "chat reworded my Diwali collection" and "chat changed
   * what Google shows for it" the same audit record. If they are wanted
   * they get their own key, as pages did.
   */
  | "update_collection_text"
  /**
   * Put a picture Hawlai made into the merchant's own Files library on
   * their store, so the store hosts it rather than this product.
   *
   * WHY THAT MATTERS AND IS NOT BOOKKEEPING: every image this product
   * generates lives at a public URL in its own storage bucket. An
   * image referenced from a merchant's live page by that URL is a page
   * that breaks if the bucket is ever moved, renamed or cleaned up —
   * their shop, our storage. Uploading it first gives a URL the
   * merchant's own store owns.
   *
   * CHANGES NOTHING A CUSTOMER SEES. A file in the Files library is
   * not on any page until something references it, which is why this
   * is the only publish action classified `low` and the only one
   * absent from ALWAYS_REQUIRES_APPROVAL. It still requires approval
   * in ACTION_POLICIES — writing to a merchant's store unasked is not
   * something to decide by default — but that is one field to relax if
   * it turns out to produce a second card for one decision, rather
   * than an entry on a list this codebase treats as settled.
   *
   * NO UNDO, and the same reason as publish_post: deleting a file is a
   * deletion, not a reverse, and by the time anyone asks, a page may
   * already point at it.
   */
  | "upload_image";

/**
 * One field changing, in terms a person can check.
 *
 * `before` is not decoration. It is the baseline execution
 * re-verifies against — see PublishPlatform.execute.
 */
export type FieldChange = {
  field: string;
  /** Current value as read from the platform at preview time. Null when creating. */
  before: string | null;
  after: string;
};

/**
 * What the human approves. Written to be read by someone who does not
 * know the API — "Price of 'Blue Kurta': ₹1,299 → ₹999", not a JSON
 * patch.
 */
export type PreviewDiff = {
  summary: string;
  /**
   * WHO is being changed, in the platform's own words.
   *
   * The approver is confirming a RESOLVED product, not the phrase that
   * was typed. "the blue kurta" became a specific variant id through a
   * search, and if that search picked wrongly the only place it can be
   * caught is here — so the preview carries the exact stored title,
   * the current price and an image, not the merchant's original words.
   *
   * Optional so a platform with nothing meaningful to identify can
   * omit it rather than fabricate one.
   */
  target?: {
    title: string;
    variantTitle: string | null;
    /** Already formatted in `currency` — never a bare number. */
    currentPrice: string | null;
    /**
     * ISO code of the STORE's currency, carried so nothing downstream
     * has to infer one. A live test showed a USD store's price as
     * rupees because the path emitted a bare number and the model
     * supplied a symbol from its own context.
     */
    currency?: string | null;
    /** "USD ($)" — said plainly, so every surface can lead with it. */
    currencyLabel?: string | null;
    imageUrl: string | null;
    /** How this target was arrived at — surfaced so the UI can say "you chose this". */
    resolutionPath?: string;
  };
  changes: FieldChange[];
  /**
   * Things true about this change that a reasonable person would want
   * flagged before saying yes — "23% reduction", "this product is in
   * 2 active ad campaigns", "this post is already live".
   *
   * Not errors. A warning never blocks; it informs the decision.
   */
  warnings: string[];
};

export type PublishActionRecord = {
  id: string;
  dealershipId: string;
  platform: PlatformId;
  connectionRef: string | null;
  actionKey: ActionKey;
  targetRef: string | null;
  targetLabel: string | null;
  requestedChanges: Record<string, unknown>;
  preview: PreviewDiff | null;
  previewedAt: string | null;
  status: PublishStatus;
  idempotencyKey: string;
  /** How targetRef was arrived at — carried into the preview for the approver. */
  resolutionPath?: string | null;
};

export type PublishStatus =
  | "draft"
  | "previewed"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "executed"
  | "failed"
  | "rejected"
  | "stale";

export type PreviewResult =
  | { ok: true; preview: PreviewDiff }
  | { ok: false; reason: string };

export type ExecuteResult =
  | { ok: true; platformResponse: unknown }
  /**
   * The platform moved between preview and execution. Distinct from a
   * failure: nothing is wrong, the human's decision is simply out of
   * date and must be re-taken against current reality.
   */
  | { ok: false; stale: true; changed: FieldChange[] }
  | { ok: false; stale?: false; reason: string };

/**
 * How to put one executed action back.
 *
 * A PROPOSAL, NOT A WRITE. Reversing a change is itself a change, so an
 * undo goes through the same door as the thing it reverses: it comes
 * back as the request for a new publish action, gets its own preview
 * and its own approval. The owner sees what will be put back before it
 * is.
 *
 * REPLAYED FROM THE RECORD, NEVER REGENERATED. The old wording lives on
 * the action that changed it, in `preview.changes[].before` — which is
 * why undo needs no history table and cannot drift from what was
 * actually on the page. PLAN-CORE-ARCHITECTURE sized S3 around building
 * that store; it already existed.
 */
export type UndoProposal =
  | {
      ok: true;
      actionKey: ActionKey;
      targetRef: string;
      targetLabel: string;
      requestedChanges: Record<string, unknown>;
      /**
       * What goes back, in the owner's terms, for the chat card.
       *
       * CARRIED ON THE PROPOSAL BECAUSE THE PLATFORM IS THE ONLY THING
       * THAT KNOWS IT. Dropping it in P1 broke the one existing test
       * of the undo card - chatPageEditing's "proposes the exact
       * previous wording, word for word" - which was right to fail: an
       * owner approving an undo is approving these lines, not a
       * summary of them.
       */
      changed: { what: string; from: string; to: string }[];
      /** Said to the owner before they approve. Never blocks. */
      warnings: string[];
    }
  | { ok: false; reason: string };

/**
 * What every platform module must provide, and the ONLY way a write
 * reaches an external system.
 *
 * A test asserts that no Shopify or WordPress write call exists
 * outside a module implementing this — the same shape as
 * selfAuthenticatingRoutes.test.ts, and for the same reason: a policy
 * that lives only in a convention gets bypassed by the next person in
 * a hurry, and every approval test can stay green while it happens.
 */
export interface PublishPlatform {
  readonly id: PlatformId;

  /** Which actions this platform can genuinely perform. See ActionKey. */
  readonly supports: readonly ActionKey[];

  /**
   * Which of those it can PUT BACK. A subset of `supports`.
   *
   * DECLARED, NOT INFERRED FROM THE PRESENCE OF `undo` — 20 November
   * 2026. `undoExistsFor` used to ask `typeof platform.undo ===
   * "function"`, which is a question about the platform standing in
   * for a question about the key. That was indistinguishable while a
   * platform either undid everything it did or nothing; Shopify now
   * undoes a page edit and not a price change, and the proxy started
   * answering "yes" for prices.
   *
   * Absent means nothing can be put back, which is the same reading
   * `canHoldL1` gives a missing undo.
   */
  readonly undoes?: readonly ActionKey[];

  /** Whether this business has a usable connection right now. */
  isConnected(dealershipId: string): Promise<boolean>;

  /**
   * Read CURRENT state and describe the change.
   *
   * Reads, never writes. The before-values captured here become the
   * contract execute() checks against.
   */
  preview(action: PublishActionRecord): Promise<PreviewResult>;

  /**
   * Apply the change — the only method permitted to write.
   *
   * MUST re-read current state and compare against
   * action.preview.changes[].before before applying anything. If the
   * platform has moved, return { stale: true } and apply NOTHING.
   *
   * Someone previews a price at 10am and approves at 3pm; if the price
   * changed at noon, executing the approved intent silently overwrites
   * a change nobody saw and nobody agreed to. The approval was for a
   * specific transition, not for a final value.
   *
   * MUST be idempotent on action.idempotencyKey. A network timeout on
   * a price change must not be able to apply it twice, and the caller
   * cannot tell from its own side whether the write landed.
   */
  execute(action: PublishActionRecord): Promise<ExecuteResult>;

  /**
   * Describe how to reverse an action this platform already executed.
   *
   * OPTIONAL, AND THE OPTIONALITY IS LOAD-BEARING. A platform that
   * cannot put its own change back must not pretend it can, and
   * `autonomyLevels.canHoldL1` refuses L1 to any action with no undo —
   * so leaving this off is a real statement with a real consequence,
   * not a gap. Shopify and Meta have none yet and say so by absence.
   *
   * Reads only. It returns the REQUEST for a reversing action; nothing
   * is written until that request is itself approved and executed.
   */
  undo?(action: PublishActionRecord): Promise<UndoProposal>;
}

/**
 * Publish actions that must ALWAYS be approved, whatever the amount.
 *
 * Separate from the rupee threshold in checkApprovalAuthority on
 * purpose. That threshold answers "is this expensive enough to
 * escalate?" — a sensible question about ad spend and a meaningless
 * one about a price change, which has no rupee amount of its own and
 * unbounded revenue consequence either way.
 *
 * A ₹10 price change on the best-selling product is not a small
 * action. Gating on amount would let exactly that through.
 */
export const ALWAYS_REQUIRES_APPROVAL: readonly ActionKey[] = [
  "update_product_price",
  "create_discount_code",
  "publish_post",
  "update_post",
  "update_product_description",
  "update_product_name",
  "launch_ad_campaign",
  "activate_ad_campaign",
  "update_page_meta",
  "update_page_text",
  "update_collection_text",
];

/** Risk classification, for the approval UI and the audit trail. */
export const ACTION_RISK: Record<ActionKey, RiskLevel> = {
  update_product_price: "critical",
  update_product_name: "medium",
  create_discount_code: "high",
  update_product_description: "medium",
  publish_post: "high",
  update_post: "medium",
  // Nothing spends on creation — but the objects are real, public and
  // in the merchant's own ad account, and activation is one click away.
  launch_ad_campaign: "high",
  // The one action that starts real spend.
  activate_ad_campaign: "critical",
  // Nothing spends, but it changes what every stranger who finds this
  // business in a search result reads first.
  update_page_meta: "medium",
  // Nothing spends, and it is reversible — but a published site has no
  // draft layer, so an approved edit is what every visitor reads from
  // the moment it saves.
  update_page_text: "medium",
  // Nothing spends, and the prior text is recorded so it is reversible
  // — but this is a live external storefront with no draft layer, so an
  // approved edit is what the merchant's customers read immediately.
  update_collection_text: "medium",
  // The only `low` in this table. Nothing is published, nothing
  // spends, and no customer can see the file until a separate action
  // references it. See the key's own comment for why it is still
  // approval-gated in ACTION_POLICIES.
  upload_image: "low",
};
