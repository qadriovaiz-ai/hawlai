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

export type PlatformId = "shopify" | "wordpress" | "woocommerce";

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
  | "create_discount_code"
  | "publish_post"
  | "update_post";

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
];

/** Risk classification, for the approval UI and the audit trail. */
export const ACTION_RISK: Record<ActionKey, RiskLevel> = {
  update_product_price: "critical",
  create_discount_code: "high",
  update_product_description: "medium",
  publish_post: "high",
  update_post: "medium",
};
