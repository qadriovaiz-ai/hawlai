# How flexible is the website builder, really?

Read-only investigation, 19 November 2026. **No code was changed.**

The question: can a business of any type build a site it is happy with,
the way a Shopify merchant can — or does the builder assume one kind of
business?

---

## 1. What it actually is

A **primitive block builder**, not a section-preset builder. Thirteen
types in `lib/blocks/registry.ts`:

| | |
|---|---|
| **Layout** | `section`, `stack`, `spacer`, `divider` |
| **Content** | `heading`, `text`, `image`, `button`, `video` |
| **Structured** | `form`, `faq` + `faq_item`, `product_grid` |

That is a different shape from Shopify. Shopify gives a merchant
high-level **sections** — a hero, a testimonial carousel, a featured
collection, a multi-column — each with its own settings. Hawlai gives
the pieces those sections are made from, in a drag-and-drop tree.

**That is more flexible in principle and harder in practice.** Anything
can be built; nothing arrives already built. A shopkeeper who wants a
testimonial row has to compose it from a section, a stack, three
images, three headings and three text blocks — and decide the spacing.

---

## 2. The good news, which is better than the labels suggest

**Services are first-class, and I expected them not to be.**
`ProductCatalog` reads `kind === "service"` and renders a genuinely
different card: the duration instead of stock, a **Book now** button
pointing at the item's `booking_url`, and no add-to-cart. A salon, a
clinic or a coaching institute can list what it sells and take a
booking through the same block a candle shop uses for its candles.

**The FAQ block is machine-readable**, and deliberately so. A2 of the
AEO plan replaced a generic heading+text pair with a real
question/answer pair so `FAQPage` schema could be emitted. The
reasoning there — "the words survived and the machine-readable fact
that one is a question and the other is its answer did not" — is the
single best idea in this builder.

**Nothing in the renderer assumes a trade.** No product noun, no
category word. Rule 3 holds where it matters.

**Opening hours and the address already reach `LocalBusiness` schema**
(`lib/seo/structuredData.ts`), sourced from the interview's listing
facts rather than from a block.

---

## 3. The limits, in the order I would fix them

### 3a. The vocabulary assumes products, even though the behaviour does not

`product_grid` is labelled **"Product Grid"**, its default heading is
**"Our Products"**, and its icon is a package. A salon owner opening the
builder sees no block for their services — the one that would serve them
is named after something they do not sell.

This is the cheapest meaningful fix in the whole investigation: the
block already behaves correctly for both, so the label and the default
heading should follow the business's own model
(`dealerships.business_models` already distinguishes products from
services). **Size: S.**

It is also a Rule 3 leak of the kind `multiTenantVocabulary` exists to
catch — that test guards code and prompts, and this is UI copy in a
registry, so it sits just outside what the test reads.

### 3b. The page knows the opening hours and the visitor does not

`LocalBusiness` schema carries `openingHoursSpecification` and the
address. A search engine can read them. **A human looking at the page
cannot**, unless the owner typed them a second time into a text block —
and then there are two copies that can disagree, with only one of them
guarded.

This is exactly the argument that justified `faq_item`, applied to the
facts the interview already collects. An **`hours`** block and an
**`address`** block, rendering from `business_listing_facts` the way
`product_grid` renders from `products` — never hand-filled, never
AI-authored, one source. **Size: M each.** This is the one I would do
first on merit, because it closes a disagreement rather than adding a
feature.

### 3c. The blocks most service businesses reach for are missing

No testimonial/review block, no pricing table, no team or staff block,
no gallery, no map, no trust/logo bar, no newsletter capture. Each can
be faked with primitives, which is the builder's design — but a faked
testimonial is a `text` block, so **nothing downstream can tell a
customer quote from a sentence the business wrote about itself.** That
is the `faq_item` problem again, and it matters most for the one block
where attribution is the whole point.

A `review` block whose props are the quote and the attributed name, fed
from recorded reviews rather than typed, would be worth more than the
other five combined. **Size: M**, and it would want the claims guard's
view on attribution.

### 3d. Four palettes and no typography

`landingThemes.ts` offers four colour pairs — background, dark, accent,
accent text. No font choice, no spacing scale, no corner radius, no
section background override.

The file's own comment defends this, and the defence is sound: "a theme
picker, not a free-form visual editor… keeps every page looking
intentional, not random combinations." For a non-technical owner that is
the right trade.

But it does mean **every Hawlai site is one of four looks**, and a
business whose brand has a colour will not find it. The smallest honest
improvement is a custom accent colour validated for contrast against the
two fixed backgrounds — one field, not a theme editor. **Size: S**, and
it should be measured against the reason the presets exist before being
built.

### 3e. An AI-built page cannot include the catalogue

`AI_BLOCK_TYPES` excludes `product_grid` deliberately — the model must
never author a product list. Correct. The consequence is that an
AI-generated page for a shop has no catalogue until a human adds the
block, and nothing currently tells them to. **Size: S** — a line in the
builder after generation, not a code problem.

---

## 4. The answer to the question asked

**For a product business: close to Shopify in capability, well short in
convenience.** Everything needed is present; more of it has to be
assembled by hand.

**For a service business: more capable than it looks, and worse
signposted than it is.** The catalogue block already does bookings and
durations; the builder never says so.

**For any business: the visual range is four palettes.** That is the
real ceiling, and it is a deliberate one.

**What I would actually build, in order:** 3a (S, mislabelling), then
3b (M, the hours the visitor cannot see), then 3c's review block (M).
The first two are corrections rather than features — a wrong word and a
fact the page knows but will not show.

**Not recommended without a decision:** 3d. The preset-only palette is
a considered trade-off with its reasoning written down, and loosening it
is a product call, not a gap.
