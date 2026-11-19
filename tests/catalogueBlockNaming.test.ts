// A salon was offered a "Product Grid" — 19 November 2026.
//
// THE DEFECT. `product_grid` renders SERVICES correctly and always
// has: ProductCatalog reads `kind === "service"` and gives it a
// duration and a Book now button instead of stock and a cart. Then the
// palette offered it as "Product Grid", with a package icon and a
// default heading of "Our Products".
//
// So a salon owner opening the builder saw no block for their
// services, and the one block that would have served them was named
// after something they do not sell. The behaviour was right and the
// words were wrong, which is the harder kind of wrong to notice —
// nothing failed, it just read as "this product is not for me".
//
// RULE 3, JUST OUTSIDE WHERE THE TEST LOOKS. multiTenantVocabulary
// reads code and prompts; this was UI copy in a registry, so it sat in
// the gap. It is the same fault either way: one kind of business's
// vocabulary shown to all of them.

import { describe, it, expect } from "vitest";
import { BLOCK_REGISTRY, catalogueDisplay, blockDefinitionFor, createBlock } from "@/lib/blocks/registry";
import { code } from "./helpers/source";

describe("1. THE BLOCK IS NAMED FOR WHAT THE BUSINESS SELLS", () => {
  it("THE LOAD-BEARING ONE: a services business is never shown the word Product", () => {
    const d = catalogueDisplay(["services"]);
    expect(d.label).toBe("Services");
    expect(d.heading).toBe("Our Services");
    expect(d.label.toLowerCase()).not.toContain("product");
    expect(d.heading.toLowerCase()).not.toContain("product");
  });

  it("a products business reads exactly as it did before", () => {
    // The change must not cost the businesses it already suited.
    const d = catalogueDisplay(["products"]);
    expect(d.label).toBe("Products");
    expect(d.heading).toBe("Our Products");
  });

  it("A BUSINESS THAT DOES BOTH IS TOLD NEITHER IS THE WHOLE STORY", () => {
    const d = catalogueDisplay(["products", "services"]);
    expect(d.label).toBe("Products & Services");
    expect(d.heading).toBe("What we offer");
  });

  it("THE LOAD-BEARING ONE: NOTHING KNOWN MEANS NOTHING GUESSED", () => {
    // An empty or unreadable business_models means nobody has said what
    // this business sells. Defaulting to "products" is exactly how the
    // original fault got there.
    for (const models of [[], null, undefined, ["subscription"]]) {
      const d = catalogueDisplay(models as any);
      expect(d.label, String(models)).toBe("Catalogue");
      expect(d.heading.toLowerCase()).not.toContain("product");
    }
  });

  it("and the icon changes with the words", () => {
    expect(catalogueDisplay(["services"]).icon).not.toBe(catalogueDisplay(["products"]).icon);
  });

  it("the other models are read without crashing", () => {
    expect(catalogueDisplay(["b2b", "services"]).label).toBe("Services");
  });
});

describe("2. ONLY THIS BLOCK CHANGES", () => {
  it("TWELVE BLOCKS READ THE SAME FOR EVERYBODY", () => {
    // A heading is a heading in every trade. Widening this further
    // would be inventing per-business vocabulary nobody asked for.
    for (const type of Object.keys(BLOCK_REGISTRY)) {
      if (type === "product_grid") continue;
      const a = blockDefinitionFor(type, ["products"])!;
      const b = blockDefinitionFor(type, ["services"])!;
      expect(a.label, type).toBe(b.label);
      expect(a.icon, type).toBe(b.icon);
    }
  });

  it("AND THE TYPE KEY IS UNTOUCHED", () => {
    // `product_grid` is stored in every saved page's block tree and in
    // convertLegacy's output. Renaming the key would strand every
    // existing site; only what a person reads changes.
    expect(BLOCK_REGISTRY.product_grid).toBeDefined();
    expect(blockDefinitionFor("product_grid", ["services"])).toBeDefined();
    expect(code("src/lib/blocks/convertLegacy.ts")).not.toMatch(/service_grid|catalogue_block/);
  });

  it("an unknown type is still unknown", () => {
    expect(blockDefinitionFor("not_a_block", ["services"])).toBeUndefined();
  });
});

describe("3. A DROPPED BLOCK STARTS CORRECTLY NAMED", () => {
  it("THE LOAD-BEARING ONE: a salon's new block says Our Services from the first render", () => {
    // Not after the owner retypes it. The heading is stored in props at
    // creation, so getting it right later is not an option.
    const block = createBlock("product_grid", undefined, ["services"]);
    expect(block.props.heading).toBe("Our Services");
  });

  it("and a shop's says Our Products", () => {
    expect(createBlock("product_grid", undefined, ["products"]).props.heading).toBe("Our Products");
  });

  it("AN EXPLICIT HEADING STILL WINS", () => {
    const block = createBlock("product_grid", { props: { heading: "Treatments" } }, ["services"]);
    expect(block.props.heading).toBe("Treatments");
  });

  it("CALLING IT WITHOUT MODELS BEHAVES EXACTLY AS BEFORE", () => {
    // convertLegacy and the AI path both call createBlock with two
    // arguments. Passing no models must mean the old registry default,
    // not the neutral one — otherwise this change rewrites history.
    expect(createBlock("product_grid").props.heading).toBe("Our Products");
    expect(createBlock("heading", { props: { text: "x" } }).props.text).toBe("x");
  });
});

describe("4. THE BUILDER ACTUALLY USES IT", () => {
  const canvas = () => code("src/components/website-builder/blocks/BlockCanvas.tsx");

  it("THE PALETTE RESOLVES EVERY ENTRY FOR THIS BUSINESS", () => {
    // The palette is where the salon owner looks and does not find a
    // block for their services.
    expect(canvas()).toMatch(/blockDefinitionFor\(type, models \?\? \[\]\)/);
  });

  it("AND SO DOES THE DRAG OVERLAY", () => {
    // Dragging a block that renames itself on drop would be worse than
    // not renaming it at all.
    expect(canvas()).toMatch(/blockDefinitionFor\(activeType, businessModels \?\? \[\]\)/);
  });

  it("THE MODELS REACH THE CANVAS FROM THE SERVER", () => {
    expect(code("src/app/api/website-builder/generate/route.ts")).toMatch(/businessModels: cleanBusinessModels\(/);
    expect(code("src/components/website-builder/WebsiteBuilderView.tsx")).toMatch(/businessModels=\{businessModels\}/);
  });

  it("AND THEY ARE VALIDATED, not trusted", () => {
    // cleanBusinessModels returns null for anything that is not a known
    // model, and the view filters to strings. A junk column must not
    // reach a label.
    expect(code("src/components/website-builder/WebsiteBuilderView.tsx")).toMatch(
      /Array\.isArray\(d\.businessModels\) \? d\.businessModels\.filter/
    );
  });
});
