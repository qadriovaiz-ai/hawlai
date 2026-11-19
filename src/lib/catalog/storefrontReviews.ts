// A customer's own words, kept as a customer's own words.
//
// ─────────────────────────────────────────────────────────────────────
// WHY THIS IS NOT A TEXT BLOCK
// ─────────────────────────────────────────────────────────────────────
//
// Nothing stopped an owner putting a quote in a `text` block and a name
// underneath it — and once there, it is a sentence like any other. The
// claims guard reads it as the business's own words, the facts layer
// cannot tell a customer apart from the shop, and a visitor has only
// the typography to go on.
//
// So the distinction that matters most — "a customer said this" versus
// "the business says this about itself" — was carried by nothing but
// quotation marks. This is the faq_item problem on the one block where
// attribution IS the content.
//
// ─────────────────────────────────────────────────────────────────────
// WHAT personalStories.ts SAYS ABOUT THIS, AND IT IS THE HARD PART
// ─────────────────────────────────────────────────────────────────────
//
// That file exists because a real customer wrote to this business that
// her husband had been in an accident and she lit one of its candles
// through the hours of waiting at the hospital. The owner wrote it
// down because it moved her. It is the most powerful thing in the file
// and IT IS NOT HERS TO PUBLISH — so the guard withholds stories about
// an identifiable third party from generation entirely.
//
// A `reviews` row is a different thing, and the difference is the
// PURPOSE IT WAS WRITTEN FOR, not how private it sounds. A review is
// submitted through the storefront, by the customer, after an order,
// into a form whose whole point is public display beside the product.
// The consent is in the mechanism.
//
// A STORY THE OWNER TRANSCRIBED IS NOT. Nothing here may ever read
// `business_knowledge` — a sentence the owner recorded about what a
// customer told her is exactly the hospital story, whatever words it
// happens to contain, and the owner's moderation flag on a review is
// not consent given by somebody who never submitted anything.
//
// That is the whole rule: this block reads rows a customer chose to
// write for display, and no other source, ever.

/** One review, as a page may show it. */
export type StorefrontReview = {
  id: string;
  /** The customer's own sentence. Never edited, never AI-rewritten. */
  comment: string;
  /** As they gave it. Not initials, not "a happy customer". */
  name: string;
  rating: number;
  /** The product it is about, when the page wants to say. */
  productName: string | null;
};

/** More than this on one page is a wall, not evidence. */
export const MAX_SHOWN = 6;

/** The shortest comment worth calling a testimonial. */
export const MIN_COMMENT_CHARS = 12;

/**
 * The reviews this business may show.
 *
 * FOUR FILTERS, AND EACH IS SOMEBODY'S DECISION:
 *
 *   is_hidden        the OWNER moderated it away. Her call, honoured.
 *   a real comment   a bare five stars is a rating, not a testimonial.
 *                    Showing it as one puts words in nobody's mouth,
 *                    but it does dress a number up as a quote.
 *   a real name      an empty name would have to be filled in with
 *                    something, and every option — "A customer",
 *                    "Anonymous" — is Hawlai writing the attribution
 *                    rather than the customer. Skipped instead.
 *   newest first     so a page shows what the business is like now.
 */
export async function loadStorefrontReviews(supabase: any, dealershipId: string): Promise<StorefrontReview[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, comment, customer_name, rating, is_hidden, created_at, products(name)")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(50);

  // A FAILED READ IS NOT "NO REVIEWS". The block renders nothing
  // either way, which is the same outcome — but it must not be
  // recorded or reasoned about as the business having none.
  if (error || !Array.isArray(data)) return [];

  const out: StorefrontReview[] = [];
  for (const row of data) {
    if (row?.is_hidden === true) continue;
    const comment = String(row?.comment ?? "").trim();
    const name = String(row?.customer_name ?? "").trim();
    const rating = Number(row?.rating);
    if (comment.length < MIN_COMMENT_CHARS) continue;
    if (!name) continue;
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
    out.push({
      id: String(row.id),
      comment,
      name,
      rating: Math.round(rating),
      productName: typeof row?.products?.name === "string" ? row.products.name : null,
    });
    if (out.length >= MAX_SHOWN) break;
  }
  return out;
}
