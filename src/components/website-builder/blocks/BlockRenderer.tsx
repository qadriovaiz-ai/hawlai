import type { Block } from "@/lib/blocks/types";
import type { LandingTheme } from "@/lib/landingThemes";
import { renderRichText } from "@/lib/richText";
import LandingLeadForm from "@/components/website/LandingLeadForm";
import ProductCatalog from "@/components/website/ProductCatalog";

interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[];
  inventory_count: number | null;
}

export interface BlockRenderContext {
  theme: LandingTheme;
  slug: string;
  products?: StorefrontProduct[];
}

const GAP_CLASS: Record<string, string> = { sm: "gap-2", md: "gap-5", lg: "gap-8" };
const PADDING_CLASS: Record<string, string> = { sm: "py-8", md: "py-12", lg: "py-20" };
const HEADING_SIZE: Record<number, string> = { 1: "text-3xl sm:text-5xl font-bold", 2: "text-2xl font-bold", 3: "text-lg font-semibold" };
const ALIGN_CLASS: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" };
const SPACER_HEIGHT: Record<string, string> = { sm: "h-4", md: "h-8", lg: "h-16" };

// "Hide on mobile" (Block.responsive.mobile.hidden) is a container-query
// hide, matching the rest of this renderer's responsive model — hidden
// below the @sm container breakpoint, restored to `visibleDisplay` at
// or above it (most elements want "block"; inline elements like the
// button need their own display value to not become block-level once
// visible).
function hiddenOnMobile(block: Block, visibleDisplay: string = "block"): string {
  return block.responsive?.mobile?.hidden ? `hidden @sm:${visibleDisplay}` : "";
}

// Read-only recursive renderer — the public storefront's only consumer
// of the Block tree. The editor canvas (later phases) wraps this same
// component with selection/drag affordances rather than duplicating
// this switch, so there's exactly one place that knows how each block
// type looks.
export default function BlockRenderer({ block, ctx }: { block: Block; ctx: BlockRenderContext }) {
  const { theme } = ctx;

  switch (block.type) {
    case "section": {
      const bg = block.props.background === "dark" ? theme.dark : block.props.background === "accent" ? theme.accent : undefined;
      // Explicit default (not "inherit") even for the plain background —
      // the app's shared globals.css sets a near-white default text
      // color on <body> for the dashboard's dark theme (see the
      // "inverted slate scale" note in this repo's history), which
      // would otherwise leak into the storefront and render text
      // invisible against a light theme background.
      const color = block.props.background === "dark" ? theme.bg : block.props.background === "accent" ? theme.accentText : theme.dark;
      // @container: stacks inside respond to THIS section's actual
      // rendered width via container queries (@sm:, below), not the
      // browser viewport — so the dashboard's mobile-preview toggle
      // (which clamps this section to a narrow div, not a narrow
      // window) correctly collapses multi-column stacks to one column,
      // and a real phone visiting the live storefront still gets
      // correct behaviour since its section width tracks the viewport
      // anyway. Plain `sm:` viewport breakpoints can't do both.
      return (
        <section id={block.props.id} className={`@container px-6 ${PADDING_CLASS[block.props.paddingY] ?? PADDING_CLASS.md}`} style={{ backgroundColor: bg, color }}>
          <div className="max-w-5xl mx-auto flex flex-col gap-5">
            {(block.children ?? []).map((child) => (
              <BlockRenderer key={child.id} block={child} ctx={ctx} />
            ))}
          </div>
        </section>
      );
    }

    case "stack": {
      const directionClass = block.props.direction === "row" ? "flex-col @sm:flex-row" : "flex-col";
      const alignClass = block.props.align === "center" ? "items-center" : block.props.align === "start" ? "items-start" : "items-stretch";
      const wrapClass = block.props.wrap ? "flex-wrap" : "";
      const gapClass = GAP_CLASS[block.props.gap] ?? GAP_CLASS.md;
      const style: Record<string, string> = {};
      let widthClass = "w-full";
      if (block.props.widthFraction) {
        style["--col-basis"] = `${block.props.widthFraction * 100}%`;
        widthClass += " @sm:basis-[var(--col-basis)] @sm:shrink-0";
      }
      return (
        <div className={`flex ${directionClass} ${alignClass} ${wrapClass} ${gapClass} ${widthClass}`} style={style as React.CSSProperties}>
          {(block.children ?? []).map((child) => (
            <BlockRenderer key={child.id} block={child} ctx={ctx} />
          ))}
        </div>
      );
    }

    case "heading": {
      const level = Math.min(Math.max(Number(block.props.level) || 2, 1), 3);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return <Tag className={`${HEADING_SIZE[level]} ${ALIGN_CLASS[block.props.align] ?? ""} ${hiddenOnMobile(block)}`}>{block.props.text}</Tag>;
    }

    case "text":
      return block.props.html ? <p className={`leading-relaxed ${ALIGN_CLASS[block.props.align] ?? ""} ${hiddenOnMobile(block)}`}>{renderRichText(block.props.html)}</p> : null;

    case "image":
      return block.props.url ? (
        <div className={`aspect-video bg-neutral-100 rounded-xl overflow-hidden w-full ${hiddenOnMobile(block)}`}>
          <img src={block.props.url} alt={block.props.alt ?? ""} className="w-full h-full object-cover" />
        </div>
      ) : null;

    case "button": {
      if (!block.props.label) return null;
      const white = block.props.style === "white";
      return (
        <a
          href={block.props.href || "#"}
          className={`inline-block px-6 py-3 rounded-full font-semibold ${hiddenOnMobile(block, "inline-block")}`}
          style={white ? { backgroundColor: "#fff", color: theme.dark } : { backgroundColor: theme.accent, color: theme.accentText }}
        >
          {block.props.label}
        </a>
      );
    }

    case "spacer":
      return <div className={SPACER_HEIGHT[block.props.height] ?? SPACER_HEIGHT.md} />;

    case "divider":
      return <hr className={`border-neutral-200 w-full ${hiddenOnMobile(block)}`} />;

    case "video":
      return block.props.url ? (
        <div className={`aspect-video rounded-xl overflow-hidden w-full ${hiddenOnMobile(block)}`}>
          <iframe src={block.props.url} className="w-full h-full" allowFullScreen />
        </div>
      ) : null;

    case "form":
      return (
        <div className="w-full max-w-md mx-auto">
          {block.props.heading && <h2 className={`${HEADING_SIZE[2]} text-center mb-5`} style={{ color: theme.dark }}>{block.props.heading}</h2>}
          <LandingLeadForm slug={ctx.slug} theme={theme} />
        </div>
      );

    // Never AI-authored, never hand-filled — always the real live
    // catalog, same principle as the old "product_catalog" section.
    case "product_grid":
      return <ProductCatalog products={ctx.products ?? []} slug={ctx.slug} theme={theme} heading={block.props.heading} />;

    default:
      return null;
  }
}
