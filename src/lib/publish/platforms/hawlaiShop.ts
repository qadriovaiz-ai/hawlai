// The business's OWN storefront — the products table behind
// /site/{slug} — as a publish platform.
//
// WHY THIS EXISTS: chat would answer "you have 1 product: Lavender
// candle — ₹550" from this very table, and then propose_price_change,
// which only ever searched SHOPIFY, would report it could not find that
// product. Two different stores, and the one nearly every Hawlai
// business actually uses had no write path at all: the owner was told
// to go and edit it by hand.
//
// Same contract as the Shopify module, for the same reasons:
//   - preview() reads the CURRENT values, so the card shows what is
//     really there rather than what the chat phrase implied;
//   - execute() RE-READS before writing and refuses if the value moved
//     since the preview. An approval is for a transition ("₹550 becomes
//     ₹999"), not for a final number;
//   - already-at-target is checked BEFORE staleness, so a retry after a
//     timeout reports success instead of demanding re-approval.
//
// Scope is deliberately three fields. Stock is excluded because it
// changes on its own with every order, which would make the staleness
// check fire constantly; active/inactive is excluded because that is
// publish/unpublish, a different decision with a different risk.

import { formatMoney } from "../money";
import { publishLog, publishError } from "../log";
import type { ActionKey, ExecuteResult, FieldChange, PreviewResult, PublishActionRecord, PublishPlatform } from "../types";

/** The Hawlai storefront prices in rupees — there is no per-store currency setting. */
const CURRENCY = "INR";

const FIELD_BY_ACTION: Partial<Record<ActionKey, "price" | "name" | "description">> = {
  update_product_price: "price",
  update_product_name: "name",
  update_product_description: "description",
};

const COLUMN: Record<"price" | "name" | "description", string> = {
  price: "price",
  name: "name",
  description: "description",
};

type ProductRow = {
  id: string;
  name: string;
  price: number | string;
  description: string | null;
  images: unknown;
  is_active: boolean | null;
};

type ReadResult = { ok: true; product: ProductRow | null } | { ok: false; reason: string };

function samePrice(a: unknown, b: unknown): boolean {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.005;
}

function sameText(a: unknown, b: unknown): boolean {
  return String(a ?? "").trim() === String(b ?? "").trim();
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const found = images.find((i) => typeof i === "string" && i.trim());
  return typeof found === "string" ? found.trim() : null;
}

export function createHawlaiShopPlatform(deps: { supabase: any }): PublishPlatform {
  /**
   * What is BUILT here — the same rule the Shopify module states: a
   * declared capability is a promise the tool layer reads, so nothing
   * is listed until it works end to end.
   */
  const supports: readonly ActionKey[] = ["update_product_price", "update_product_name", "update_product_description"];

  async function readProduct(dealershipId: string, productId: string): Promise<ReadResult> {
    const { data, error } = await deps.supabase
      .from("products")
      .select("id, name, price, description, images, is_active")
      .eq("id", productId)
      .eq("dealership_id", dealershipId)
      .maybeSingle();

    // A failed READ is not a missing product. Collapsing the two would
    // tell an owner their product had been deleted because the database
    // hiccuped — and, worse, would let execute() treat a transient error
    // as "nothing to update".
    if (error) {
      publishError("hawlai_shop.read_failed", { dealership: dealershipId, product: productId, detail: error.message });
      return { ok: false, reason: "Couldn't read your store just now — nothing was changed. Try again in a moment." };
    }
    return { ok: true, product: (data as ProductRow) ?? null };
  }

  /** The requested value, validated per field. */
  function requestedValue(field: "price" | "name" | "description", changes: Record<string, unknown>): { ok: true; value: string } | { ok: false; reason: string } {
    const raw = changes[field] ?? changes[field === "description" ? "newDescription" : field];
    if (field === "price") {
      const value = String(raw ?? "").trim();
      if (!value || Number.isNaN(Number(value)) || Number(value) < 0) return { ok: false, reason: "That price isn't a valid amount." };
      return { ok: true, value };
    }
    const text = String(raw ?? "").trim();
    if (!text) return { ok: false, reason: `That ${field === "name" ? "name" : "description"} is empty.` };
    if (field === "name" && text.length > 120) return { ok: false, reason: "That product name is too long for a storefront listing (over 120 characters)." };
    return { ok: true, value: text };
  }

  function currentValue(field: "price" | "name" | "description", product: ProductRow): string {
    if (field === "price") return String(product.price ?? "");
    if (field === "name") return product.name ?? "";
    return product.description ?? "";
  }

  return {
    id: "hawlai_shop",
    supports,

    async isConnected(dealershipId: string): Promise<boolean> {
      // The business's own storefront is always "connected" — but with
      // no products there is nothing this platform can act on, and
      // saying yes would offer a capability that fails at resolution.
      const { data, error } = await deps.supabase.from("products").select("id").eq("dealership_id", dealershipId).limit(1);
      if (error) return false;
      return (data ?? []).length > 0;
    },

    async preview(action: PublishActionRecord): Promise<PreviewResult> {
      const field = FIELD_BY_ACTION[action.actionKey];
      if (!field) return { ok: false, reason: `Your store can't do "${action.actionKey}".` };
      if (!action.targetRef) return { ok: false, reason: "No product was specified." };

      const read = await readProduct(action.dealershipId, action.targetRef);
      if (!read.ok) return { ok: false, reason: read.reason };
      if (!read.product) return { ok: false, reason: "That product is no longer in your store." };
      const product = read.product;

      const wanted = requestedValue(field, action.requestedChanges);
      if (!wanted.ok) return { ok: false, reason: wanted.reason };

      const before = currentValue(field, product);
      const changes: FieldChange[] = [{ field, before, after: wanted.value }];

      // Warnings inform the decision; they never block it. The person
      // approving is entitled to decide a 40% cut is correct — they are
      // not entitled to be surprised by it.
      const warnings: string[] = [];
      if (field === "price") {
        const from = Number(before);
        const to = Number(wanted.value);
        if (Number.isFinite(from) && from > 0 && Number.isFinite(to)) {
          const deltaPct = Math.round(((to - from) / from) * 100);
          if (Math.abs(deltaPct) >= 20) warnings.push(`${deltaPct > 0 ? "Increase" : "Reduction"} of ${Math.abs(deltaPct)}%.`);
          if (to === 0) warnings.push("This makes the product free.");
        }
        // The owner named a currency their storefront doesn't use. Not a
        // question — the number is the instruction, and Hawlai's own
        // storefront prices in rupees. Deliberately NO conversion: a
        // silent FX rate on a live price is a worse failure than showing
        // the number they actually said.
        const stated = typeof action.requestedChanges.statedCurrency === "string" ? action.requestedChanges.statedCurrency : null;
        if (stated && stated !== CURRENCY) {
          warnings.push(`You said ${stated} — your Hawlai storefront prices in rupees, so this sets ${formatMoney(wanted.value, CURRENCY)} (not converted).`);
        }
        if (samePrice(before, wanted.value)) warnings.push("The price is already this value — approving will change nothing.");
      } else {
        if (sameText(before, wanted.value)) warnings.push(`The ${field} is already this — approving will change nothing.`);
        if (field === "description" && wanted.value.length > 2000) warnings.push("This description is very long — storefront listings read better under about 2,000 characters.");
        if (field === "name") warnings.push("Renaming changes what customers see, and the product's link stays the same.");
      }
      if (product.is_active === false) {
        warnings.push("This product is unpublished — the change won't be visible to customers until you publish it in Website Builder → Products.");
      }

      const label = field === "price" ? "Price" : field === "name" ? "Name" : "Description";
      const shown = (value: string) => (field === "price" ? formatMoney(value, CURRENCY) : `"${value.length > 80 ? `${value.slice(0, 80)}…` : value}"`);

      return {
        ok: true,
        preview: {
          summary: `"${product.name}" — ${label}: ${shown(before || "(empty)")} → ${shown(wanted.value)}`,
          // WHO is being changed, read from the store rather than from
          // the phrase the owner typed. If "the lavender one" resolved to
          // the wrong product, this is the only place it can be caught.
          target: {
            title: product.name,
            variantTitle: null,
            currentPrice: formatMoney(String(product.price ?? ""), CURRENCY),
            currency: CURRENCY,
            currencyLabel: "Indian rupees",
            imageUrl: firstImage(product.images),
            resolutionPath: action.resolutionPath ?? undefined,
          },
          changes,
          warnings,
        },
      };
    },

    async execute(action: PublishActionRecord): Promise<ExecuteResult> {
      const field = FIELD_BY_ACTION[action.actionKey];
      if (!field) return { ok: false, reason: `Execute for "${action.actionKey}" is not built yet.` };
      if (!action.targetRef) return { ok: false, reason: "No product was specified." };
      if (!action.preview) return { ok: false, reason: "This action was never previewed." };

      // RE-READ BEFORE WRITING. Someone previews at 10am and approves at
      // 3pm; if the product changed at noon, applying the approved intent
      // silently overwrites a change nobody saw and nobody agreed to.
      const read = await readProduct(action.dealershipId, action.targetRef);
      if (!read.ok) return { ok: false, reason: read.reason };
      if (!read.product) return { ok: false, reason: "That product is no longer in your store." };
      const product = read.product;

      const expected = action.preview.changes.find((c) => c.field === field);
      if (!expected) return { ok: false, reason: `The preview did not record a ${field} to verify against.` };

      const now = currentValue(field, product);
      const matches = field === "price" ? samePrice : sameText;

      // ALREADY AT THE TARGET — checked BEFORE staleness, and the order
      // is the whole of retry safety: a successful write followed by a
      // timeout and a retry would otherwise compare the new value to the
      // recorded before and report STALE for an action that succeeded.
      if (matches(now, expected.after)) {
        publishLog("hawlai_shop.noop", { action: action.id, product: product.id, field, why: "already_at_target" });
        return { ok: true, platformResponse: { skipped: `already at the requested ${field}` } };
      }

      if (!matches(now, expected.before)) {
        // Not a failure — the human's decision is simply out of date.
        // Nothing is written.
        publishError("hawlai_shop.stale", { action: action.id, product: product.id, field, expectedBefore: expected.before, actualNow: now, wanted: expected.after });
        return { ok: false, stale: true, changed: [{ field, before: expected.before, after: now }] };
      }

      // Logged BEFORE the write as well as after: if the request times
      // out there is otherwise no record that a change was attempted,
      // and "did it land?" becomes unanswerable.
      publishLog("hawlai_shop.write", { action: action.id, product: product.id, field, from: expected.before, to: expected.after });

      const value = field === "price" ? Number(expected.after) : expected.after;
      const { data: updated, error } = await deps.supabase
        .from("products")
        .update({ [COLUMN[field]]: value, updated_at: new Date().toISOString() })
        .eq("id", product.id)
        // Scoped in the write itself — a mismatched id updates nothing
        // rather than ever touching another business's product.
        .eq("dealership_id", action.dealershipId)
        .select("id")
        .maybeSingle();

      if (error) {
        publishError("hawlai_shop.write_failed", { action: action.id, product: product.id, detail: error.message });
        return { ok: false, reason: `Couldn't save the change to your store: ${error.message}` };
      }
      // Supabase reports an update matching ZERO rows as success with
      // error: null — the exact shape that made the old landing-page tool
      // claim a change nobody could see.
      if (!updated) {
        publishError("hawlai_shop.write_matched_nothing", { action: action.id, product: product.id, field });
        return { ok: false, reason: "The change matched no product in your store, so nothing was saved." };
      }

      publishLog("hawlai_shop.write_ok", { action: action.id, product: product.id, field, value: expected.after });
      return { ok: true, platformResponse: { productId: product.id, field, value: expected.after } };
    },
  };
}
