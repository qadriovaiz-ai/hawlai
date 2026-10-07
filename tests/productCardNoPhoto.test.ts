// A product with no photo rendered as an empty grey box.
//
// THE LIVE CASE (3 Oct 2026): the Shop page's first card showed a photo
// and the second — the Candle Making Workshop, which has no image —
// rendered as a blank grey rectangle. Its name, price and Book button
// were underneath all along, but an aspect-square blank at the top of a
// card IS the card as far as a reader's eye is concerned, and it looks
// broken rather than photo-less.
//
// It was a rendering decision, not missing data: the zero-image branch
// returned a bare <div> with nothing in it.

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductImageGallery } from "@/components/website/ProductCatalog";

function render(images: string[], alt: string): string {
  return renderToStaticMarkup(createElement(ProductImageGallery, { images, alt }));
}

describe("a product with no image", () => {
  it("shows the product's name instead of nothing", () => {
    const markup = render([], "Candle Making Workshop");
    expect(markup).toContain("Candle Making Workshop");
    // Still square, so the grid does not jump.
    expect(markup).toContain("aspect-square");
  });

  it("is type, not a generated picture and not an apology", () => {
    const markup = render([], "Candle Making Workshop");
    // Never an invented image for a real product.
    expect(markup).not.toContain("<img");
    // And not a fault message a customer has to read.
    expect(markup).not.toMatch(/no image|not available|coming soon|placeholder/i);
  });

  it("renders the photo when there is one", () => {
    const markup = render(["https://cdn.test/lavender.jpg"], "Lavender candle");
    expect(markup).toContain("https://cdn.test/lavender.jpg");
    expect(markup).toContain("Lavender candle");
  });

  it("does not break on a product with no name either", () => {
    expect(() => render([], "")).not.toThrow();
  });
});
