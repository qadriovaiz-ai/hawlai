// Shopify as a PublishPlatform.
//
// THE ONLY FILE PERMITTED TO WRITE TO SHOPIFY. That is enforced by
// tests/publishContract.test.ts, which fails if a mutation signature
// appears anywhere outside src/lib/publish/platforms/ — because a rule
// that lives only in a convention gets bypassed by the next person in
// a hurry, and every approval test stays green while it happens.
//
// FOR REVIEW. Nothing calls this yet: no tool definition, no executor
// loop. It implements the interface and stops there, deliberately, so
// the write path can be read on its own before anything can reach it.

import {
  type PublishPlatform,
  type PublishActionRecord,
  type PreviewResult,
  type ExecuteResult,
  type FieldChange,
  type ActionKey,
  type UndoProposal,
} from "@/lib/publish/types";
import { shopifyGraphQL, shopifyMutation } from "@/lib/commerce/shopifyGraphQL";
import { publishLog, publishError } from "@/lib/publish/log";
import { formatMoney, describeCurrency } from "@/lib/publish/money";

/** One variant's current state — the before-values a preview is built from. */
const VARIANT_QUERY = `
  query PublishVariant($id: ID!) {
    # The store's own currency. Without it the preview emits a bare
    # number and the model supplies a symbol from context — which
    # showed a USD store's price as rupees on the first live test.
    shop { currencyCode }
    productVariant(id: $id) {
      id
      title
      price
      product { id title status featuredImage { url } }
    }
  }
`;

/**
 * The current mutation for variant prices. Takes a productId and an
 * array of variants — Shopify moved price updates to this bulk form,
 * so even a single-variant change goes through it.
 */
const PRICE_MUTATION = `
  mutation PublishPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────
// CONTENT — pages and blog articles (3.2)
// ─────────────────────────────────────────────────────────────────────
//
// `write_content` has been granted since 4 September 2026 and nothing
// used it. These reuse the ActionKeys the built-in site already
// defines — `update_page_text` and `update_page_meta` — rather than
// inventing shopify-shaped twins, so the tool layer, the approval
// registry and undo all behave the same whichever surface the owner's
// page lives on.
//
// SEO IS A FIELD, NOT A METAFIELD. `seo { title description }` sits on
// the Page itself, which is why 3.1 asked for no metafield scope.
const PAGE_QUERY = `
  query PublishPage($id: ID!) {
    page(id: $id) {
      id
      title
      handle
      body
      isPublished
      seo { title description }
    }
  }
`;

const PAGE_MUTATION = `
  mutation PublishPageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id title body seo { title description } }
      userErrors { field message }
    }
  }
`;

// A BLOG, NOT A BLOG POST. An article has to be created inside one,
// and a store can have several — so the blog is read first and the
// absence of any is a refusal rather than a guess.
const BLOGS_QUERY = `
  query PublishBlogs {
    blogs(first: 10) {
      nodes { id title handle }
    }
  }
`;

const ARTICLE_MUTATION = `
  mutation PublishArticleCreate($article: ArticleCreateInput!) {
    articleCreate(article: $article) {
      article { id title handle isPublished }
      userErrors { field message }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────
// COLLECTIONS (3.3)
// ─────────────────────────────────────────────────────────────────────
//
// A collection is a group of products with a page of its own, and the
// thing a merchant asks to change is the paragraph above the grid.
//
// `write_products` COVERS THIS, not `write_content` — Shopify's own
// docs for collectionUpdate say so, and that scope has been granted
// since 4 September 2026. So this needed no scope widening.
//
// TWO ARGUMENT FORMS EXIST and the older one is a trap. As of API
// 2026-07 (the version pinned in shopifyAuth.ts) `collectionUpdate`
// takes `collection: CollectionUpdateInput!` with the id INSIDE the
// object, and the `input: CollectionInput!` form that several of
// Shopify's own examples still use is marked Deprecated. Verified
// against the version-pinned documentation on 20 November 2026 rather
// than the "latest" alias, which resolves to 2026-10 and would have
// been the wrong page to read.
const COLLECTION_QUERY = `
  query PublishCollection($id: ID!) {
    collection(id: $id) {
      id
      title
      handle
      descriptionHtml
      productsCount { count }
    }
  }
`;

const COLLECTION_MUTATION = `
  mutation PublishCollectionUpdate($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      collection { id title descriptionHtml }
      userErrors { field message }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────
// FILES (3.3b)
// ─────────────────────────────────────────────────────────────────────
//
// `write_files` was released in app version 4 on 20 November 2026 and
// this is the first thing to use it.
//
// SHOPIFY FETCHES THE IMAGE; we do not upload bytes. `originalSource`
// accepts an external HTTPS URL, which is exactly the shape every
// picture this product makes already has — a public URL in its own
// storage bucket. So there is no staged upload and no multipart body.
//
// PROCESSING IS ASYNCHRONOUS, in Shopify's own words: "Files are
// processed asynchronously. Check the fileStatus field to monitor
// processing completion." So `image.url` can be null on a perfectly
// successful create, and the honest report is "created, still
// processing" rather than a null URL dressed up as one. Deliberately
// NO polling loop: the file exists either way, and a route that waits
// on Shopify's image pipeline is a route that times out.
//
// Verified against the 2026-07 documentation on 20 November 2026, not
// the "latest" alias.
const FILE_MUTATION = `
  mutation PublishFileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        alt
        ... on MediaImage {
          image { url }
        }
      }
      userErrors { field message code }
    }
  }
`;

/** Shopify's own limit, and it rejects the whole create when exceeded. */
const ALT_LIMIT = 512;

type CreatedFile = {
  id: string;
  fileStatus: string;
  alt: string | null;
  image?: { url: string | null } | null;
};

type CollectionNode = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string | null;
  productsCount: { count: number } | null;
};

type PageNode = {
  id: string;
  title: string;
  handle: string;
  body: string | null;
  isPublished: boolean;
  seo: { title: string | null; description: string | null } | null;
};

type BlogNode = { id: string; title: string; handle: string };

type ShopNode = { currencyCode: string };

type VariantNode = {
  id: string;
  title: string;
  price: string;
  product: { id: string; title: string; status: string; featuredImage?: { url: string } | null };
};

/** Money comparison by VALUE, not by string. "999" and "999.00" are the same price. */
function samePrice(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a === b;
  return Math.abs(na - nb) < 0.005;
}

/**
 * Where an image may come from, and it is not anywhere.
 *
 * An arbitrary URL in `requestedChanges` is an injection surface: a
 * page or a document that says "upload this image" would otherwise put
 * a stranger's file into a merchant's store under the merchant's own
 * name. So the source must be a picture THIS PRODUCT made, which means
 * the storage origin it writes them to.
 *
 * Read from configuration rather than written down, both because the
 * origin differs per deployment and because Rule 3 has no room for a
 * hardcoded host. `replyLinks.ts` already treats the same value as
 * "where Hawlai puts the pictures it makes", for the same reason.
 *
 * NOT CONFIGURED MEANS NOTHING PASSES. A missing origin makes every
 * source fail the check, which is the safe direction — an upload is
 * never the urgent half of anything.
 */
function sourceAllowed(url: string): boolean {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!origin) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return u.host === new URL(origin).host;
  } catch {
    return false;
  }
}

export function createShopifyPlatform(deps: {
  /** Resolves a usable access token — see getValidShopifyAccessToken. */
  getCredentials: (dealershipId: string) => Promise<{ shop: string; accessToken: string } | null>;
  fetchImpl?: typeof fetch;
}): PublishPlatform {
  const fetchImpl = deps.fetchImpl ?? fetch;

  /**
   * Shopify's capabilities — what is BUILT, not what is planned.
   *
   * update_product_description and create_discount_code were briefly
   * listed here with preview() returning an honest "not built yet".
   * Removed: a declared capability is a promise the tool layer reads,
   * and an honest failure at the end of a flow is still a flow the
   * assistant should never have offered. They come back when they
   * work.
   *
   * publish_post WAS absent, on the reasoning that "Shopify is not a
   * CMS in the sense those mean". THAT WAS WRONG (20 November 2026):
   * Shopify has Blog and Article objects, `write_content` covers them,
   * and that scope has been granted since 4 September. A blog post on
   * a Shopify store is a blog post.
   *
   * update_post is still absent, and now for an honest reason rather
   * than that one: editing an existing article is a separate read and
   * a separate staleness contract, and it is not built yet.
   *
   * NO MENU ACTION. This comment USED TO SAY "Shopify has no menu API
   * at all — there is no menu scope and no menu object". THAT WAS
   * FALSE, found on 20 November 2026 by checking it instead of
   * trusting it. The 2026-07 Admin API has a `Menu` object (read scope
   * `read_online_store_navigation`) and both `menuCreate` and
   * `menuUpdate` (write scope `write_online_store_navigation`).
   *
   * The real reasons, and they are better ones:
   *
   * 1. THE SCOPE IS NOT GRANTED. App version 4 declares
   *    write_products, write_content and write_files. Nothing
   *    navigation-related. Declaring a menu action here would offer
   *    the owner something that fails at Shopify's door — and getting
   *    the scope means a new app version AND every connected merchant
   *    re-approving, which is the 3.1 cost paid a second time.
   *
   * 2. `menuUpdate` REPLACES THE WHOLE MENU. `items` is required and
   *    is the complete list, as is `title`. So changing one link means
   *    reading the entire menu and writing all of it back, and any
   *    item shape the read did not understand is an item the write
   *    silently drops. Every other action in this file touches one
   *    field of one object. A menu edit rewrites the merchant's whole
   *    navigation, which is a different risk class and needs its own
   *    staleness contract rather than a place in someone else's phase.
   *
   * A declared capability is a promise the tool layer reads, so the
   * absence here is what stops the assistant offering a menu edit on a
   * Shopify store. tests/shopifyMenuUnsupported.test.ts pins it, and
   * pins that this comment does not go back to the false reason.
   */
  const supports: readonly ActionKey[] = [
    "update_product_price",
    "update_page_text",
    "update_page_meta",
    "publish_post",
    "update_collection_text",
    "upload_image",
  ];

  /**
   * Which of those can be put back, declared rather than inferred.
   *
   * A TEST FORCED THIS INTERFACE CHANGE, and it was right to.
   * `undoExistsFor` asked `typeof platform.undo === "function"` — a
   * question about the PLATFORM standing in for a question about the
   * KEY. That held while a platform either undid everything it did or
   * nothing. Shopify now undoes a page edit and not a price change, so
   * the proxy started answering "yes" for prices.
   *
   * publish_post is absent: un-creating a post is a deletion, and a
   * deletion is not the reverse of a creation in any sense an owner
   * would accept — the article may have been edited since. It is
   * created unpublished, so nothing went live to take back.
   */
  const undoes: readonly ActionKey[] = ["update_page_text", "update_page_meta", "update_collection_text"];

  async function readPage(shop: string, token: string, pageId: string): Promise<PageNode | null> {
    const result = await shopifyGraphQL<{ page: PageNode | null }>(shop, token, PAGE_QUERY, { id: pageId }, fetchImpl);
    return result.ok ? result.data.page ?? null : null;
  }

  async function readBlogs(shop: string, token: string): Promise<BlogNode[] | null> {
    const result = await shopifyGraphQL<{ blogs: { nodes: BlogNode[] } }>(shop, token, BLOGS_QUERY, {}, fetchImpl);
    // NULL IS NOT AN EMPTY LIST. "Could not read your blogs" and "this
    // store has no blog" lead to different sentences, and only one of
    // them is the merchant's to fix.
    return result.ok ? result.data.blogs?.nodes ?? [] : null;
  }

  async function readCollection(shop: string, token: string, id: string): Promise<CollectionNode | null> {
    const result = await shopifyGraphQL<{ collection: CollectionNode | null }>(
      shop,
      token,
      COLLECTION_QUERY,
      { id },
      fetchImpl
    );
    return result.ok ? result.data.collection ?? null : null;
  }

  async function readVariant(
    shop: string,
    token: string,
    variantId: string
  ): Promise<(VariantNode & { currencyCode: string | null }) | null> {
    const result = await shopifyGraphQL<{ productVariant: VariantNode | null; shop: ShopNode }>(
      shop,
      token,
      VARIANT_QUERY,
      { id: variantId },
      fetchImpl
    );
    if (!result.ok) return null;
    if (!result.data.productVariant) return null;
    return { ...result.data.productVariant, currencyCode: result.data.shop?.currencyCode ?? null };
  }

  return {
    id: "shopify",
    supports,
    undoes,

    async isConnected(dealershipId: string): Promise<boolean> {
      return (await deps.getCredentials(dealershipId)) !== null;
    },

    async preview(action: PublishActionRecord): Promise<PreviewResult> {
      if (!supports.includes(action.actionKey)) {
        return { ok: false, reason: `Shopify cannot do "${action.actionKey}".` };
      }
      const creds = await deps.getCredentials(action.dealershipId);
      if (!creds) return { ok: false, reason: "Shopify isn't connected." };
      // ---- content: a page's text, or its search title ------------
      if (action.actionKey === "update_page_text" || action.actionKey === "update_page_meta") {
        if (!action.targetRef) return { ok: false, reason: "No page was specified." };
        const page = await readPage(creds.shop, creds.accessToken, action.targetRef);
        if (!page) return { ok: false, reason: "That page no longer exists in Shopify." };

        const changes: FieldChange[] = [];
        const warnings: string[] = [];

        if (action.actionKey === "update_page_text") {
          const body = typeof action.requestedChanges.html === "string" ? action.requestedChanges.html : null;
          if (body === null) return { ok: false, reason: "No new text was given for that page." };
          // THE WHOLE BODY IS THE BEFORE-VALUE, not a diff. Undo is
          // built from preview.changes[].before, so anything less than
          // the complete prior body is an undo that loses text.
          changes.push({ field: "body", before: page.body ?? "", after: body });
          if ((page.body ?? "").trim() === body.trim()) {
            warnings.push("The page already reads this way — approving will change nothing.");
          }
        } else {
          const title = typeof action.requestedChanges.metaTitle === "string" ? action.requestedChanges.metaTitle : null;
          const description =
            typeof action.requestedChanges.metaDescription === "string" ? action.requestedChanges.metaDescription : null;
          if (title === null && description === null) {
            return { ok: false, reason: "No search title or description was given." };
          }
          if (title !== null) changes.push({ field: "seoTitle", before: page.seo?.title ?? "", after: title });
          if (description !== null) {
            changes.push({ field: "seoDescription", before: page.seo?.description ?? "", after: description });
          }
        }

        if (!page.isPublished) {
          warnings.push("This page is not published in Shopify, so the change won't be visible to customers yet.");
        }

        return {
          ok: true,
          preview: {
            summary: `"${page.title}" (/pages/${page.handle}): ${
              action.actionKey === "update_page_text" ? "page text" : "search title and description"
            } updated`,
            // A page has no price. Stated as null rather than omitted,
            // because the shape is shared with the product preview and a
            // missing field would read as unknown rather than as absent.
            target: { title: page.title, variantTitle: null, currentPrice: null, imageUrl: null },
            changes,
            warnings,
          },
        };
      }

      // ---- files: a picture into the store's own library ----------
      if (action.actionKey === "upload_image") {
        const src = typeof action.requestedChanges.imageUrl === "string" ? action.requestedChanges.imageUrl.trim() : "";
        if (!src) return { ok: false, reason: "No picture was given to upload." };
        if (!sourceAllowed(src)) {
          // The reason says WHOSE picture is acceptable rather than
          // naming the host, which would read as a configuration error
          // to the one person who cannot fix it.
          return {
            ok: false,
            reason: "That picture isn't one Hawlai made, so it can't be uploaded to the store.",
          };
        }
        const alt = typeof action.requestedChanges.alt === "string" ? action.requestedChanges.alt : "";
        if (alt.length > ALT_LIMIT) {
          // REFUSED, NOT TRUNCATED. Shortening it silently would mean
          // the approver agreed to words that are not the words
          // written — and Shopify rejects the whole create anyway.
          return { ok: false, reason: `The description of the picture is longer than ${ALT_LIMIT} characters.` };
        }

        const filename = typeof action.requestedChanges.filename === "string" ? action.requestedChanges.filename.trim() : "";
        return {
          ok: true,
          preview: {
            summary: `Add a picture to this store's file library${filename ? ` as "${filename}"` : ""} — not placed on any page`,
            // The picture itself IS the target here, which is what
            // `imageUrl` on the preview is for: the approver looks at
            // the image rather than reading a URL.
            target: { title: filename || "Picture", variantTitle: null, currentPrice: null, imageUrl: src },
            // `before: null` IS WHAT MARKS A CREATION. There is no
            // prior value, and undoing a creation is a different
            // decision from undoing an edit.
            changes: [{ field: "file", before: null, after: src }],
            warnings: [
              "This only adds the picture to the store's file library. No customer sees it until something puts it on a page.",
            ],
          },
        };
      }

      // ---- content: a collection page's description ---------------
      if (action.actionKey === "update_collection_text") {
        if (!action.targetRef) return { ok: false, reason: "No collection was specified." };
        const collection = await readCollection(creds.shop, creds.accessToken, action.targetRef);
        if (!collection) return { ok: false, reason: "That collection no longer exists in Shopify." };

        const html = typeof action.requestedChanges.html === "string" ? action.requestedChanges.html : null;
        if (html === null) return { ok: false, reason: "No new text was given for that collection." };

        const warnings: string[] = [];
        const current = collection.descriptionHtml ?? "";
        if (current.trim() === html.trim()) {
          warnings.push("The collection already reads this way — approving will change nothing.");
        }
        // AN EMPTY COLLECTION IS WORTH SAYING OUT LOUD. Writing a
        // paragraph about a group of products that currently holds
        // none is not an error, but it is almost always a sign the
        // wrong collection was resolved — and the preview is the only
        // place that can be caught.
        if (collection.productsCount?.count === 0) {
          warnings.push("This collection has no products in it yet, so customers have nothing to see below the text.");
        }

        return {
          ok: true,
          preview: {
            summary: `"${collection.title}" (/collections/${collection.handle}): collection text updated`,
            // No price and no image on this path. Stated as null
            // rather than omitted: the shape is shared with the
            // product preview, where a missing field would read as
            // unknown rather than as absent.
            target: { title: collection.title, variantTitle: null, currentPrice: null, imageUrl: null },
            // THE WHOLE DESCRIPTION IS THE BEFORE-VALUE, not a diff.
            // Undo is built from preview.changes[].before, so anything
            // less than the complete prior text is an undo that loses
            // words.
            changes: [{ field: "descriptionHtml", before: current, after: html }],
            warnings,
          },
        };
      }

      // ---- content: a new blog post -------------------------------
      if (action.actionKey === "publish_post") {
        const title = typeof action.requestedChanges.title === "string" ? action.requestedChanges.title.trim() : "";
        const body = typeof action.requestedChanges.html === "string" ? action.requestedChanges.html : "";
        if (!title) return { ok: false, reason: "A blog post needs a title." };
        if (!body.trim()) return { ok: false, reason: "A blog post needs some text." };

        const blogs = await readBlogs(creds.shop, creds.accessToken);
        if (blogs === null) {
          return { ok: false, reason: "Couldn't read this store's blogs from Shopify. Nothing was created." };
        }
        if (!blogs.length) {
          return {
            ok: false,
            reason: "This store has no blog yet. Create one in Shopify under Online Store, then ask again.",
          };
        }
        // ONE BLOG, OR THE OWNER CHOOSES. Picking among several would
        // be publishing to a blog nobody named.
        const named = typeof action.targetRef === "string" ? action.targetRef : null;
        const blog = named
          ? blogs.find((b) => b.id === named || b.handle === named) ?? null
          : blogs.length === 1
            ? blogs[0]
            : null;
        if (!blog) {
          return {
            ok: false,
            reason: `This store has ${blogs.length} blogs (${blogs
              .map((b) => b.title)
              .join(", ")}). Say which one to post to.`,
          };
        }

        return {
          ok: true,
          preview: {
            summary: `New post "${title}" on the "${blog.title}" blog — created as a draft, not published`,
            target: { title: blog.title, variantTitle: null, currentPrice: null, imageUrl: null },
            // `before: null` IS WHAT MARKS A CREATION. There is no
            // prior value, and undoing a creation is a different
            // decision from undoing an edit.
            changes: [{ field: "article", before: null, after: title }],
            warnings: [
              "The post is created unpublished. Publishing it is a separate step in Shopify, so nothing goes live on approval.",
            ],
          },
        };
      }

      if (!action.targetRef) return { ok: false, reason: "No product variant was specified." };

      const variant = await readVariant(creds.shop, creds.accessToken, action.targetRef);
      if (!variant) return { ok: false, reason: "That product variant no longer exists in Shopify." };

      const nextPrice = String(action.requestedChanges.price ?? "");
      if (!nextPrice || Number.isNaN(Number(nextPrice)) || Number(nextPrice) < 0) {
        return { ok: false, reason: "That price isn't a valid amount." };
      }

      const currencyLabel = describeCurrency(variant.currencyCode);
      const changes: FieldChange[] = [{ field: "price", before: variant.price, after: nextPrice }];

      // Warnings inform the decision; they never block it. The person
      // approving is the one entitled to decide a 40% cut is correct —
      // they are not entitled to be surprised by it.
      const warnings: string[] = [];
      const before = Number(variant.price);
      const after = Number(nextPrice);
      if (Number.isFinite(before) && before > 0 && Number.isFinite(after)) {
        const deltaPct = Math.round(((after - before) / before) * 100);
        if (Math.abs(deltaPct) >= 20) {
          warnings.push(`${deltaPct > 0 ? "Increase" : "Reduction"} of ${Math.abs(deltaPct)}%.`);
        }
        if (after === 0) warnings.push("This makes the product free.");
      }
      if (variant.product.status !== "ACTIVE") {
        warnings.push(`This product is ${variant.product.status.toLowerCase()} — the change won't be visible to customers until it's active.`);
      }
      // The merchant named a currency their store does not use. NOT a
      // question — the number is the instruction and the store's
      // currency is fixed in Shopify. Surfaced here because the
      // preview is where a misunderstanding gets caught, and "you said
      // rupees, this store prices in USD" is exactly what an approver
      // needs to see before saying yes.
      //
      // Deliberately NO exchange-rate conversion. A merchant saying
      // "999 rupees" about their own USD store has almost certainly
      // misspoken, not asked for ~$12 at today's rate — and silently
      // applying an FX rate to a live price is a worse failure than
      // showing them the number they actually said.
      const statedCurrency = typeof action.requestedChanges.statedCurrency === "string" ? action.requestedChanges.statedCurrency : null;
      if (statedCurrency && variant.currencyCode && statedCurrency !== variant.currencyCode) {
        // Kept, but demoted in importance: with the currency stated up
        // front this confirms rather than surprises.
        warnings.push(
          `You said ${statedCurrency} — this store prices in ${variant.currencyCode}, so this sets ${formatMoney(nextPrice, variant.currencyCode)} (not converted).`
        );
      }

      if (samePrice(variant.price, nextPrice)) {
        warnings.push("The price is already this value — approving will change nothing.");
      }

      return {
        ok: true,
        preview: {
          // BOTH sides formatted in the store's own currency. A bare
          // number here is what let a USD store's price render as
          // rupees — the model was filling in a symbol we never gave it.
          // The store's currency comes FIRST, before any number.
          // Stating it up front is what removes the ambiguity at
          // source — the merchant sees which currency they are
          // confirming in before they see the amount, so there is no
          // gap between what they agree to and what gets applied.
          summary: `${currencyLabel ? `Store currency: ${currencyLabel}. ` : ""}"${variant.product.title}${variant.title && variant.title !== "Default Title" ? ` — ${variant.title}` : ""}": ${formatMoney(variant.price, variant.currencyCode)} → ${formatMoney(nextPrice, variant.currencyCode)}`,
          // WHO is being changed, from Shopify rather than from the
          // merchant's phrase. If "the blue kurta" resolved to the
          // wrong variant, this is the only place it can be caught —
          // so the approver sees the exact stored title, the current
          // price and the image, not the words they typed.
          target: {
            title: variant.product.title,
            variantTitle: variant.title && variant.title !== "Default Title" ? variant.title : null,
            currentPrice: formatMoney(variant.price, variant.currencyCode),
            currency: variant.currencyCode,
            currencyLabel,
            imageUrl: variant.product.featuredImage?.url ?? null,
            resolutionPath: action.resolutionPath ?? undefined,
          },
          changes,
          warnings,
        },
      };
    },

    /**
     * Put a page back the way it was.
     *
     * NEEDED, NOT OPTIONAL, AND A TEST FOUND OUT WHY. `undoExistsFor`
     * walks the registry and answers on the FIRST platform that claims
     * an action key. While `update_page_text` was claimed only by the
     * built-in site, that was the built-in site's answer. The moment
     * Shopify claimed it too and had no `undo`, the autonomy layer
     * started reading "nothing can put this back yet" for a page edit
     * the built-in site has always been able to reverse.
     *
     * So the fix is to be undoable rather than to loosen the question.
     * `canHoldL1` refuses L1 to any action with no undo, and that
     * refusal is correct — an action is only reversible if every
     * platform that performs it can reverse it.
     *
     * IT PROPOSES, IT DOES NOT WRITE. The undo comes back as a new
     * action with its own preview and its own approval, built from
     * `preview.changes[].before` — which is why there is no history
     * table and why what goes back cannot drift from what was changed.
     *
     * PUBLISH_POST HAS NO UNDO, deliberately. Un-creating a post is a
     * deletion, and a deletion is not the reverse of a creation in any
     * sense an owner would accept — the article may have been edited
     * since. The post is created unpublished, so nothing went live to
     * take back.
     */
    async undo(action: PublishActionRecord): Promise<UndoProposal> {
      // ONE LIST, NOT TWO — the same correction execute() needed. This
      // named the two page keys inline, so `undoes` could gain a key
      // this method would then happily refuse, or lose one it still
      // handled. `undoes` is what the autonomy layer reads when it
      // decides whether an action is reversible, so it has to be the
      // same list this method obeys.
      //
      // The dispatch below still ends in a refusal. A key declared in
      // `undoes` with no branch here is a promise nothing keeps, and
      // it should fail loudly rather than fall through to the page
      // path and read the wrong object.
      if (!undoes.includes(action.actionKey)) {
        return { ok: false, reason: `There's nothing to put back for "${action.actionKey}".` };
      }
      if (!action.targetRef) return { ok: false, reason: "That edit didn't record which page it changed, so I can't put it back." };
      if (!action.preview) return { ok: false, reason: "That edit was never previewed, so there is no record of what the page said before." };

      const creds = await deps.getCredentials(action.dealershipId);
      if (!creds) return { ok: false, reason: "Shopify isn't connected." };

      if (action.actionKey === "update_collection_text") {
        const collection = await readCollection(creds.shop, creds.accessToken, action.targetRef);
        if (!collection) {
          return { ok: false, reason: "That collection isn't in Shopify any more, so there's nothing to put back." };
        }
        const was = action.preview.changes.find((c) => c.field === "descriptionHtml");
        // NOTHING RECORDED MEANS NOTHING OFFERED. An undo card with no
        // prior value is a button that would blank the collection.
        if (!was || was.before === null) {
          return { ok: false, reason: "That edit didn't record what the page said before, so I can't put it back." };
        }
        return {
          ok: true,
          actionKey: action.actionKey,
          targetRef: action.targetRef,
          targetLabel: String(action.targetLabel ?? collection.title),
          requestedChanges: { html: was.before },
          // from and to are the REVERSE journey — what it says now
          // goes back to what it said before.
          changed: [{ what: "Collection text", from: was.after, to: was.before }],
          warnings: [],
        };
      }

      if (action.actionKey !== "update_page_text" && action.actionKey !== "update_page_meta") {
        return { ok: false, reason: `There's nothing to put back for "${action.actionKey}".` };
      }
      const page = await readPage(creds.shop, creds.accessToken, action.targetRef);
      if (!page) return { ok: false, reason: "That page isn't in Shopify any more, so there's nothing to put back." };

      const changes: Record<string, unknown> = {};
      const changed: { what: string; from: string; to: string }[] = [];
      for (const c of action.preview.changes) {
        if (typeof c.before !== "string") continue;
        // FROM AND TO ARE THE OTHER WAY ROUND, because this is the
        // reverse journey: what the page says NOW goes back to what it
        // said before.
        if (c.field === "body") {
          changes.html = c.before;
          changed.push({ what: "Page text", from: String(c.after ?? ""), to: c.before });
        }
        if (c.field === "seoTitle") {
          changes.metaTitle = c.before;
          changed.push({ what: "Search title", from: String(c.after ?? ""), to: c.before });
        }
        if (c.field === "seoDescription") {
          changes.metaDescription = c.before;
          changed.push({ what: "Search description", from: String(c.after ?? ""), to: c.before });
        }
      }
      // NOTHING RECORDED MEANS NOTHING OFFERED. An undo card with no
      // prior value is a button that would blank the page.
      if (!Object.keys(changes).length) {
        return { ok: false, reason: "That edit didn't record what the page said before, so I can't put it back." };
      }

      return {
        ok: true,
        actionKey: action.actionKey,
        targetRef: action.targetRef,
        targetLabel: String(action.targetLabel ?? page.title),
        requestedChanges: changes,
        changed,
        warnings: [],
      };
    },

    async execute(action: PublishActionRecord): Promise<ExecuteResult> {
      // ONE LIST, NOT TWO. This was `!== "update_product_price"`, which
      // meant a key could be declared in `supports` and still be
      // refused here — the two would drift the moment either changed.
      // Reading `supports` is the same source the tool layer reads, so
      // "offered" and "executable" cannot disagree.
      if (!supports.includes(action.actionKey)) {
        return { ok: false, reason: `Execute for "${action.actionKey}" is not built yet.` };
      }

      const creds = await deps.getCredentials(action.dealershipId);
      if (!creds) return { ok: false, reason: "Shopify isn't connected." };
      if (!action.preview) return { ok: false, reason: "This action was never previewed." };

      // ---- content: a page's text or search title ------------------
      //
      // SAME THREE STEPS AS THE PRICE PATH, in the same order and for
      // the same reasons: already-at-target first so a retry after a
      // timeout is a no-op rather than a false "stale", then the
      // staleness check, then the write.
      if (action.actionKey === "update_page_text" || action.actionKey === "update_page_meta") {
        if (!action.targetRef) return { ok: false, reason: "No page was specified." };
        const current = await readPage(creds.shop, creds.accessToken, action.targetRef);
        if (!current) return { ok: false, reason: "That page no longer exists in Shopify." };

        const nowOf = (field: string): string =>
          field === "body"
            ? current.body ?? ""
            : field === "seoTitle"
              ? current.seo?.title ?? ""
              : current.seo?.description ?? "";

        const expected = action.preview.changes.filter((c) => ["body", "seoTitle", "seoDescription"].includes(c.field));
        if (!expected.length) return { ok: false, reason: "The preview did not record anything to verify against." };

        if (expected.every((c) => nowOf(c.field) === c.after)) {
          publishLog("shopify.noop", { action: action.id, page: current.id, why: "already_at_target" });
          return { ok: true, platformResponse: { skipped: "the page already reads this way" } };
        }

        const moved = expected.filter((c) => nowOf(c.field) !== (c.before ?? ""));
        if (moved.length) {
          publishError("shopify.stale", { action: action.id, page: current.id, fields: moved.map((c) => c.field).join(",") });
          return {
            ok: false,
            stale: true,
            changed: moved.map((c) => ({ field: c.field, before: c.before, after: nowOf(c.field) })),
          };
        }

        const page: Record<string, unknown> = {};
        for (const c of expected) {
          if (c.field === "body") page.body = c.after;
        }
        const seoTitle = expected.find((c) => c.field === "seoTitle");
        const seoDescription = expected.find((c) => c.field === "seoDescription");
        if (seoTitle || seoDescription) {
          // BOTH SIDES SENT TOGETHER. Shopify's seo input replaces the
          // object, so sending only the title would blank a
          // description nobody asked to remove — the current value is
          // carried through for whichever half is not changing.
          page.seo = {
            title: seoTitle ? seoTitle.after : current.seo?.title ?? "",
            description: seoDescription ? seoDescription.after : current.seo?.description ?? "",
          };
        }

        publishLog("shopify.write", { action: action.id, page: current.id, fields: Object.keys(page).join(",") });
        const result = await shopifyMutation<{ page: { id: string } }>(
          creds.shop,
          creds.accessToken,
          PAGE_MUTATION,
          { id: current.id, page },
          "pageUpdate",
          fetchImpl
        );
        if (!result.ok) {
          publishError("shopify.write_failed", { action: action.id, detail: result.reason });
          return { ok: false, reason: result.reason };
        }
        publishLog("shopify.write_ok", { action: action.id, page: current.id });
        return { ok: true, platformResponse: result.data };
      }

      // ---- files: a picture into the store's own library ------------
      //
      // A CREATION HAS NO BEFORE-VALUE, so there is no staleness check
      // to make and none is faked — the same shape as publish_post.
      // What protects a retry is the idempotency the executor already
      // applies to the action, and the worst case of a double write is
      // a duplicate file in a library rather than anything a customer
      // can see.
      if (action.actionKey === "upload_image") {
        const src = typeof action.requestedChanges.imageUrl === "string" ? action.requestedChanges.imageUrl.trim() : "";
        // CHECKED AGAIN HERE, not only in the preview. Approval can
        // arrive hours later against a record that was written
        // elsewhere, and this is the step that actually hands a URL to
        // Shopify.
        if (!src || !sourceAllowed(src)) {
          return { ok: false, reason: "That picture isn't one Hawlai made, so it wasn't uploaded." };
        }
        const alt = typeof action.requestedChanges.alt === "string" ? action.requestedChanges.alt : "";
        if (alt.length > ALT_LIMIT) {
          return { ok: false, reason: `The description of the picture is longer than ${ALT_LIMIT} characters.` };
        }
        const filename = typeof action.requestedChanges.filename === "string" ? action.requestedChanges.filename.trim() : "";

        publishLog("shopify.write", { action: action.id, what: "file_create" });
        const result = await shopifyMutation<{ files: CreatedFile[] }>(
          creds.shop,
          creds.accessToken,
          FILE_MUTATION,
          {
            files: [
              {
                originalSource: src,
                contentType: "IMAGE",
                ...(alt ? { alt } : {}),
                ...(filename ? { filename } : {}),
              },
            ],
          },
          "fileCreate",
          fetchImpl
        );
        if (!result.ok) {
          publishError("shopify.write_failed", { action: action.id, detail: result.reason });
          return { ok: false, reason: result.reason };
        }
        const file = result.data.files?.[0] ?? null;
        if (!file) {
          // No userErrors and no file is not a success. Reporting one
          // would record a picture in the library that is not there.
          publishError("shopify.write_failed", { action: action.id, detail: "no_file_returned" });
          return { ok: false, reason: "Shopify accepted the upload but returned no file, so I can't confirm it." };
        }
        publishLog("shopify.write_ok", { action: action.id, file: file.id, status: file.fileStatus });
        return {
          ok: true,
          platformResponse: {
            id: file.id,
            fileStatus: file.fileStatus,
            // NULL WHEN STILL PROCESSING, and said so rather than
            // omitted. Shopify processes files asynchronously, so a
            // successful create can carry no URL yet — and a caller
            // that reads a missing field as an empty string would put
            // a broken image on a page.
            url: file.image?.url ?? null,
            processing: file.fileStatus !== "READY",
          },
        };
      }

      // ---- content: a collection page's description -----------------
      //
      // THE SAME THREE STEPS IN THE SAME ORDER as the page and price
      // paths: already-at-target first so a retry after a timeout is a
      // no-op rather than a false "stale", then the staleness check,
      // then the write.
      if (action.actionKey === "update_collection_text") {
        if (!action.targetRef) return { ok: false, reason: "No collection was specified." };
        const current = await readCollection(creds.shop, creds.accessToken, action.targetRef);
        if (!current) return { ok: false, reason: "That collection no longer exists in Shopify." };

        const expected = action.preview.changes.find((c) => c.field === "descriptionHtml");
        if (!expected) return { ok: false, reason: "The preview did not record anything to verify against." };

        const now = current.descriptionHtml ?? "";
        if (now === expected.after) {
          publishLog("shopify.noop", { action: action.id, collection: current.id, why: "already_at_target" });
          return { ok: true, platformResponse: { skipped: "the collection already reads this way" } };
        }
        if (now !== (expected.before ?? "")) {
          publishError("shopify.stale", { action: action.id, collection: current.id, fields: "descriptionHtml" });
          return {
            ok: false,
            stale: true,
            changed: [{ field: "descriptionHtml", before: expected.before, after: now }],
          };
        }

        publishLog("shopify.write", { action: action.id, collection: current.id, fields: "descriptionHtml" });
        const result = await shopifyMutation<{ collection: { id: string } }>(
          creds.shop,
          creds.accessToken,
          COLLECTION_MUTATION,
          // THE ID GOES INSIDE the collection object — see the comment
          // on COLLECTION_MUTATION. Nothing else is sent: a
          // CollectionUpdateInput carrying only the fields that change
          // leaves the rest alone, unlike the `seo` object on a page.
          { collection: { id: current.id, descriptionHtml: expected.after } },
          "collectionUpdate",
          fetchImpl
        );
        if (!result.ok) {
          publishError("shopify.write_failed", { action: action.id, detail: result.reason });
          return { ok: false, reason: result.reason };
        }
        publishLog("shopify.write_ok", { action: action.id, collection: current.id });
        return { ok: true, platformResponse: result.data };
      }

      // ---- content: a new blog post --------------------------------
      //
      // A CREATION HAS NO BEFORE-VALUE, so there is no staleness check
      // to make and none is faked. What protects a retry here is the
      // idempotency the executor already applies to the action, not a
      // comparison — and the post is created UNPUBLISHED, so the worst
      // case of a double write is a duplicate draft rather than two
      // live posts.
      if (action.actionKey === "publish_post") {
        const title = typeof action.requestedChanges.title === "string" ? action.requestedChanges.title.trim() : "";
        const body = typeof action.requestedChanges.html === "string" ? action.requestedChanges.html : "";
        if (!title || !body.trim()) return { ok: false, reason: "The post needs a title and some text." };

        const blogs = await readBlogs(creds.shop, creds.accessToken);
        if (blogs === null) return { ok: false, reason: "Couldn't read this store's blogs from Shopify. Nothing was created." };
        const named = typeof action.targetRef === "string" ? action.targetRef : null;
        const blog = named
          ? blogs.find((b) => b.id === named || b.handle === named) ?? null
          : blogs.length === 1
            ? blogs[0]
            : null;
        if (!blog) return { ok: false, reason: "Couldn't tell which blog to post to. Nothing was created." };

        publishLog("shopify.write", { action: action.id, blog: blog.id, what: "article_create" });
        const result = await shopifyMutation<{ article: { id: string } }>(
          creds.shop,
          creds.accessToken,
          ARTICLE_MUTATION,
          { article: { blogId: blog.id, title, body, isPublished: false } },
          "articleCreate",
          fetchImpl
        );
        if (!result.ok) {
          publishError("shopify.write_failed", { action: action.id, detail: result.reason });
          return { ok: false, reason: result.reason };
        }
        publishLog("shopify.write_ok", { action: action.id, blog: blog.id });
        return { ok: true, platformResponse: result.data };
      }

      if (!action.targetRef) return { ok: false, reason: "No product variant was specified." };

      // RE-READ BEFORE WRITING. The contract, and the reason execute()
      // cannot simply apply the approved payload.
      //
      // Someone previews a price at 10am and approves at 3pm. If it
      // changed in Shopify at noon, applying the approved intent
      // silently overwrites a change nobody saw and nobody agreed to.
      // The approval was for a TRANSITION — "1,299 becomes 999" — not
      // for a final value.
      const current = await readVariant(creds.shop, creds.accessToken, action.targetRef);
      if (!current) return { ok: false, reason: "That product variant no longer exists in Shopify." };

      const expected = action.preview.changes.find((c) => c.field === "price");
      if (!expected) return { ok: false, reason: "The preview did not record a price to verify against." };

      // ALREADY AT THE TARGET — checked BEFORE staleness, and the
      // order is the whole of retry safety.
      //
      // A test caught this the other way round. With the stale check
      // first, a successful write followed by a timeout and a retry
      // reads 999, compares it to the recorded before of 1299, and
      // reports STALE — marking an action that actually succeeded as
      // needing re-approval. The idempotency key would be doing
      // nothing.
      //
      // If the desired end state is already true, applying again is a
      // no-op regardless of who got it there, so success without a
      // write is both correct and the only answer that survives a
      // retry.
      if (samePrice(current.price, expected.after)) {
          publishLog("shopify.noop", { action: action.id, variant: current.id, price: current.price, why: "already_at_target" });
        return { ok: true, platformResponse: { skipped: "already at the requested price" } };
      }

      if (!samePrice(current.price, expected.before)) {
        // Not a failure — the human's decision is simply out of date.
        // Nothing is written.
        publishError("shopify.stale", { action: action.id, variant: current.id, expectedBefore: expected.before, actualNow: current.price, wanted: expected.after });
        return {
          ok: false,
          stale: true,
          changed: [{ field: "price", before: expected.before, after: current.price }],
        };
      }

        // Logged BEFORE the write as well as after: if the request
        // times out there is otherwise no record that a price change
        // was ever attempted, and "did it land?" becomes unanswerable.
        publishLog("shopify.write", { action: action.id, product: current.product.id, variant: current.id, from: current.price, to: expected.after });
      const result = await shopifyMutation<{ productVariants: { id: string; price: string }[] }>(
        creds.shop,
        creds.accessToken,
        PRICE_MUTATION,
        {
          productId: current.product.id,
          variants: [{ id: current.id, price: expected.after }],
        },
        // The mutation name is required, and it is what forces the
        // userErrors check. Shopify declines a write with HTTP 200,
        // an empty `errors`, and a populated `userErrors`.
        "productVariantsBulkUpdate",
        fetchImpl
      );

      if (!result.ok) {
        // shopifyMutation already logged Shopify's own words; this
        // line ties that message to the action id, which is what makes
        // one filter tell the whole story.
        publishError("shopify.write_failed", { action: action.id, detail: result.reason });
        return { ok: false, reason: result.reason };
      }
      publishLog("shopify.write_ok", { action: action.id, variant: current.id, price: expected.after });
      return { ok: true, platformResponse: result.data };
    },
  };
}
