// Taking an order inside an Instagram DM — O1 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct revision), 28 November
// 2026.
//
// The customer says what they want over a few messages; Hawlai gathers
// the product, quantity, name, phone and delivery address; READS IT ALL
// BACK with the catalog's prices and the seller's delivery fee; and only
// when the customer answers "yes" to that read-back is an order placed
// and the UPI payment request sent.
//
// ──────────────────────────────────────────────────────────────────
// WHO WRITES WHAT
//
//   The model READS. One small call pulls the order details out of the
//   customer's words into fixed fields. It writes nothing the customer
//   sees, so it cannot promise a price, a delivery date or a discount.
//
//   This file WRITES every message of the order flow, from the records:
//   prices from the products table, the fee from the Seller Mode card,
//   the total from the same pricing function the order is written with.
//   A number in a read-back is never one the model produced.
//
// WHAT "YES" PLACES. The read-back is stored as it was shown. A yes
// places exactly that — and if the catalog price moved in between, the
// customer is shown the new read-back instead. A yes is claimed with a
// conditional update before anything is written, so the same "yes"
// delivered twice cannot place two orders.
//
// WHAT IT NEVER DOES. It never says the payment arrived — only the
// seller can. It never moves stock — the seller confirming the payment
// does (O3/O4′). And it runs only while SELLER_MODE_TAKES_ORDERS is true
// and the business has Seller Mode on; the webhook checks both.
// ──────────────────────────────────────────────────────────────────

import { callClaude } from "@/lib/ai/claude";
import { modelForTask } from "@/lib/aiTaskRouter";
import { parseModelJson } from "@/lib/ai/modelJson";
import type { CopyLanguage } from "@/lib/content/language";
import { variantsOf } from "@/lib/catalog/variants";
import { formatRupees } from "@/lib/payments/upiRequest";
import { threadBlock, MESSAGING_WINDOW_MS, type DmTurn } from "@/lib/dm/thread";
import type { BusinessOrderPricingResult, ResolvedOrderItem } from "@/lib/orderPricing";
import type { DmOrderResult } from "@/lib/orders/createDmOrder";

// ---- the shapes ---------------------------------------------------------

export type OrderDraft = {
  /** As the customer named them; resolved to catalog ids only at read-back. */
  items: { product: string; quantity: number }[];
  name: string | null;
  phone: string | null;
  address: string | null;
};

export const EMPTY_DRAFT: OrderDraft = { items: [], name: null, phone: null, address: null };

/** The quote the customer was SHOWN. A yes places exactly this. */
export type Readback = {
  lines: { productId: string; quantity: number }[];
  items: ResolvedOrderItem[];
  subtotal: number;
  shippingAmount: number;
  total: number;
  name: string;
  phone: string;
  address: string;
};

export type DraftRow = {
  id: string;
  draft: OrderDraft;
  readback: Readback | null;
  readback_sent_at: string | null;
  status: "open" | "ordered" | "cancelled";
  order_id?: string | null;
  updated_at: string;
};

export type Extraction = {
  intent: "order" | "cancel" | "other";
  items: { product: string; quantity: number }[] | null;
  name: string | null;
  phone: string | null;
  address: string | null;
};

export type OutMessage = { text: string } | { imageUrl: string };

export type OrderTurn =
  | { handled: false }
  | { handled: true; messages: OutMessage[]; orderId?: string; note?: string };

export type PlacedOrder = Extract<DmOrderResult, { ok: true }> & { customerName: string };

export type OrderTurnDeps = {
  now: Date;
  language: CopyLanguage;
  /** Products that can be ordered (not services), active, this business only. */
  catalog: { id: string; name: string }[];
  loadDraft(): Promise<DraftRow | null>;
  /** Writes the conversation's row; `updated_at` is set to now by the caller's store. */
  saveDraft(patch: Partial<Omit<DraftRow, "id" | "updated_at">>): Promise<void>;
  /** Clears the read-back IF it is still the one shown at `sentAt`. True = this delivery owns the yes. */
  claimReadback(sentAt: string): Promise<boolean>;
  extract(text: string, draft: OrderDraft): Promise<Extraction | null>;
  price(lines: { productId: string; quantity: number }[]): Promise<BusinessOrderPricingResult>;
  placeOrder(readback: Readback): Promise<DmOrderResult>;
  paymentRequest(order: PlacedOrder): { text: string; qrUrl: string };
  notifySeller(order: PlacedOrder): Promise<void>;
};

// ---- the words ----------------------------------------------------------

/** "Yes" to a read-back — whole message only, so "yes but in blue" is not one. */
export function isYes(text: string): boolean {
  return /^\s*(yes|y|yeah|yep|haan?|ha+|han|ji|ji haan|haan ji|confirm(ed)?|ok(ay)?|done|place it|1|👍|हाँ|हां|जी)\s*[.!]*\s*$/i.test(text);
}

/** "No" to a read-back — whole message only. */
export function isNo(text: string): boolean {
  return /^\s*(no|n|nope|nahi|nahin|nai|na|not yet|wait|2|नहीं)\s*[.!]*\s*$/i.test(text);
}

type Lines = Record<
  "askItems" | "askName" | "askPhone" | "badPhone" | "askAddress" | "change" | "cancelled" | "priceMoved" | "notPlaced" | "readbackHead" | "readbackFoot" | "delivery" | "free" | "total" | "nameLabel" | "phoneLabel" | "addressLabel",
  string
> & { unknown: (name: string) => string; ambiguous: (name: string) => string; whichOne: (base: string, options: string[]) => string };

const LINES: Record<CopyLanguage, Lines> = {
  english: {
    askItems: "What would you like to order? Send the product name and how many.",
    askName: "What name should the order be under?",
    askPhone: "What's a phone number for delivery updates?",
    badPhone: "That phone number looks too short — could you send it again with all the digits?",
    askAddress: "And the full delivery address, with PIN code?",
    change: "No problem — what would you like to change?",
    cancelled: "Okay, I've cancelled this order. Message anytime if you'd like to order.",
    priceMoved: "The price changed since I sent your order, so here it is again:",
    notPlaced: "Sorry, I couldn't place this order. The team has been told and will reply here.",
    readbackHead: "Please check your order:",
    readbackFoot: "Reply YES to place the order, or tell me what to change.",
    delivery: "Delivery",
    free: "Free",
    total: "Total",
    nameLabel: "Name",
    phoneLabel: "Phone",
    addressLabel: "Address",
    unknown: (n) => `I couldn't find "${n}" in our catalogue. Could you send the exact product name?`,
    ambiguous: (n) => `We have more than one "${n}". Could you tell me a little more about the one you'd like? The team can also help here.`,
    whichOne: (b, o) => `Which ${b} would you like?\n${o.map((x) => `• ${x}`).join("\n")}\nSend the one you want.`,
  },
  hinglish: {
    askItems: "Aap kya order karna chahenge? Product ka naam aur kitne chahiye, bata dijiye.",
    askName: "Order kis naam se karna hai?",
    askPhone: "Delivery updates ke liye phone number bata dijiye.",
    badPhone: "Ye phone number chhota lag raha hai — poora number dobara bhej dijiye?",
    askAddress: "Aur poora delivery address, PIN code ke saath?",
    change: "Koi baat nahi — kya badalna hai?",
    cancelled: "Theek hai, ye order cancel kar diya. Jab chahein message kar dijiye.",
    priceMoved: "Order bhejne ke baad price badal gaya, isliye dobara bhej raha hoon:",
    notPlaced: "Maaf kijiye, ye order place nahi ho paya. Team ko bata diya hai, woh yahin reply karenge.",
    readbackHead: "Apna order check kar lijiye:",
    readbackFoot: "Order place karne ke liye YES likhiye, ya bataiye kya badalna hai.",
    delivery: "Delivery",
    free: "Free",
    total: "Total",
    nameLabel: "Naam",
    phoneLabel: "Phone",
    addressLabel: "Address",
    unknown: (n) => `"${n}" hamare catalogue mein nahi mila. Product ka exact naam bhej dijiye?`,
    ambiguous: (n) => `Hamare paas "${n}" naam ke ek se zyada products hain. Aap kaunsa chahte hain, thoda aur bata dijiye? Team bhi yahin madad kar sakti hai.`,
    whichOne: (b, o) => `Aapko kaunsa ${b} chahiye?\n${o.map((x) => `• ${x}`).join("\n")}\nJo chahiye, wo bhej dijiye.`,
  },
  hindi: {
    askItems: "आप क्या ऑर्डर करना चाहेंगे? प्रोडक्ट का नाम और कितने चाहिए, बताइए।",
    askName: "ऑर्डर किस नाम से करना है?",
    askPhone: "डिलीवरी अपडेट के लिए फ़ोन नंबर बताइए।",
    badPhone: "यह फ़ोन नंबर छोटा लग रहा है — पूरा नंबर फिर से भेजिए?",
    askAddress: "और पूरा डिलीवरी पता, पिन कोड के साथ?",
    change: "कोई बात नहीं — क्या बदलना है?",
    cancelled: "ठीक है, यह ऑर्डर रद्द कर दिया। जब चाहें संदेश भेजिए।",
    priceMoved: "ऑर्डर भेजने के बाद कीमत बदल गई, इसलिए फिर से भेज रहा हूँ:",
    notPlaced: "माफ़ कीजिए, यह ऑर्डर नहीं हो पाया। टीम को बता दिया है, वे यहीं जवाब देंगे।",
    readbackHead: "अपना ऑर्डर जाँच लीजिए:",
    readbackFoot: "ऑर्डर करने के लिए YES लिखिए, या बताइए क्या बदलना है।",
    delivery: "डिलीवरी",
    free: "मुफ़्त",
    total: "कुल",
    nameLabel: "नाम",
    phoneLabel: "फ़ोन",
    addressLabel: "पता",
    unknown: (n) => `"${n}" हमारे कैटलॉग में नहीं मिला। प्रोडक्ट का सही नाम भेजिए?`,
    ambiguous: (n) => `हमारे पास "${n}" नाम के एक से ज़्यादा प्रोडक्ट हैं। आप कौन-सा चाहते हैं, थोड़ा और बताइए? टीम भी यहीं मदद कर सकती है।`,
    whichOne: (b, o) => `आपको कौन-सा ${b} चाहिए?\n${o.map((x) => `• ${x}`).join("\n")}\nजो चाहिए, वह भेज दीजिए।`,
  },
};

/** The read-back, written from the quote — every number from the records. */
export function readbackText(r: Readback, language: CopyLanguage): string {
  const L = LINES[language];
  return [
    L.readbackHead,
    ...r.items.map((it) => `• ${it.quantity} × ${it.name} — ₹${formatRupees(it.price * it.quantity)}`),
    `${L.delivery}: ${r.shippingAmount > 0 ? `₹${formatRupees(r.shippingAmount)}` : L.free}`,
    `${L.total}: ₹${formatRupees(r.total)}`,
    `${L.nameLabel}: ${r.name}`,
    `${L.phoneLabel}: ${r.phone}`,
    `${L.addressLabel}: ${r.address}`,
    L.readbackFoot,
  ].join("\n");
}

// ---- the turn -----------------------------------------------------------

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function merge(draft: OrderDraft, ex: Extraction): OrderDraft {
  const clean = (v: string | null) => (v && v.trim() ? v.replace(/\s+/g, " ").trim() : null);
  return {
    items: ex.items && ex.items.length > 0 ? ex.items : draft.items,
    name: clean(ex.name) ?? draft.name,
    phone: clean(ex.phone) ?? draft.phone,
    address: clean(ex.address) ?? draft.address,
  };
}

function sameQuote(a: Readback, total: number, items: ResolvedOrderItem[]): boolean {
  if (Math.round(a.total * 100) !== Math.round(total * 100)) return false;
  if (a.items.length !== items.length) return false;
  return a.items.every((it, i) => it.product_id === items[i].product_id && it.quantity === items[i].quantity && it.price === items[i].price);
}

/**
 * One customer message, in a conversation where Seller Mode is taking
 * orders. `{ handled: false }` hands the message to the ordinary reply —
 * a question about a product, a greeting, anything that is not the order.
 */
export async function handleOrderTurn(text: string, deps: OrderTurnDeps): Promise<OrderTurn> {
  const L = LINES[deps.language];
  const row = await deps.loadDraft();
  // A conversation quiet for a day starts over: Meta's window has closed
  // and reopened, and the customer may not remember a half-told order.
  const fresh = !!row && row.status === "open" && deps.now.getTime() - new Date(row.updated_at).getTime() < MESSAGING_WINDOW_MS;
  const draft: OrderDraft = fresh ? row!.draft : { ...EMPTY_DRAFT, name: row?.draft?.name ?? null, phone: row?.draft?.phone ?? null, address: row?.draft?.address ?? null };

  // ---- an answer to a read-back --------------------------------------
  const pending = fresh && row!.readback && row!.readback_sent_at ? row!.readback : null;
  if (pending && isYes(text)) {
    // CLAIMED FIRST. A second delivery of the same "yes" finds nothing
    // to claim and places nothing.
    if (!(await deps.claimReadback(row!.readback_sent_at!))) return { handled: true, messages: [], note: "this yes was already taken by another delivery" };

    const repriced = await deps.price(pending.lines);
    if (!repriced.ok) {
      await deps.saveDraft({ draft, readback: null, readback_sent_at: null, status: "open" });
      return { handled: true, messages: [{ text: clip(repriced.error, 300) }], note: `not placed: ${repriced.error}` };
    }
    if (!sameQuote(pending, repriced.total, repriced.resolvedItems)) {
      const again: Readback = { ...pending, items: repriced.resolvedItems, subtotal: repriced.subtotal, shippingAmount: repriced.shippingAmount, total: repriced.total };
      await deps.saveDraft({ draft, readback: again, readback_sent_at: deps.now.toISOString(), status: "open" });
      return { handled: true, messages: [{ text: `${L.priceMoved}\n${readbackText(again, deps.language)}` }], note: "price moved before the yes" };
    }

    const placed = await deps.placeOrder(pending);
    if (!placed.ok) {
      await deps.saveDraft({ draft, readback: null, readback_sent_at: null, status: "open" });
      return { handled: true, messages: [{ text: L.notPlaced }], note: `not placed: ${placed.error}` };
    }
    await deps.saveDraft({ draft: { ...draft, items: [] }, readback: null, readback_sent_at: null, status: "ordered", order_id: placed.orderId });
    const order: PlacedOrder = { ...placed, customerName: pending.name };
    const pay = deps.paymentRequest(order);
    await deps.notifySeller(order);
    return { handled: true, orderId: placed.orderId, messages: [{ text: pay.text }, { imageUrl: pay.qrUrl }] };
  }
  if (pending && isNo(text)) {
    await deps.saveDraft({ draft, readback: null, readback_sent_at: null, status: "open" });
    return { handled: true, messages: [{ text: L.change }] };
  }

  // ---- read the message --------------------------------------------
  const ex = await deps.extract(text, draft);
  // The AI could not be read: the ordinary reply path takes it, which
  // tells the customer honestly when it cannot answer either.
  if (!ex) return { handled: false };

  if (ex.intent === "cancel") {
    if (!fresh) return { handled: false };
    await deps.saveDraft({ draft: { ...draft, items: [] }, readback: null, readback_sent_at: null, status: "cancelled" });
    return { handled: true, messages: [{ text: L.cancelled }] };
  }
  // Not about the order: a question, a greeting. The draft is kept and
  // the ordinary reply answers it.
  if (ex.intent !== "order") return { handled: false };

  const next = merge(draft, ex);
  const save = (extra: Partial<Omit<DraftRow, "id" | "updated_at">> = {}) =>
    deps.saveDraft({ draft: next, readback: null, readback_sent_at: null, status: "open", ...extra });

  // ---- what is still missing, in the order a person would ask -------
  if (next.items.length === 0) {
    await save();
    return { handled: true, messages: [{ text: L.askItems }] };
  }
  const lines: { productId: string; quantity: number }[] = [];
  for (const it of next.items) {
    const match = deps.catalog.filter((p) => p.name.trim().toLowerCase() === String(it.product ?? "").trim().toLowerCase());
    // EXACTLY ONE, OR ASK. A near match is a guess about what someone is
    // paying for.
    if (match.length !== 1) {
      await save({ draft: { ...next, items: next.items.filter((x) => x !== it) } });
      const named = clip(String(it.product ?? ""), 60);
      // V1 (28 Nov 2026): ONLY THE ITEM WAS NAMED, and it comes in options —
      // "kurta", when the shop sells "Kurta – Red – M" and "Kurta – Red – L".
      // The options are listed from the catalog, never guessed at.
      const options = match.length === 0 ? variantsOf(String(it.product ?? ""), deps.catalog) : [];
      if (options.length) {
        return {
          handled: true,
          messages: [{ text: L.whichOne(named, options.slice(0, 10).map((p) => p.name)) }],
        };
      }
      return {
        handled: true,
        messages: [{ text: match.length === 0 ? L.unknown(named) : L.ambiguous(named) }],
        // Two products sharing a name is the SELLER's to fix — said in the log they read.
        ...(match.length > 1 ? { note: `more than one product is named "${named}"` } : {}),
      };
    }
    lines.push({ productId: match[0].id, quantity: it.quantity });
  }
  if (!next.name) {
    await save();
    return { handled: true, messages: [{ text: L.askName }] };
  }
  if (!next.phone) {
    await save();
    return { handled: true, messages: [{ text: L.askPhone }] };
  }
  if (next.phone.replace(/\D/g, "").length < 8) {
    await save({ draft: { ...next, phone: null } });
    return { handled: true, messages: [{ text: L.badPhone }] };
  }
  if (!next.address || next.address.length < 5) {
    await save({ draft: { ...next, address: null } });
    return { handled: true, messages: [{ text: L.askAddress }] };
  }

  // ---- everything is here: price it and read it back ---------------
  const priced = await deps.price(lines);
  if (!priced.ok) {
    await save();
    return { handled: true, messages: [{ text: clip(priced.error, 300) }] };
  }
  const readback: Readback = {
    lines,
    items: priced.resolvedItems,
    subtotal: priced.subtotal,
    shippingAmount: priced.shippingAmount,
    total: priced.total,
    name: next.name,
    phone: next.phone,
    address: next.address,
  };
  await save({ readback, readback_sent_at: deps.now.toISOString() });
  return { handled: true, messages: [{ text: readbackText(readback, deps.language) }] };
}

// ---- the one model call -------------------------------------------------

const QUANTITY = (q: unknown) => (Number.isInteger(q) && (q as number) >= 1 && (q as number) <= 99 ? (q as number) : null);
const field = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);

/**
 * The model's answer, accepted only in the exact shape asked for.
 * Anything else is null — and null is "the ordinary reply takes it".
 */
export function readExtraction(value: any): Extraction | null {
  if (!value || typeof value !== "object") return null;
  const intent = value.intent;
  if (intent !== "order" && intent !== "cancel" && intent !== "other") return null;
  let items: Extraction["items"] = null;
  if (Array.isArray(value.items)) {
    items = [];
    for (const it of value.items.slice(0, 10)) {
      const product = field(it?.product);
      const quantity = QUANTITY(it?.quantity ?? 1);
      if (!product || quantity === null) return null;
      items.push({ product, quantity });
    }
  }
  return { intent, items, name: field(value.name), phone: field(value.phone), address: field(value.address) };
}

/**
 * Pull the order details out of the customer's message. Writes nothing a
 * customer sees; the catalog names are given so the product comes back
 * as the catalog spells it, and the code still checks it matches one.
 */
export async function extractOrderDetails(
  input: { text: string; draft: OrderDraft; catalogNames: string[]; turns: DmTurn[] },
  logContext: { supabase: any; dealershipId: string }
): Promise<Extraction | null> {
  const r = await callClaude(
    {
      model: modelForTask("dm_order_extract"),
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You read an Instagram DM to a small shop and extract order details. You do NOT reply to the customer.
Products the shop sells (use these exact names): ${JSON.stringify(input.catalogNames.slice(0, 60))}
Order details gathered so far: ${JSON.stringify(input.draft)}${threadBlock(input.turns)}
The customer's new message: ${JSON.stringify(input.text)}

intent: "order" if they want to buy, or are giving details for an order (name, phone, address, quantity, a change); "cancel" if they want to cancel the order; "other" for anything else (a question, a greeting).
items: the FULL list of products they want now, with each product's exact name from the list above and the quantity (1 if not said) — or null if this message doesn't change the items. If they name a product not in the list, give their words as the product. Some products are options of one item, named like "Kurta – Red – M": when their words pick one option, give that exact name; when they name only the item ("a kurta") without saying which, give just the item name ("Kurta").
name, phone, address: only what THIS message says, else null. Never invent any detail.

Return JSON only: {"intent":"order|cancel|other","items":[{"product":"...","quantity":1}] or null,"name":null,"phone":null,"address":null}`,
        },
      ],
    },
    { operation: "dm_order_extract", logContext }
  );
  if (!r.ok) return null;
  const parsedReply = parseModelJson(r.text);
  // THE CAUSE IS LOGGED (tests/noGreedyJsonParse). Missed when O1 shipped:
  // that guard walks `git ls-files`, and this file was still untracked
  // when O1's gates ran — caught 28 Nov 2026 the moment it was tracked.
  if (!parsedReply.ok) {
    console.error(`[dm-order-extract] ${parsedReply.cause}: ${parsedReply.detail}`);
    return null;
  }
  return readExtraction(parsedReply.value);
}

