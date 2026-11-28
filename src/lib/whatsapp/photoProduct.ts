// A product from a photo on WhatsApp — W1 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// The seller sends a product photo to Hawlai's WhatsApp, from their own
// verified number, with a caption like "Red kurta M ₹899 5 pcs". The
// product is added to their catalog with that photo.
//
// THE SELLER'S OWN WORDS, NEVER THE MODEL'S. A small AI call reads the
// caption into name / price / stock — it does not look at the photo and
// writes no description. And code then checks the reading against the
// caption itself:
//   • the price's digits must be written in the caption,
//   • the stock's digits too, when there is a stock,
//   • every word of the name must be in the caption.
// Anything that fails is not invented: no price, no product, and the
// seller is told exactly what to send.
//
// A SEPARATE PARSER FROM readInbound, like the payment button: readInbound
// turns TEXT into Master Chat turns and counts an image as skipped
// (tests/whatsappInbound pins that). A photo is not a sentence for a model.

import { callClaude } from "@/lib/ai/claude";
import { modelForTask } from "@/lib/aiTaskRouter";
import { parseModelJson } from "@/lib/ai/modelJson";
import { normalizePhoneNumber } from "./gupshupClient";

export type PhotoMessage = { phone: string; mediaId: string; caption: string };

/** Image messages in a Meta webhook body. */
export function readPhotoMessages(body: any): PhotoMessage[] {
  const out: PhotoMessage[] = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field && change.field !== "messages") continue;
      for (const m of Array.isArray(change?.value?.messages) ? change.value.messages : []) {
        if (m?.type !== "image") continue;
        const from = typeof m?.from === "string" ? m.from.trim() : "";
        const mediaId = typeof m?.image?.id === "string" ? m.image.id.trim() : "";
        if (from && mediaId) out.push({ phone: normalizePhoneNumber(from), mediaId, caption: typeof m?.image?.caption === "string" ? m.image.caption.trim() : "" });
      }
    }
  }
  return out;
}

export type ProductFields = { name: string; price: number; inventory: number | null };

const digitsOf = (n: number) => String(n).replace(/\.0+$/, "");
const plainCaption = (c: string) => c.replace(/,/g, "");

/**
 * The model's reading, accepted only where the caption itself says it.
 * Returns the fields, or what is missing in words the seller can act on.
 */
export function checkAgainstCaption(value: any, caption: string): { ok: true; fields: ProductFields } | { ok: false; missing: string } {
  const text = plainCaption(caption).toLowerCase();
  const name: string = typeof value?.name === "string" ? value.name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const words: string[] = name.toLowerCase().split(/[\s–—|/-]+/).filter(Boolean);
  if (!name || !words.every((w) => text.includes(w))) return { ok: false, missing: "the product's name" };

  const price = Number(value?.price);
  if (!Number.isFinite(price) || price <= 0 || !text.includes(digitsOf(price))) return { ok: false, missing: "the price" };

  let inventory: number | null = null;
  if (value?.inventory != null) {
    const n = Number(value.inventory);
    if (Number.isInteger(n) && n >= 0 && n <= 100000 && text.includes(String(n))) inventory = n;
  }
  return { ok: true, fields: { name, price, inventory } };
}

/** Read the caption into fields — never throws; null when it can't be read. */
export async function readCaption(caption: string, logContext: { supabase: any; dealershipId: string }): Promise<any | null> {
  const r = await callClaude(
    {
      model: modelForTask("whatsapp_photo_product"),
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `A shop owner sent a product photo with this caption: ${JSON.stringify(caption.slice(0, 500))}
Read ONLY what the caption says. name: the product's name in the caption's own words. price: the price in rupees as a number. inventory: how many are in stock as a whole number, or null if not said. Never invent a value: null for anything the caption doesn't say.
Return JSON only: {"name":"...","price":899,"inventory":5}`,
        },
      ],
    },
    { operation: "whatsapp_photo_product", logContext }
  );
  if (!r.ok) return null;
  const parsedReply = parseModelJson(r.text);
  if (!parsedReply.ok) {
    console.error(`[photo-product] ${parsedReply.cause}: ${parsedReply.detail}`);
    return null;
  }
  return parsedReply.value;
}

/**
 * Where a product photo lives: the same bucket and folder the Products
 * tab's own uploader uses (api/website-builder/upload), so a photo from
 * WhatsApp is indistinguishable from one uploaded there.
 */
export async function storeProductPhoto(service: any, dealershipId: string, bytes: Buffer, mimeType: string): Promise<string> {
  const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
  const filePath = `website-assets/${dealershipId}/product-${Date.now()}.${ext}`;
  const { error } = await service.storage.from("ad-creatives").upload(filePath, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(error.message);
  return service.storage.from("ad-creatives").getPublicUrl(filePath).data.publicUrl;
}

export const ASK_FOR_CAPTION =
  "Got the photo. To add it as a product, send it again with a caption — the name, price and stock, like: Red kurta M ₹899 5 pcs";

/**
 * The whole W1 step, given ways to download, store and insert — so it can
 * be tested without Meta or storage. Returns the reply to send the seller.
 */
export async function addProductFromPhoto(
  deps: {
    supabase: any;
    dealershipId: string;
    download: (mediaId: string) => Promise<{ bytes: Buffer; mimeType: string }>;
    store: (bytes: Buffer, mimeType: string) => Promise<string>;
    read: (caption: string) => Promise<any | null>;
  },
  photo: PhotoMessage
): Promise<string> {
  if (!photo.caption) return ASK_FOR_CAPTION;

  const reading = await deps.read(photo.caption);
  if (!reading) return "I couldn't read that caption just now — please send the photo again in a minute.";
  const checked = checkAgainstCaption(reading, photo.caption);
  if (!checked.ok) return `I couldn't find ${checked.missing} in your caption, so nothing was added. ${ASK_FOR_CAPTION.replace("Got the photo. ", "")}`;
  const { name, price, inventory } = checked.fields;

  // NOT A SECOND COPY of a product that already exists.
  const { data: same, error: sameError } = await deps.supabase
    .from("products")
    .select("id")
    .eq("dealership_id", deps.dealershipId)
    .ilike("name", name)
    .limit(1);
  if (sameError) return "I couldn't check your products just now, so nothing was added. Please try again.";
  if (Array.isArray(same) && same.length) return `"${name}" is already in your products, so nothing was added. Change it on the Products tab.`;

  let imageUrl: string;
  try {
    const file = await deps.download(photo.mediaId);
    imageUrl = await deps.store(file.bytes, file.mimeType);
  } catch (err: any) {
    return `The photo couldn't be saved (${err?.message ?? err}), so nothing was added. Please send it again.`;
  }

  const { error } = await deps.supabase.from("products").insert({
    dealership_id: deps.dealershipId,
    name,
    price,
    inventory_count: inventory,
    images: [imageUrl],
    is_active: true,
  });
  if (error) return `The product couldn't be saved (${error.message}). Please try again.`;
  return `Added to your products: "${name}" · ₹${price.toLocaleString("en-IN")}${inventory != null ? ` · ${inventory} in stock` : " · stock not tracked"}. Change anything on the Products tab.`;
}
