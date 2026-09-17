// THE canonical answer to "what does this business actually sell, charge
// and say about itself" — for every AI-facing path, text and image alike.
//
// WHY THIS EXISTS: CRO told candle_by_qaaf to publish "Loved by 500+
// homes across India" (one order on record) and "free shipping" (flat
// ₹60). Content Marketing said the same. Generated images showed the
// wrong product category entirely. All three trace to the same root: a
// dozen code paths each fetched "the business" their own way — some
// with products, most with only a category word, images with nothing at
// all — so fixing one surface never fixed the others.
//
// Everything is gathered here, once, from the tables that hold the real
// thing: the live site, the products table (with photos and stock), live
// discount codes (using checkout's own liveness rule), the shipping
// settings checkout charges from, real order and lead counts, the
// owner's Business Knowledge and their brand identity.
//
// getBusinessContext (chat, calls, DMs) is built on top of this;
// claimCheck.ts checks generated copy against it; imageBrief.ts anchors
// generated pictures to it.

import { formatBrandVoiceSection, type BrandVoiceProfile } from "@/lib/agents/brandVoice";
import { STORY_CATEGORY } from "@/lib/business/businessStory";
import { discountUsable } from "@/lib/discounts";
import { hawlaiProductUrl } from "@/lib/ads/productSource";
import { effectiveBusinessModels, describeBusinessModels, type BusinessModel } from "@/lib/business/businessModel";
import { bookingPageUrl, formatDuration, isService } from "@/lib/catalog/catalogItem";
import { seasonFor, formatSeason, outOfSeasonFestival, indiaToday, SEASON_TRUTH_RULE, type Season, type SeasonalEventRow } from "@/lib/expertise/seasonalCalendar";

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

/**
 * A catalogue item as every path should see it — one shape, one set of
 * rules. Products and services both (migration 188); `kind` says which.
 */
export type CatalogProduct = {
  id: string | null;
  name: string;
  /** "service" is booked, not bought or shipped. Missing means product. */
  kind?: "product" | "service";
  /** A service's length, when the owner gave one. */
  durationMinutes?: number | null;
  /** A service's own booking link, when the owner gave one. */
  bookingUrl?: string | null;
  price: number;
  description: string | null;
  /** Real uploaded photo URLs. The first one is what an image model is shown. */
  images: string[];
  /** null = untracked / unlimited stock. 0 = genuinely out of stock. */
  inventory: number | null;
  category: string | null;
  active: boolean;
};

export type KnowledgeFact = { category: string; title: string; content: string };

/** How the business sounds and looks — the owner's own brand decisions. */
export type BrandIdentity = {
  tone: string | null;
  voice: BrandVoiceProfile | null;
  persona: Row | null;
  language: string | null;
  pillars: string[];
  description: string | null;
  colors: { name: string; hex: string; role: string }[];
  logoUrl: string | null;
};

export type BusinessFacts = {
  businessName: string;
  /** "business" when the owner hasn't set one — never a guessed industry. */
  category: string;
  categoryKnown: boolean;
  /** How the business makes money (lib/business/businessModel.ts) — declared by the owner, or guessed from the catalogue. */
  businessModels: { models: BusinessModel[]; inferred: boolean };
  city: string | null;
  site: { url: string; published: boolean; pages: SitePage[] } | null;
  home: SitePage | null;
  products: CatalogProduct[];
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
  /** Owner-entered Business Knowledge — things the owner states about their own business. */
  ownerFacts: KnowledgeFact[];
  brand: BrandIdentity;
  /** Brand messaging pillars, kept at the top level because copy checks read them constantly. */
  pillars: string[];
  /**
   * The real, working addresses of the storefront and its products — the
   * ONLY links copy may contain. Null / empty while the site isn't
   * published, because a link to it would lead nowhere.
   *
   * Why this exists: with no store URL in the facts, the AI wrote a promo
   * email whose button pointed to "candlebyqaaf.com/products/lavender-candle"
   * — a domain that does not exist — while the real store was
   * hawlai.online/site/candle-by-qaaf.
   */
  links: {
    store: string | null;
    products: { name: string; url: string }[];
    /** The business's own booking page (/book/[slug]), when it has one. */
    booking?: string | null;
  };
  /**
   * Where today sits in India's festival calendar, and anything on the
   * live site still selling a festival that's over. See
   * lib/expertise/seasonalCalendar.ts.
   */
  season: Season;
  /** Facts that couldn't be read — stated as unknown to the model, never guessed. */
  unreadable: string[];
};

/** Orders that represent real, paid business — the same statuses campaign attribution counts. */
export const PAID_ORDER_STATUSES = new Set(["confirmed", "shipped", "delivered"]);

/** What a business is called when the owner hasn't said. Never "car dealership". */
export const UNKNOWN_CATEGORY = "business";

/** One column list, so every path sees the same product fields. */
export const CATALOG_COLUMNS = "id, name, kind, duration_minutes, booking_url, price, description, images, inventory_count, category, is_active, order_index";

function imageList(images: unknown): string[] {
  return Array.isArray(images) ? images.filter((i): i is string => typeof i === "string" && i.trim().length > 0).map((i) => i.trim()) : [];
}

export function toCatalogProduct(row: Row): CatalogProduct {
  return {
    id: row.id ?? null,
    name: String(row.name ?? "").trim(),
    kind: row.kind === "service" ? "service" : "product",
    durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    bookingUrl: row.booking_url ?? null,
    price: Number(row.price ?? 0),
    description: row.description ?? null,
    images: imageList(row.images),
    inventory: row.inventory_count == null ? null : Number(row.inventory_count),
    category: row.category ?? null,
    active: row.is_active !== false,
  };
}

/**
 * The product catalogue, for paths that need only that (a DM auto-reply,
 * a product ad, a pitch deck) rather than the whole fact set. Same
 * columns, same shape, same active rule as gatherBusinessFacts.
 */
export async function fetchCatalog(
  supabase: any,
  dealershipId: string,
  opts: { limit?: number; includeInactive?: boolean } = {}
): Promise<CatalogProduct[]> {
  let query = supabase.from("products").select(CATALOG_COLUMNS).eq("dealership_id", dealershipId);
  if (!opts.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query.order("order_index", { ascending: true }).limit(opts.limit ?? 40);
  if (error) {
    console.error("[business-facts] catalog unreadable:", error.message);
    return [];
  }
  return (data ?? []).map(toCatalogProduct);
}

/** Products whose name contains `term` — how a person names a product in chat. */
export function matchProducts(products: CatalogProduct[], term: string): CatalogProduct[] {
  const needle = String(term ?? "").trim().toLowerCase();
  if (!needle) return [];
  return products.filter((p) => p.name.toLowerCase().includes(needle));
}

/** The owner's own stated facts (Business Knowledge). */
export async function fetchKnowledgeFacts(supabase: any, dealershipId: string): Promise<KnowledgeFact[]> {
  const { data } = await supabase.from("business_knowledge").select("category, title, content").eq("dealership_id", dealershipId).eq("is_active", true);
  return (data ?? []) as KnowledgeFact[];
}

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

function brandIdentity(profile: Row | null, kit: Row | null): BrandIdentity {
  const colors = Array.isArray(kit?.kit?.colors)
    ? kit!.kit.colors
        .filter((c: any) => c && typeof c.hex === "string")
        .map((c: any) => ({ name: String(c.name ?? ""), hex: String(c.hex), role: String(c.role ?? "") }))
    : [];
  return {
    tone: profile?.tone_of_voice ?? null,
    voice: (profile?.brand_voice as BrandVoiceProfile) ?? null,
    persona: profile?.target_persona && typeof profile.target_persona === "object" ? profile.target_persona : null,
    language: profile?.preferred_language ?? null,
    pillars: Array.isArray(profile?.messaging_pillars) ? profile!.messaging_pillars.filter((p: unknown) => typeof p === "string") : [],
    description: profile?.business_description ?? null,
    colors,
    logoUrl: kit?.logo_url ?? null,
  };
}

export async function gatherBusinessFacts(supabase: any, dealershipId: string): Promise<BusinessFacts> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const unreadable: string[] = [];

  // Every read checked. A failed read becomes "unknown" in the prompt —
  // never an empty list the model would read as "this business has no
  // products / no orders".
  async function read<T>(label: string, query: PromiseLike<{ data: any; error: any }>, empty: T): Promise<T> {
    const { data, error } = await query;
    if (error) {
      unreadable.push(label);
      console.error(`[business-facts] ${label} unreadable:`, error.message);
      return empty;
    }
    return (data ?? empty) as T;
  }

  const today = indiaToday();
  const [dealership, website, products, offers, events, orders, leads, carts, knowledge, brandProfile, brandKit, festivals] = await Promise.all([
    read<Row | null>("business details", supabase.from("dealerships").select("*").eq("id", dealershipId).maybeSingle(), null),
    read<Row | null>(
      "website",
      supabase.from("websites").select("id, slug, published, shipping_mode, shipping_rate, shipping_free_threshold").eq("dealership_id", dealershipId).maybeSingle(),
      null
    ),
    read<Row[]>("products", supabase.from("products").select(CATALOG_COLUMNS).eq("dealership_id", dealershipId).eq("is_active", true).order("order_index", { ascending: true }).limit(25), []),
    read<Row[]>("offers", supabase.from("discount_codes").select("code, discount_type, value, min_order_value, max_uses, used_count, expires_at, is_active").eq("dealership_id", dealershipId).eq("is_active", true), []),
    read<Row[]>("visitor data", supabase.from("page_events").select("event_type").eq("dealership_id", dealershipId).gte("created_at", since), []),
    read<Row[]>("orders", supabase.from("orders").select("status, created_at").eq("dealership_id", dealershipId), []),
    read<Row[]>("leads", supabase.from("leads").select("id").eq("dealership_id", dealershipId), []),
    read<Row[]>("abandoned carts", supabase.from("abandoned_carts").select("id").eq("dealership_id", dealershipId).gte("created_at", since), []),
    read<Row[]>("business knowledge", supabase.from("business_knowledge").select("category, title, content").eq("dealership_id", dealershipId).eq("is_active", true), []),
    read<Row | null>("brand profile", supabase.from("brand_profiles").select("*").eq("dealership_id", dealershipId).maybeSingle(), null),
    read<Row | null>("brand kit", supabase.from("brand_kits").select("*").eq("dealership_id", dealershipId).maybeSingle(), null),
    // Platform-wide, not per business. A window around today is enough
    // for "just ended" through "plan ahead", plus the last loaded date.
    read<SeasonalEventRow[]>(
      "festival dates",
      supabase.from("seasonal_events").select("name, event_date, lead_time_days").gte("event_date", addDaysYmd(today, -120)).order("event_date", { ascending: true }).limit(200),
      []
    ),
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

  // Checkout's own rule for whether a code is live (discounts.ts), not a
  // second copy of it — so copy can't advertise a code checkout refuses.
  const liveOffers = offers
    .filter((o) => discountUsable(o).ok)
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
  const category = String(dealership?.business_category ?? "").trim();
  const brand = brandIdentity(brandProfile, brandKit);

  const season = seasonFor(festivals, today);
  // Only the published site: a draft page reaches no customer.
  if (website?.published) {
    for (const page of pages) {
      for (const text of [...page.headings, ...page.buttons, ...page.paragraphs]) {
        const hit = outOfSeasonFestival(text, festivals, today);
        if (hit && !season.outOfSeason.some((o) => o.where === `the ${page.title || page.slug} page` && o.festival === hit.festival)) {
          season.outOfSeason.push({ ...hit, where: `the ${page.title || page.slug} page`, text });
        }
      }
    }
  }

  return {
    businessName: dealership?.dealership_name ?? "the business",
    category: category || UNKNOWN_CATEGORY,
    categoryKnown: Boolean(category),
    businessModels: effectiveBusinessModels(dealership?.business_models, {
      productCount: products.filter((p) => p.kind !== "service").length,
      serviceCount: products.filter((p) => p.kind === "service").length,
    }),
    city: dealership?.city ?? null,
    site: website ? { url: `/site/${website.slug}`, published: Boolean(website.published), pages } : null,
    home,
    products: products.map(toCatalogProduct),
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
    ownerFacts: knowledge.filter((k) => k?.title || k?.content).map((k) => ({ category: String(k.category ?? ""), title: String(k.title ?? ""), content: String(k.content ?? "") })),
    // Always the Hawlai address, never websites.custom_domain: nothing in
    // the app routes a custom domain to the site yet, so a link to one
    // would be a link to nothing.
    links: {
      ...(website?.slug && website.published
        ? {
            store: storefrontUrl(website.slug),
            products: products.filter((p) => p.id).map((p) => ({ name: String(p.name), url: hawlaiProductUrl(website.slug, String(p.id)) })),
          }
        : { store: null, products: [] }),
      // Works whether or not the website is published.
      booking: bookingPageUrl(dealership?.booking_slug, siteBase()),
    },
    season,
    brand,
    pillars: brand.pillars,
    unreadable,
  };
}

/**
 * The facts, or null if they couldn't be gathered at all. Callers that
 * publish with no human in between treat null as "don't publish".
 */
export async function gatherBusinessFactsSafely(supabase: any, dealershipId: string): Promise<BusinessFacts | null> {
  try {
    return await gatherBusinessFacts(supabase, dealershipId);
  } catch (err: any) {
    console.error("[business-facts] couldn't gather facts:", err?.message);
    return null;
  }
}

/** The storefront's public address — the same base the product links use. */
export function storefrontUrl(slug: string): string {
  return `${siteBase()}/site/${slug}`;
}

function siteBase(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://hawlai.online";
}

/** Items customers buy (and may have shipped). */
export function physicalProducts(f: Pick<BusinessFacts, "products">): CatalogProduct[] {
  return f.products.filter((p) => !isService(p));
}

/** Items customers book. */
export function serviceItems(f: Pick<BusinessFacts, "products">): CatalogProduct[] {
  return f.products.filter((p) => isService(p));
}

/** Where a customer books a service: its own link, else the business's booking page. Null when there's nowhere. */
export function bookingLinkFor(p: CatalogProduct, f: Pick<BusinessFacts, "links">): string | null {
  return p.bookingUrl || f.links?.booking || null;
}

function addDaysYmd(ymd: string, days: number): string {
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function describeShipping(s: BusinessFacts["shipping"]): string {
  if (!s) return "not set up";
  if (s.mode === "free") return "free on every order";
  if (s.mode === "free_above") return `free on orders above ₹${s.freeThreshold ?? "?"}, otherwise ₹${s.rate ?? "?"}`;
  return `₹${s.rate ?? "?"} flat on every order (NOT free)`;
}

function describeProduct(p: CatalogProduct): string {
  const bits = [`${p.name} — ₹${p.price}`];
  if (isService(p)) {
    const d = formatDuration(p.durationMinutes);
    if (d) bits.push(`(${d})`);
  }
  if (p.description) bits.push(`(${p.description.slice(0, 100)})`);
  if (!isService(p) && p.inventory === 0) bits.push("(out of stock)");
  return bits.join(" ");
}

/** The catalogue lines: products and services listed separately, so copy never offers to ship a haircut. */
function catalogueLines(f: BusinessFacts, describe: (p: CatalogProduct) => string): string[] {
  const goods = physicalProducts(f);
  const services = serviceItems(f);
  if (!goods.length && !services.length) return ["What it offers: nothing listed in the catalogue yet."];
  const lines: string[] = [];
  if (goods.length) lines.push(`Products (${goods.length}): ${goods.map(describe).join("; ")}`);
  if (services.length) lines.push(`Services (${services.length}, booked — not bought or shipped): ${services.map(describe).join("; ")}`);
  return lines;
}

/** How the business describes itself — used wherever "what do they sell" must be stated plainly. */
export function describeBusiness(f: BusinessFacts): string {
  if (!f.categoryKnown) {
    if (!f.products.length) return `"${f.businessName}"`;
    const verb = physicalProducts(f).length ? "sells" : "offers";
    return `"${f.businessName}", which ${verb} ${f.products.slice(0, 3).map((p) => p.name).join(", ")}`;
  }
  return `"${f.businessName}", a ${f.category} business${f.city ? ` in ${f.city}` : ""}`;
}

/** The VERIFIED FACTS block for CRO — site structure first, since CRO is about the page. */
export function formatFactsForPrompt(f: BusinessFacts): string {
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
  lines.push(...catalogueLines(f, (p) => `${p.name} — ₹${p.price}`));
  lines.push(f.offers.length ? `Active discount codes: ${f.offers.map((o) => `${o.code} (${o.label})`).join("; ")}` : "Active discount codes: none.");
  if (physicalProducts(f).length) lines.push(`Shipping: ${describeShipping(f.shipping)}.`);
  const l = f.last30;
  lines.push(
    `Last 30 days: ${l.views} page views, ${l.chatOpens} chat opens, ${l.leads} leads captured, ${l.orders} orders, ${l.abandonedCarts} abandoned carts.` +
      (l.conversionRate !== null ? ` View-to-order conversion: ${l.conversionRate}%.` : " Too little traffic for a reliable conversion rate.") +
      (l.cartAbandonmentRate !== null ? ` Cart abandonment: ${l.cartAbandonmentRate}%.` : "")
  );
  lines.push(`All time: ${f.allTime.paidOrders} paid order(s), ${f.allTime.leads} lead(s).`);
  for (const o of f.season?.outOfSeason ?? []) lines.push(`Out of season: ${o.where} still says "${o.text.slice(0, 80)}" — ${o.festival} was ${o.endedDaysAgo} days ago.`);
  if (f.unreadable.length) lines.push(`Couldn't be read right now (treat as unknown, do not guess): ${f.unreadable.join(", ")}.`);
  return lines.join("\n");
}

/** The VERIFIED FACTS block for marketing copy — what a post, email, message or plan may claim. */
export function formatFactsForCopy(f: BusinessFacts): string {
  const lines: string[] = [`VERIFIED FACTS about ${describeBusiness(f)} — the only things you may state as true:`];
  lines.push(
    f.categoryKnown
      ? `Business category: ${f.category}${f.city ? ` — based in ${f.city}` : ""}`
      : "Business category: NOT SET by the owner — don't assume an industry; write only about the products listed below, and suggest they set their category in Settings."
  );
  const bm = f.businessModels;
  lines.push(
    bm && bm.models.length
      ? `How the business makes money: ${describeBusinessModels(bm.models)}${bm.inferred ? " (guessed from its catalogue — not confirmed by the owner)" : ""}.`
      : "How the business makes money: not set — don't assume it sells products, services or subscriptions beyond what's listed here."
  );
  lines.push(...catalogueLines(f, describeProduct));
  lines.push(f.offers.length ? `Active offers: ${f.offers.map((o) => `code ${o.code} — ${o.label}`).join("; ")}` : "Active offers: none — do not write any discount, sale or offer.");
  // Shipping only means something when something physical is sold.
  if (physicalProducts(f).length) lines.push(`Shipping: ${describeShipping(f.shipping)}.`);
  else if (serviceItems(f).length) lines.push("Shipping: not applicable — nothing physical is sold. Never mention shipping or delivery charges.");
  const booked = serviceItems(f).filter((p) => bookingLinkFor(p, f));
  if (booked.length) lines.push(`Booking links (the ONLY addresses for booking): ${booked.map((p) => `${p.name} — ${bookingLinkFor(p, f)}`).join("; ")}`);
  if (f.links?.store) {
    lines.push(`Store link (the ONLY website address you may use): ${f.links.store}`);
    if (f.links.products.length) lines.push(`Product links: ${f.links.products.map((p) => `${p.name} — ${p.url}`).join("; ")}`);
  } else {
    lines.push("Store link: none — the website isn't published, so do not include any website link at all.");
  }
  lines.push(`Track record: ${f.allTime.paidOrders} paid order(s) and ${f.allTime.leads} lead(s) on record. No ratings or reviews on record.`);
  // The owner's own story, in full — the specifics that make copy about
  // THIS business impossible to write about any other one. Never truncated
  // to 200 characters the way the other notes are: the detail IS the point.
  const story = f.ownerFacts.filter((k) => k.category === STORY_CATEGORY);
  if (story.length) {
    lines.push("The owner's own story — use these specifics; they are what makes this business different:");
    for (const k of story) lines.push(`- ${k.title}: ${k.content}`);
  }
  const otherFacts = f.ownerFacts.filter((k) => k.category !== STORY_CATEGORY);
  if (otherFacts.length) {
    lines.push("What the owner says about the business:");
    for (const k of otherFacts.slice(0, 12)) lines.push(`- ${k.title}: ${k.content.slice(0, 200)}`);
  }
  if (f.brand.description) lines.push(`How the owner describes the business: ${f.brand.description.slice(0, 300)}`);
  if (f.brand.pillars.length) lines.push(`Brand messaging pillars (the owner's own words): ${f.brand.pillars.join("; ")}`);
  if (f.brand.tone) lines.push(`Brand tone: ${f.brand.tone}`);
  if (f.brand.language) lines.push(`Preferred language: ${f.brand.language}`);
  if (f.home) {
    const said = [f.home.headings[0], ...f.home.paragraphs.slice(0, 2)].filter(Boolean).join(" ").slice(0, 400);
    if (said) lines.push(`What the website says: "${said}"`);
  }
  if (f.season) lines.push(formatSeason(f.season));
  // How this business sounds. It was gathered into the facts but only ever
  // reached chat, so every other generator wrote in a house voice.
  if (f.brand?.voice || f.brand?.tone) lines.push(formatBrandVoiceSection(f.brand.voice, f.brand.tone).trim());
  if (f.unreadable.length) lines.push(`Couldn't be read right now (unknown — don't guess): ${f.unreadable.join(", ")}.`);
  return lines.join("\n");
}

/**
 * The rules every copy prompt carries. Low-friction by design: the
 * model can still write persuasively about the product — it just can't
 * invent facts, offers, rankings or health claims.
 */
export const COPY_TRUTH_RULES = `TRUTH RULES — a small business owner may publish this as-is, and a false advertising claim is their legal risk (Consumer Protection Act 2019, ASCI code):
- State as fact only what the VERIFIED FACTS say. Describing a product's look, feel or use in your own words is fine; inventing facts about it is not.
- NEVER invent numbers: customer, order or review counts ("500+ happy customers"), ratings or stars, years in business, sales figures, or results ("2x more", "30% better").
- NEVER write an offer, discount, sale price, free shipping, gift, guarantee, money-back promise or "selling fast / only 3 left" urgency unless it is in the facts. With no active offer, sell the product itself.
- NEVER call the business or a product the best, #1, top-rated, best-selling, cheapest, most trusted or better than competitors unless the facts say so. Say what makes it good instead.
- NEVER make health, medical, safety or efficacy claims (cures, heals, relieves stress or anxiety, clinically proven, doctor recommended, 100% safe) unless the facts state them.
- Hooks and calls to action follow the same rules: a bold hook is a bold idea, not an invented statistic.
- NEVER invent a website address, domain or link. Use only the store and product links in the facts, exactly as written. If there is none, write the call to action without a link.
${SEASON_TRUTH_RULE}`;

/** The facts block plus the rules — what a generation prompt appends. */
export function factsPrompt(f: BusinessFacts | null | undefined): string {
  return f ? `\n\n${formatFactsForCopy(f)}\n\n${COPY_TRUTH_RULES}\n` : "";
}

export function normalise(s: string): string {
  return s.toLowerCase().replace(/[‐‑–—-]/g, " ").replace(/['’]/g, "'").replace(/\s+/g, " ").trim();
}

/** Everything the business itself says — on its site, in its catalogue, in its own words. What a claim is checked against. */
export function knownText(f: BusinessFacts): string {
  const parts: string[] = [];
  for (const p of f.site?.pages ?? []) parts.push(...p.headings, ...p.paragraphs, ...p.buttons, p.metaDescription ?? "");
  for (const p of f.products) parts.push(p.name, p.description ?? "");
  for (const o of f.offers) parts.push(o.label);
  for (const k of f.ownerFacts ?? []) parts.push(k.title, k.content);
  parts.push(...(f.brand?.pillars ?? f.pillars ?? []));
  if (f.links?.store) parts.push(f.links.store);
  for (const p of f.links?.products ?? []) parts.push(p.url);
  if (f.links?.booking) parts.push(f.links.booking);
  for (const p of f.products) if (p.bookingUrl) parts.push(p.bookingUrl);
  if (f.brand?.description) parts.push(f.brand.description);
  return normalise(parts.join(" \n "));
}
