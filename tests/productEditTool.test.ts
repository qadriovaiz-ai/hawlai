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

  it("STILL ONE CHANGE PER CARD", () => {
    expect(tool).toMatch(/if \(askedFields\.length > 1\) \{\s*return \{ error: "One change at a time/);
  });

  it("\"none\" CLEARS ONLY THE THREE THAT MAY BE EMPTY — never a price or a name", () => {
    expect(tool).toMatch(/const CLEARABLE = new Set\(\["stock", "compare_price", "category"\]\);/);
    expect(tool).toMatch(/const cleared = CLEARABLE\.has\(field\) && \/\^\(none\|clear\|remove\|not tracked\|unlimited\)\$\/i\.test\(fieldValue\) \? "" : fieldValue;/);
  });

  it("SHOW/HIDE IS ONLY 'show' OR 'hide', AND BECOMES shown/hidden", () => {
    expect(tool).toMatch(/if \(field === "visibility" && !\/\^\(show\|hide\)\$\/i\.test\(fieldValue\)\) return \{ error:/);
    expect(tool).toMatch(/\{ visibility: \/\^show\$\/i\.test\(fieldValue\) \? "shown" : "hidden" \}/);
  });

  it("THE SCHEMA OFFERS THE FOUR NEW FIELDS — and show/hide only as show or hide", () => {
    const schema: any = (TOOLS as any[]).find((t) => t.name === "propose_price_change");
    const props = schema.input_schema.properties;
    for (const k of ["new_stock", "new_compare_at_price", "new_category", "visibility"]) expect(props[k], k).toBeTruthy();
    expect(props.visibility.enum).toEqual(["show", "hide"]);
  });
});
