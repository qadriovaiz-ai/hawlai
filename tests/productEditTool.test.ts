// E1 — THE CHAT TOOL ROUTES EACH FIELD TO ITS OWN CARD, 28 November 2026.
// propose_price_change, read with comments stripped and bounded at both
// ends (Rule 8). The platform's behaviour per field is in
// tests/hawlaiShopPlatform.test.ts.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { TOOLS } from "@/lib/businessBrain/toolSchemas";

const src = code("src/lib/agents/masterBrainV2.ts");
const start = src.indexOf('case "propose_price_change": {');
const end = src.indexOf('case "', start + 40);
const tool = src.slice(start, end);

describe("each field, its own action", () => {
  it("THE TOOL IS FOUND, AND IS A REAL BODY", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(tool.length).toBeGreaterThan(2000);
  });

  it("SEVEN FIELDS, SEVEN ACTIONS — stock, \"was\" price, category and show/hide added beside the three", () => {
    for (const [field, action] of [
      ["price", "update_product_price"],
      ["name", "update_product_name"],
      ["description", "update_product_description"],
      ["stock", "update_product_inventory"],
      ["compare_price", "update_product_compare_price"],
      ["category", "update_product_category"],
      ["visibility", "update_product_visibility"],
    ]) {
      expect(tool, field).toMatch(new RegExp(`\\b${field}: "${action}"`));
    }
  });

  // REPOINTED 28 Nov 2026 (card 8C68), same rule: the refusal moved
  // after product resolution so a field the product already has is
  // dropped first (tests/nothingToChangeCard.test.ts). Both stores still
  // refuse more than one REAL change per card.
  it("STILL ONE CHANGE PER CARD — on the owner's store and on Shopify", () => {
    expect(tool).toMatch(/if \(remaining\.length > 1\) return oneAtATime\(remaining\);/);
    expect(tool).toMatch(/if \(askedFields\.length > 1\) return oneAtATime\(askedFields\);/);
    expect(tool).toMatch(/const oneAtATime = [\s\S]{0,200}return \{\s*error: `That asks for/);
  });

  it("\"none\" CLEARS ONLY THE THREE THAT MAY BE EMPTY — never a price or a name", () => {
    expect(tool).toMatch(/const CLEARABLE = new Set\(\["stock", "compare_price", "category"\]\);/);
    expect(tool).toMatch(/const clearedFrom = \(f: string, v: string\) => \(CLEARABLE\.has\(f\) && \/\^\(none\|clear\|remove\|not tracked\|unlimited\)\$\/i\.test\(v\) \? "" : v\);/);
    expect(tool).toMatch(/let cleared = clearedFrom\(field, fieldValue\);/);
  });

  it("SHOW/HIDE IS ONLY 'show' OR 'hide', AND BECOMES shown/hidden", () => {
    expect(tool).toMatch(/if \(askedFields\.some\(\(\[f, v\]\) => f === "visibility" && !\/\^\(show\|hide\)\$\/i\.test\(String\(v\)\.trim\(\)\)\)\) return \{ error:/);
    expect(tool).toMatch(/\{ visibility: \/\^show\$\/i\.test\(fieldValue\) \? "shown" : "hidden" \}/);
  });

  it("THE SCHEMA OFFERS THE FOUR NEW FIELDS — and show/hide only as show or hide", () => {
    const schema: any = (TOOLS as any[]).find((t) => t.name === "propose_price_change");
    const props = schema.input_schema.properties;
    for (const k of ["new_stock", "new_compare_at_price", "new_category", "visibility"]) expect(props[k], k).toBeTruthy();
    expect(props.visibility.enum).toEqual(["show", "hide"]);
  });

  // CARD CE3B, 28 Nov 2026: new_price stayed required after E1, so a
  // stock change had to carry a price, and the one-field rule refused it
  // as two changes. Only the product may be required — every field that
  // can be changed is optional, or a single-field change is impossible.
  it("ONLY THE PRODUCT IS REQUIRED — no changeable field may be, or a stock-only call cannot be made", () => {
    const schema: any = (TOOLS as any[]).find((t) => t.name === "propose_price_change");
    expect(schema.input_schema.required).toEqual(["product_description"]);
    expect(schema.description).toMatch(/Pass ONLY the field being changed/);
  });
});
