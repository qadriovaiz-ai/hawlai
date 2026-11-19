import type { LandingTheme } from "@/lib/landingThemes";
import { legacyToBlocks } from "@/lib/blocks/convertLegacy";
import BlockRenderer from "./blocks/BlockRenderer";
import type { StorefrontProduct } from "@/lib/catalog/storefrontCatalog";
import type { ListingFacts } from "@/lib/seo/listingFacts";
import type { StorefrontReview } from "@/lib/catalog/storefrontReviews";


// Thin wrapper around the recursive BlockRenderer — this used to be a
// 150-line switch(section.type) duplicating the same 10 fixed shapes
// as LivePreviewEditor.tsx and WebsiteBuilderView.tsx. legacyToBlocks()
// is idempotent, so this works unmodified whether a page's `sections`
// column still holds old fixed-shape data or has already been migrated
// to the new Block tree.
export default function SectionRenderer({ sections, theme, slug, products, listing, reviews }: { sections: any[]; theme: LandingTheme; slug: string; products?: StorefrontProduct[]; listing?: ListingFacts | null; reviews?: StorefrontReview[] }) {
  const blocks = legacyToBlocks(sections);
  return (
    <>
      {blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} ctx={{ theme, slug, products, listing, reviews }} />
      ))}
    </>
  );
}
