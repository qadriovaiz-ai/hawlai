import {
  LayoutPanelTop,
  Columns3,
  Heading as HeadingIcon,
  Type,
  Image as ImageIcon,
  MousePointerClick,
  Minus,
  MoveVertical,
  Video as VideoIcon,
  ClipboardList,
  Package,
  HelpCircle,
  MessageSquare,
  CalendarCheck,
  LayoutGrid,
  Clock,
  type LucideIcon,
} from "lucide-react";
import type { Block, BlockDefinition } from "./types";

const ALIGN_OPTIONS = [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }];
const SIZE_OPTIONS = [{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }];
const BACKGROUND_OPTIONS = [{ value: "none", label: "None" }, { value: "dark", label: "Dark (theme)" }, { value: "accent", label: "Accent (theme)" }];
const DIRECTION_OPTIONS = [{ value: "column", label: "Vertical" }, { value: "row", label: "Horizontal" }];
const STACK_ALIGN_OPTIONS = [{ value: "start", label: "Start" }, { value: "center", label: "Center" }, { value: "stretch", label: "Stretch" }];
const WIDTH_OPTIONS = [{ value: "", label: "Auto" }, { value: "0.25", label: "25%" }, { value: "0.33", label: "33%" }, { value: "0.5", label: "50%" }, { value: "0.66", label: "66%" }, { value: "1", label: "100%" }];
const LEVEL_OPTIONS = [{ value: "1", label: "H1 — largest" }, { value: "2", label: "H2" }, { value: "3", label: "H3 — smallest" }];
const BUTTON_STYLE_OPTIONS = [{ value: "solid", label: "Accent" }, { value: "white", label: "White" }];

// Single source of truth for every block type — consumed by the block
// palette, the canvas renderer, and the properties panel, replacing
// the three independently hand-synced type-keyed maps that existed
// across SectionRenderer.tsx / LivePreviewEditor.tsx /
// WebsiteBuilderView.tsx for the old fixed section types.
//
// Deliberately flat: there is exactly one structural rule enforced
// outside this file (a page's top-level blocks are always type
// "section") — everything else, including row/column layout, is just
// another registry entry ("stack"), not a hardcoded nesting level.
export const BLOCK_REGISTRY: Record<string, BlockDefinition> = {
  section: {
    label: "Section",
    icon: LayoutPanelTop,
    category: "layout",
    isContainer: true,
    defaultProps: { background: "none", paddingY: "md" },
    propFields: [
      { key: "background", label: "Background", type: "select", options: BACKGROUND_OPTIONS },
      { key: "paddingY", label: "Vertical padding", type: "select", options: SIZE_OPTIONS },
    ],
  },
  stack: {
    label: "Stack",
    icon: Columns3,
    category: "layout",
    isContainer: true,
    defaultProps: { direction: "column", gap: "md", align: "stretch" },
    propFields: [
      { key: "direction", label: "Direction", type: "select", options: DIRECTION_OPTIONS },
      { key: "gap", label: "Gap", type: "select", options: SIZE_OPTIONS },
      { key: "align", label: "Align", type: "select", options: STACK_ALIGN_OPTIONS },
      { key: "wrap", label: "Wrap", type: "boolean" },
      { key: "widthFraction", label: "Width (as a column)", type: "select", options: WIDTH_OPTIONS },
    ],
  },
  heading: {
    label: "Heading",
    icon: HeadingIcon,
    category: "content",
    isContainer: false,
    defaultProps: { text: "Heading", level: 2, align: "left" },
    propFields: [
      { key: "text", label: "Text", type: "text" },
      { key: "level", label: "Size", type: "select", options: LEVEL_OPTIONS },
      { key: "align", label: "Align", type: "select", options: ALIGN_OPTIONS },
    ],
  },
  text: {
    label: "Text",
    icon: Type,
    category: "content",
    isContainer: false,
    defaultProps: { html: "", align: "left" },
    propFields: [
      { key: "html", label: "Text", type: "richtext" },
      { key: "align", label: "Align", type: "select", options: ALIGN_OPTIONS },
    ],
  },
  image: {
    label: "Image",
    icon: ImageIcon,
    category: "content",
    isContainer: false,
    defaultProps: { url: "", alt: "" },
    propFields: [
      { key: "url", label: "Image", type: "image" },
      { key: "alt", label: "Alt text", type: "text" },
    ],
  },
  button: {
    label: "Button",
    icon: MousePointerClick,
    category: "content",
    isContainer: false,
    defaultProps: { label: "Click here", href: "#", style: "solid" },
    propFields: [
      { key: "label", label: "Label", type: "text" },
      { key: "href", label: "Link", type: "url" },
      { key: "style", label: "Style", type: "select", options: BUTTON_STYLE_OPTIONS },
    ],
  },
  spacer: {
    label: "Spacer",
    icon: MoveVertical,
    category: "layout",
    isContainer: false,
    defaultProps: { height: "md" },
    propFields: [{ key: "height", label: "Height", type: "select", options: SIZE_OPTIONS }],
  },
  divider: {
    label: "Divider",
    icon: Minus,
    category: "layout",
    isContainer: false,
    defaultProps: {},
    propFields: [],
  },
  video: {
    label: "Video",
    icon: VideoIcon,
    category: "content",
    isContainer: false,
    defaultProps: { url: "" },
    propFields: [{ key: "url", label: "Embed URL", type: "url" }],
  },
  form: {
    label: "Contact Form",
    icon: ClipboardList,
    category: "content",
    isContainer: false,
    defaultProps: { heading: "Get in Touch" },
    propFields: [{ key: "heading", label: "Heading", type: "text" }],
  },
  // A QUESTION AND ITS ANSWER, kept as a pair in the data.
  //
  // THE GAP THIS CLOSES (A2 of docs/PLAN-AEO-GEO.md): there was no
  // block whose shape is "a question and its answer". A legacy `faq`
  // section was converted into a column of generic heading + text
  // pairs, so the words survived and the machine-readable fact that
  // one is a question and the other is its answer did not. Nothing
  // downstream could emit FAQPage schema, because nothing downstream
  // could tell.
  //
  // WHY THE PROPS ARE CALLED `heading` AND `html` AND NOT `question`
  // AND `answer`. Four separate systems are keyed on that exact set of
  // prop names — `TEXT_PROPS` in lib/pages/provenance.ts (who wrote
  // this line), `BLOCK_TEXT_KEYS` in lib/claims/guardBlocks.ts (the
  // claims guard), `LEGACY_FIELDS` in lib/claims/siteClaimsReview.ts
  // (the owner's claims review) and the Properties Panel's own marking
  // of the owner's edits. A prop named `answer` would be invisible to
  // all four, so an AI-written FAQ answer would reach a live page
  // UNGUARDED — which is precisely the 2026-09-30 incident that put
  // the guard on the builder in the first place. The names are poor
  // and they are load-bearing; the owner sees "Question" and "Answer"
  // because that is what the field LABELS say.
  faq: {
    label: "FAQ",
    icon: HelpCircle,
    category: "content",
    isContainer: true,
    allowedChildren: ["faq_item"],
    defaultProps: { heading: "Common questions" },
    propFields: [{ key: "heading", label: "Heading", type: "text" }],
  },
  faq_item: {
    label: "Question & Answer",
    icon: MessageSquare,
    category: "content",
    isContainer: false,
    defaultProps: { heading: "", html: "" },
    propFields: [
      { key: "heading", label: "Question", type: "text" },
      { key: "html", label: "Answer", type: "richtext" },
    ],
  },
  // THE HOURS THE PAGE ALREADY KNEW AND WOULD NOT SHOW.
  //
  // `LocalBusiness` schema has carried openingHoursSpecification and
  // the street address since the listing facts existed, so a search
  // engine could read them and a VISITOR COULD NOT — unless the owner
  // typed them a second time into a text block, at which point two
  // copies could disagree and only one of them was guarded.
  //
  // Same safety principle as product_grid, and for the same reason:
  // resolved server-side from business_listing_facts at render time,
  // never hand-filled, never AI-authored. The owner's publish flags
  // come with it — readListingFacts returns a null phone and a null
  // address unless he said they may be shown, so this block cannot
  // publish what he withheld.
  hours_address: {
    label: "Hours & Address",
    icon: Clock,
    category: "content",
    isContainer: false,
    defaultProps: { heading: "Visit us" },
    propFields: [{ key: "heading", label: "Heading", type: "text" }],
  },
  // Never AI-authored and never hand-filled with fake products — always
  // resolved server-side against the real products table at render
  // time, same safety principle as the old "product_catalog" section.
  product_grid: {
    label: "Product Grid",
    icon: Package,
    category: "content",
    isContainer: true,
    allowedChildren: [],
    defaultProps: { heading: "Our Products" },
    propFields: [{ key: "heading", label: "Heading", type: "text" }],
  },
};

// ─────────────────────────────────────────────────────────────────────
// WHAT THE CATALOGUE BLOCK IS CALLED, FOR THIS BUSINESS
// ─────────────────────────────────────────────────────────────────────
//
// THE DEFECT, FOUND 19 NOVEMBER 2026 while asking how flexible this
// builder is for a business that is not a shop. `product_grid` renders
// SERVICES correctly — ProductCatalog reads `kind === "service"` and
// gives it a duration and a Book now button instead of stock and a
// cart — and then the palette offers it as "Product Grid" with a
// package icon and a default heading of "Our Products".
//
// So a salon owner opening the builder sees no block for their
// services, and the one block that would serve them is named after
// something they do not sell. The behaviour was right and the words
// were wrong, which is the harder kind of wrong to notice.
//
// RULE 3, JUST OUTSIDE WHERE THE TEST LOOKS. multiTenantVocabulary
// reads code and prompts; this is UI copy in a registry, so it sat in
// the gap. It is the same fault: one kind of business's vocabulary
// shown to all of them.
//
// THE TYPE KEY DOES NOT CHANGE. `product_grid` is stored in every
// saved page's block tree and in convertLegacy's output; renaming it
// would strand every existing site. Only what a person reads changes.

/** How the catalogue block presents itself to one business. */
export type CatalogueDisplay = { label: string; heading: string; icon: LucideIcon };

/**
 * The catalogue block's words and icon for a business's own models.
 *
 * NEUTRAL WHEN NOTHING IS KNOWN, rather than defaulting to products.
 * An empty or unreadable `business_models` means nobody has said what
 * this business sells, and guessing "products" is how the original
 * fault got there. "Catalogue" is true either way.
 */
export function catalogueDisplay(models: readonly string[] | null | undefined): CatalogueDisplay {
  const m = Array.isArray(models) ? models : [];
  const products = m.includes("products");
  const services = m.includes("services");

  if (products && !services) return { label: "Products", heading: "Our Products", icon: Package };
  if (services && !products) return { label: "Services", heading: "Our Services", icon: CalendarCheck };
  if (products && services) return { label: "Products & Services", heading: "What we offer", icon: LayoutGrid };
  return { label: "Catalogue", heading: "What we offer", icon: LayoutGrid };
}

/**
 * A registry entry as this business should see it.
 *
 * Every other block is the same for everybody, so this touches one
 * type and leaves twelve alone.
 */
export function blockDefinitionFor(type: string, models: readonly string[] | null | undefined): BlockDefinition | undefined {
  const def = BLOCK_REGISTRY[type];
  if (!def || type !== "product_grid") return def;
  const display = catalogueDisplay(models);
  return { ...def, label: display.label, icon: display.icon, defaultProps: { ...def.defaultProps, heading: display.heading } };
}

export function generateBlockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createBlock(
  type: string,
  overrides?: Partial<Pick<Block, "props" | "children">>,
  /**
   * The business's own `business_models`. Only the catalogue block
   * reads it, and only to pick its default heading — a block dropped
   * by a salon should say "Our Services" from the first render, not
   * after the owner retypes it.
   */
  models?: readonly string[] | null
): Block {
  const def = models === undefined ? BLOCK_REGISTRY[type] : blockDefinitionFor(type, models) ?? BLOCK_REGISTRY[type];
  if (!def) throw new Error(`Unknown block type: ${type}`);
  return {
    id: generateBlockId(),
    type,
    props: { ...def.defaultProps, ...(overrides?.props ?? {}) },
    ...(def.isContainer ? { children: overrides?.children ?? [] } : {}),
  };
}
