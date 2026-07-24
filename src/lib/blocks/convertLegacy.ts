import { createBlock, generateBlockId } from "./registry";
import type { Block } from "./types";

// Converts one page's old fixed-shape "sections" array (hero/text/
// features_grid/testimonials/team_grid/pricing/faq/cta_banner/
// contact_form/product_catalog — the model every Site Editor page used
// before the block-based rework) into the new Block[] tree. Used both
// on-the-fly (public storefront + the new editor keep reading legacy
// rows correctly without a DB write) and by the one-off bulk migration
// that mops up the long tail later — same function, same output either
// way, so there is exactly one place that knows what "hero" used to
// mean.
//
// Deterministic and total: every legacy type below always produces a
// section block, and any type this function doesn't recognize (there
// shouldn't be any, but real production data is real production data)
// falls back to a plain text dump rather than throwing, since a
// storefront page erroring out is worse than one ugly section.

function section(props: Record<string, any>, children: (Block | null | false | undefined)[]): Block {
  return { id: generateBlockId(), type: "section", props, children: children.filter(Boolean) as Block[] };
}

function stack(props: Record<string, any>, children: (Block | null | false | undefined)[]): Block {
  return { id: generateBlockId(), type: "stack", props, children: children.filter(Boolean) as Block[] };
}

function heading(text: string, level: number, align: string = "left"): Block {
  return createBlock("heading", { props: { text, level, align } });
}

function text(html: string, align: string = "left"): Block {
  return createBlock("text", { props: { html, align } });
}

function button(label: string, href: string = "#contact"): Block {
  return createBlock("button", { props: { label, href, style: "solid" } });
}

function convertHero(s: any): Block {
  return section({ background: "dark" }, [
    stack({ direction: "column", align: "center" }, [
      heading(s.headline ?? "", 1, "center"),
      s.subheadline && text(s.subheadline, "center"),
      s.ctaText && button(s.ctaText),
    ]),
  ]);
}

function convertText(s: any): Block {
  return section({ background: "none" }, [
    stack({ direction: "column", align: "center" }, [s.heading && heading(s.heading, 2, "center"), text(s.body ?? "", "center")]),
  ]);
}

function convertImageText(s: any): Block {
  const imageCol = stack({ direction: "column", widthFraction: 0.5 }, [s.imageUrl && createBlock("image", { props: { url: s.imageUrl, alt: "" } })]);
  const textCol = stack({ direction: "column", widthFraction: 0.5 }, [s.heading && heading(s.heading, 2), text(s.body ?? "")]);
  const columns = s.imagePosition === "right" ? [textCol, imageCol] : [imageCol, textCol];
  return section({ background: "none" }, [stack({ direction: "row", align: "center" }, columns)]);
}

function convertItemGrid(s: any, itemToBlock: (item: any) => Block): Block {
  return section({ background: "none" }, [
    s.heading && heading(s.heading, 2, "center"),
    stack({ direction: "row", wrap: true }, (s.items ?? []).map((item: any) => stack({ direction: "column", widthFraction: 0.33 }, [itemToBlock(item)]))),
  ]);
}

function convertFeaturesGrid(s: any): Block {
  return convertItemGrid(s, (item) => stack({ direction: "column" }, [heading(item.title ?? "", 3), text(item.description ?? "")]));
}

function convertTestimonials(s: any): Block {
  return convertItemGrid(s, (item) => stack({ direction: "column" }, [text(`“${item.quote ?? ""}”`), text(`— ${item.author ?? ""}`)]));
}

function convertTeamGrid(s: any): Block {
  return convertItemGrid(s, (item) => stack({ direction: "column", align: "center" }, [heading(item.name ?? "", 3, "center"), text(item.role ?? "", "center"), text(item.bio ?? "", "center")]));
}

function convertPricing(s: any): Block {
  return convertItemGrid(s, (item) => stack({ direction: "column", align: "center" }, [
    heading(item.name ?? "", 3, "center"),
    text(item.price ?? "", "center"),
    ...(item.features ?? []).map((f: string) => text(f, "center")),
  ]));
}

function convertFaq(s: any): Block {
  return convertItemGrid(s, (item) => stack({ direction: "column" }, [heading(item.question ?? "", 3), text(item.answer ?? "")]));
}

function convertCtaBanner(s: any): Block {
  return section({ background: "accent" }, [stack({ direction: "column", align: "center" }, [heading(s.headline ?? "", 2, "center"), s.ctaText && button(s.ctaText)])]);
}

function convertContactForm(s: any): Block {
  return section({ background: "none", id: "contact" }, [createBlock("form", { props: { heading: s.heading ?? "Get in Touch" } })]);
}

function convertProductCatalog(s: any): Block {
  return section({ background: "none" }, [createBlock("product_grid", { props: { heading: s.heading ?? "Our Products" } })]);
}

function convertUnknown(s: any): Block {
  return section({ background: "none" }, [text(`[Unrecognized legacy section: ${JSON.stringify(s)}]`)]);
}

const CONVERTERS: Record<string, (s: any) => Block> = {
  hero: convertHero,
  text: convertText,
  image_text: convertImageText,
  features_grid: convertFeaturesGrid,
  testimonials: convertTestimonials,
  team_grid: convertTeamGrid,
  pricing: convertPricing,
  faq: convertFaq,
  cta_banner: convertCtaBanner,
  contact_form: convertContactForm,
  product_catalog: convertProductCatalog,
};

// A row already in the new shape (top-level items are `type: "section"`
// with a `children` array) is passed through untouched — this is what
// makes the conversion idempotent, so callers never need to know
// whether a given row has already been migrated.
function isAlreadyBlockShaped(sections: any[]): boolean {
  return sections.length > 0 && sections.every((s) => s && s.type === "section" && Array.isArray(s.children));
}

export function legacyToBlocks(sections: any[] | null | undefined): Block[] {
  if (!Array.isArray(sections) || sections.length === 0) return [];
  if (isAlreadyBlockShaped(sections)) return sections as Block[];
  return sections.map((s) => (CONVERTERS[s?.type] ?? convertUnknown)(s ?? {}));
}
