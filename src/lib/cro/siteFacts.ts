// What Hawlai can actually vouch for about a business — for CRO.
//
// WHY THIS EXISTS: CRO suggestions for candle_by_qaaf told the merchant
// to put a trust badge on their site reading "Loved by 500+ homes across
// India" — the business has had ONE order — and to advertise free
// shipping and keepsake boxes that don't exist. The same tool read an
// empty landing_pages record and announced "No headline set" about a
// live website that has one.
//
// Anything a merchant might paste onto their own site has to be built
// from facts and checked against them. This file gathers those facts —
// the live site Hawlai built, real products, real offers, real shipping
// settings, real order and lead counts — and checks generated copy
// against them.

type Row = Record<string, any>;

export type SitePage = {
  slug: string;
  title: string;
  pageType: string | null;
  headings: string[];
  paragraphs: string[];
  buttons: string[];
  metaDescription: string | null;
  hasShareImage: boolean;
};

export type CroFacts = {
  businessName: string;
  category: string;
  site: { url: string; published: boolean; pages: SitePage[] } | null;
  home: SitePage | null;
  products: { name: string; price: number; description: string | null }[];
  offers: { code: string; label: string; percent: number | null; flat: number | null }[];
  shipping: { mode: string; rate: number | null; freeThreshold: number | null } | null;
  last30: {
    views: number;
    chatOpens: number;
    leads: number;
    orders: number;
    abandonedCarts: number;
    /** orders / views — null when there's too little traffic for it to mean anything */
    conversionRate: number | null;
    cartAbandonmentRate: number | null;
  };
  allTime: { paidOrders: number; leads: number };
  /** Facts that couldn't be read — stated as unknown to the model, never guessed. */
  unreadable: string[];
};

/** Orders that represent real, paid business — the same statuses campaign attribution counts. */
export const PAID_ORDER_STATUSES = new Set(["confirmed", "shipped", "delivered"]);

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const LEGACY_HEADING_KEYS = ["headline", "heading", "title"];
const LEGACY_TEXT_KEYS = ["subheadline", "body", "text", "description", "subtitle"];
const LEGACY_BUTTON_KEYS = ["ctaText", "buttonText", "cta"];

/**
 * The words on a page, from its block tree.
 *
 * Block-builder pages keep a Heading's words in props.text, a Text
 * block's in props.html, a Button's in props.label, and forms / product
 * grids in props.heading. Pages from before the block builder store
 * flat fields (headline, subheadline, ctaText…), so both are read.
 */
export function blocksText(blocks: unknown): { headings: string[]; paragraphs: string[]; buttons: string[] } {
  const out = { headings: [] as string[], paragraphs: [] as string[], buttons: [] as string[] };
  const add = (list: string[], value: unknown, html = false) => {
    if (typeof value !== "string") return;
    const t = html ? stripHtml(value) : value.replace(/\s+/g, " ").trim();
    if (t) list.push(t);
  };
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const b = node as Row;
    if (b.props && typeof b.props === "object") {
      add(out.headings, b.props.text);
      add(out.headings, b.props.heading);
      add(out.paragraphs, b.props.html, true);
      add(out.buttons, b.props.label);
    } else {
      for (const k of LEGACY_HEADING_KEYS) add(out.headings, b[k]);
      for (const k of LEGACY_TEXT_KEYS) add(out.paragraphs, b[k], true);
      for (const k of LEGACY_BUTTON_KEYS) add(out.buttons, b[k]);
    }
    walk(b.children);
  };
  walk(blocks);
  return out;
}

export async function gatherCroFacts(supabase: any, dealershipId: string): Promise<CroFacts> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const unreadable: string[] = [];

  // Every read checked. A failed read becomes "unknown" in the prompt —
  // never an empty list the model would read as "this business has no
  // products / no orders".
  async function read<T>(label: string, query: PromiseLike<{ data: any; error: any }>, empty: T): Promise<T> {
    const { data, error } = await query;
    if (error) {
      unreadable.push(label);
      console.error(`[cro-facts] ${label} unreadable:`, error.message);
      return empty;
    }
    return (data ?? empty) as T;
  }

  const [dealership, website, products, offers, events, orders, leads, carts] = await Promise.all([
    read<Row | null>("business details", supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).maybeSingle(), null),
    read<Row | null>(
      "website",
      supabase.from("websites").select("id, slug, published, shipping_mode, shipping_rate, shipping_free_threshold").eq("dealership_id", dealershipId).maybeSingle(),
      null
    ),
    read<Row[]>("products", supabase.from("products").select("name, price, description").eq("dealership_id", dealershipId).eq("is_active", true).order("order_index", { ascending: true }).limit(25), []),
    read<Row[]>("offers", supabase.from("discount_codes").select("code, discount_type, value, min_order_value, max_uses, used_count, expires_at").eq("dealership_id", dealershipId).eq("is_active", true), []),
    read<Row[]>("visitor data", supabase.from("page_events").select("event_type").eq("dealership_id", dealershipId).gte("created_at", since), []),
    read<Row[]>("orders", supabase.from("orders").select("status, created_at").eq("dealership_id", dealershipId), []),
    read<Row[]>("leads", supabase.from("leads").select("id").eq("dealership_id", dealershipId), []),
    read<Row[]>("abandoned carts", supabase.from("abandoned_carts").select("id").eq("dealership_id", dealershipId).gte("created_at", since), []),
  ]);

  let pages: SitePage[] = [];
  if (website?.id) {
    const rows = await read<Row[]>(
      "website pages",
      supabase.from("website_pages").select("slug, title, page_type, meta_description, og_image_url, sections, order_index").eq("website_id", website.id).order("order_index", { ascending: true }),
      []
    );
    pages = rows.map((p) => ({
      slug: p.slug,
      title: p.title,
      pageType: p.page_type ?? null,
      ...blocksText(p.sections),
      metaDescription: p.meta_description ?? null,
      hasShareImage: Boolean(p.og_image_url),
    }));
  }
  const home = pages.find((p) => p.slug === "home" || p.pageType === "home") ?? pages[0] ?? null;

  const now = Date.now();
  const liveOffers = offers
    .filter((o) => (!o.expires_at || new Date(o.expires_at).getTime() > now) && (o.max_uses == null || (o.used_count ?? 0) < o.max_uses))
    .map((o) => {
      const value = Number(o.value);
      const percent = o.discount_type === "percentage" ? value : null;
      const flat = o.discount_type === "percentage" ? null : value;
      const label = `${percent !== null ? `${value}% off` : `₹${value} off`}${o.min_order_value ? ` on orders above ₹${Number(o.min_order_value)}` : ""}`;
      return { code: String(o.code), label, percent, flat };
    });

  const views = events.filter((e) => e.event_type === "view").length;
  const orders30 = orders.filter((o) => o.status !== "cancelled" && o.created_at >= since).length;
  const cartCount = carts.length;

  return {
    businessName: dealership?.dealership_name ?? "the business",
    category: dealership?.business_category ?? "business",
    site: website ? { url: `/site/${website.slug}`, published: Boolean(website.published), pages } : null,
    home,
    products: products.map((p) => ({ name: String(p.name), price: Number(p.price), description: p.description ?? null })),
    offers: liveOffers,
    shipping: website
      ? { mode: website.shipping_mode ?? "free", rate: website.shipping_rate != null ? Number(website.shipping_rate) : null, freeThreshold: website.shipping_free_threshold != null ? Number(website.shipping_free_threshold) : null }
      : null,
    last30: {
      views,
      chatOpens: events.filter((e) => e.event_type === "chat_open").length,
      leads: events.filter((e) => e.event_type === "form_submit").length,
      orders: orders30,
      abandonedCarts: cartCount,
      conversionRate: views >= 10 ? Math.round((orders30 / views) * 1000) / 10 : null,
      cartAbandonmentRate: orders30 + cartCount >= 5 ? Math.round((cartCount / (orders30 + cartCount)) * 1000) / 10 : null,
    },
    allTime: { paidOrders: orders.filter((o) => PAID_ORDER_STATUSES.has(o.status)).length, leads: leads.length },
    unreadable,
  };
}

function describeShipping(s: CroFacts["shipping"]): string {
  if (!s) return "not set up";
  if (s.mode === "free") return "free on every order";
  if (s.mode === "free_above") return `free on orders above ₹${s.freeThreshold ?? "?"}, otherwise ₹${s.rate ?? "?"}`;
  return `₹${s.rate ?? "?"} flat on every order (NOT free)`;
}

/** The VERIFIED FACTS block the model is given — and the only things it may state as true. */
export function formatFactsForPrompt(f: CroFacts): string {
  const lines: string[] = [`VERIFIED FACTS about "${f.businessName}" (${f.category}):`];
  if (f.site) {
    lines.push(`Live website: ${f.site.url} — ${f.site.published ? "published" : "not published yet"}, ${f.site.pages.length} page(s).`);
    if (f.home) {
      lines.push(`Home page headline: ${f.home.headings[0] ? `"${f.home.headings[0]}"` : "(none)"}`);
      if (f.home.paragraphs[0]) lines.push(`Home page copy: "${f.home.paragraphs.slice(0, 2).join(" ").slice(0, 400)}"`);
      if (f.home.buttons.length) lines.push(`Home page buttons: ${f.home.buttons.map((b) => `"${b}"`).join(", ")}`);
      if (f.home.headings.length > 1) lines.push(`Other home page headings: ${f.home.headings.slice(1, 6).map((h) => `"${h}"`).join(", ")}`);
    }
  } else {
    lines.push("Live website: none built yet.");
  }
  lines.push(
    f.products.length
      ? `Products (${f.products.length}): ${f.products.map((p) => `${p.name} — ₹${p.price}`).join("; ")}`
      : "Products: none listed."
  );
  lines.push(f.offers.length ? `Active discount codes: ${f.offers.map((o) => `${o.code} (${o.label})`).join("; ")}` : "Active discount codes: none.");
  lines.push(`Shipping: ${describeShipping(f.shipping)}.`);
  const l = f.last30;
  lines.push(
    `Last 30 days: ${l.views} page views, ${l.chatOpens} chat opens, ${l.leads} leads captured, ${l.orders} orders, ${l.abandonedCarts} abandoned carts.` +
      (l.conversionRate !== null ? ` View-to-order conversion: ${l.conversionRate}%.` : " Too little traffic for a reliable conversion rate.") +
      (l.cartAbandonmentRate !== null ? ` Cart abandonment: ${l.cartAbandonmentRate}%.` : "")
  );
  lines.push(`All time: ${f.allTime.paidOrders} paid order(s), ${f.allTime.leads} lead(s).`);
  if (f.unreadable.length) lines.push(`Couldn't be read right now (treat as unknown, do not guess): ${f.unreadable.join(", ")}.`);
  return lines.join("\n");
}

export const CRO_TRUTH_RULES = `TRUTH RULES — the merchant may paste your copy straight onto their live site:
- Only state things as true if they appear in the VERIFIED FACTS above.
- NEVER invent numbers: no customer or order counts, "X+ happy customers", ratings, stars, reviews, years in business or sales figures. The only counts you may use are the ones listed.
- NEVER write an offer, discount, free shipping, packaging (gift box, keepsake box), guarantee, certification (organic, vegan, phthalate-free, all-natural) or product into proposed copy unless it is listed above. If one would genuinely help, recommend it as a decision for the owner ("Consider creating a first-order discount code") — never as ready-to-publish copy that claims it exists.
- If the facts are too thin to make a point, say so rather than filling the gap.`;

function normalise(s: string): string {
  return s.toLowerCase().replace(/[‐‑–—-]/g, " ").replace(/\s+/g, " ").trim();
}

/** Everything the business itself says, publicly or in its catalogue — what a claim can be checked against. */
export function knownText(f: CroFacts): string {
  const parts: string[] = [];
  for (const p of f.site?.pages ?? []) parts.push(...p.headings, ...p.paragraphs, ...p.buttons, p.metaDescription ?? "");
  for (const p of f.products) parts.push(p.name, p.description ?? "");
  for (const o of f.offers) parts.push(o.label);
  return normalise(parts.join(" \n "));
}

const SOCIAL_PROOF = /(\d[\d,]*)\s*\+?\s*(?:happy\s+|satisfied\s+|loyal\s+|delighted\s+)?(homes|customers|families|buyers|people|clients|orders|reviews|ratings|shoppers|users|households)\b/gi;
const RATINGS = /\b\d(?:\.\d)?\s*(?:\/\s*5\b|stars?\b|★)|\brated\s+\d/i;
const YEARS = /\b(\d+)\s*\+?\s*years?\s+(?:of|in|experience|serving|trusted)/i;
const PACKAGING = /(keepsake|gift)\s*(box|boxes|packaging|wrap|wrapping|bag|tin)/gi;
const PERCENT_OFF = /(\d{1,3})\s*%\s*off/gi;
const FLAT_OFF = /₹\s?(\d[\d,]*)\s*off/gi;
const CLAIM_TERMS = [
  "phthalate free", "paraben free", "all natural", "100% natural", "vegan", "cruelty free", "organic",
  "non toxic", "eco friendly", "award winning", "best selling", "bestselling", "money back", "guarantee", "warranty",
];

/**
 * Claims in `text` that the facts don't support. Each entry says why.
 *
 * Deliberately conservative about what it checks: customer counts,
 * ratings, years in business, free shipping, packaging, discounts and
 * product certifications — the kinds of claim that were invented, and
 * that a merchant publishing them could be held to.
 */
export function findUnsupportedClaims(text: string, f: CroFacts): string[] {
  const reasons: string[] = [];
  const known = knownText(f);
  const t = normalise(text);

  const realCount = Math.max(f.allTime.paidOrders, f.allTime.leads);
  for (const m of text.matchAll(SOCIAL_PROOF)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (n > realCount) reasons.push(`"${m[0].trim()}" — the business has ${f.allTime.paidOrders} paid order(s) and ${f.allTime.leads} lead(s) on record`);
  }
  if (RATINGS.test(text)) reasons.push("a star rating — Hawlai has no rating data for this business");
  const years = text.match(YEARS);
  if (years && !known.includes(`${years[1]} year`)) reasons.push(`"${years[0].trim()}" — no years-in-business figure on record`);

  if (/free\s+(shipping|delivery)/i.test(text) && !(f.shipping && (f.shipping.mode === "free" || f.shipping.mode === "free_above"))) {
    reasons.push(`free shipping — the store's shipping is ${describeShipping(f.shipping)}`);
  }
  for (const m of text.matchAll(PACKAGING)) {
    if (!known.includes(normalise(m[0]))) reasons.push(`"${m[0]}" — not mentioned anywhere on the site or in the products`);
  }
  for (const m of text.matchAll(PERCENT_OFF)) {
    if (!f.offers.some((o) => o.percent === Number(m[1]))) reasons.push(`"${m[0]}" — no active discount code gives ${m[1]}% off`);
  }
  for (const m of text.matchAll(FLAT_OFF)) {
    const v = Number(m[1].replace(/,/g, ""));
    if (!f.offers.some((o) => o.flat === v)) reasons.push(`"${m[0]}" — no active discount code gives ₹${v} off`);
  }
  if (/first[\s-]order/i.test(text) && /(off|discount|free)/i.test(text) && f.offers.length === 0) {
    reasons.push("a first-order offer — the store has no active discount codes");
  }
  for (const term of CLAIM_TERMS) {
    if (t.includes(term) && !known.includes(term)) reasons.push(`"${term}" — the business doesn't claim this anywhere`);
  }
  return reasons;
}

function itemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return Object.values(item as Row).filter((v) => typeof v === "string").join(" \n ");
}

/**
 * Removes every suggestion that rests on an unsupported claim, and says
 * so. Suggestions are dropped whole: a fix whose copy claims "500+
 * homes" can't be half-kept.
 */
export function scrubCroOutput(output: any, f: CroFacts): { output: any; removed: string[] } {
  if (!output || typeof output !== "object") return { output, removed: [] };
  const removed: string[] = [];
  const cleaned: Row = { ...output };
  for (const [key, value] of Object.entries(output)) {
    if (!Array.isArray(value)) continue;
    cleaned[key] = value.filter((item) => {
      const problems = findUnsupportedClaims(itemText(item), f);
      removed.push(...problems);
      return problems.length === 0;
    });
  }
  if (removed.length > 0) {
    const n = Array.from(new Set(removed)).length;
    cleaned.note = `Removed suggestions that relied on details Hawlai couldn't verify (${n} issue${n === 1 ? "" : "s"}: ${Array.from(new Set(removed)).slice(0, 3).join("; ")}).`;
  }
  return { output: cleaned, removed: Array.from(new Set(removed)) };
}
