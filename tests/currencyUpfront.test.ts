// The store's currency is stated BEFORE any amount, at every stage.
//
// FROM THE FIRST LIVE TEST. The confirmation read "₹749.95" for a
// product priced $749.95 — the rupee symbol was hardcoded. The first
// fix read the real currency from Shopify, which stopped the wrong
// symbol but left a subtler gap: the merchant still saw a number
// before they saw its unit, and a mismatch had to be explained
// afterwards.
//
// Naming the currency FIRST removes the ambiguity at source. Nothing
// needs reinterpreting, because the number they gave is simply applied
// in the currency they were shown — there is no gap between what is
// agreed and what is executed.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { describeCurrency, parseStatedPrice, formatMoney } from "@/lib/publish/money";

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

describe("describeCurrency says it plainly", () => {
  it("names the code and its symbol", () => {
    expect(describeCurrency("USD")).toBe("USD ($)");
    expect(describeCurrency("INR")).toBe("INR (₹)");
    expect(describeCurrency("GBP")).toBe("GBP (£)");
  });

  it("falls back to the bare code rather than guessing a symbol", () => {
    // An invented symbol on a live price is worse than a plain code.
    expect(describeCurrency("XYZ")).toBe("XYZ");
  });

  it("returns null when there is nothing to name", () => {
    // Honest silence. A caller then omits the phrase entirely rather
    // than printing "Store currency: null".
    for (const v of [null, undefined, "", "US"]) {
      expect(describeCurrency(v as any)).toBeNull();
    }
  });
});

describe("a stated amount is read, never turned into a question", () => {
  it("reads a bare number", () => {
    expect(parseStatedPrice("999")).toEqual({ amount: "999", statedCurrency: null });
  });

  it("reads symbols and words the same way", () => {
    // A store's currency is fixed in Shopify's settings, so "which
    // currency did you mean?" offers a decision the merchant does not
    // have. The number is the instruction; the currency word is
    // context.
    expect(parseStatedPrice("$999").amount).toBe("999");
    expect(parseStatedPrice("₹999").amount).toBe("999");
    expect(parseStatedPrice("999 rupees").amount).toBe("999");
    expect(parseStatedPrice("rs 1,299").amount).toBe("1299");
    expect(parseStatedPrice("799.95 dollars")).toEqual({ amount: "799.95", statedCurrency: "USD" });
  });

  it("strips thousands separators", () => {
    // "1,299" is 1299, not 1. Parsing before stripping would set a
    // product to one rupee.
    expect(parseStatedPrice("1,299").amount).toBe("1299");
    expect(parseStatedPrice("12,34,567").amount).toBe("1234567");
  });

  it("reports no amount rather than inventing one", () => {
    for (const v of ["", "   ", "cheaper", "make it nice"]) {
      expect(parseStatedPrice(v).amount).toBeNull();
    }
  });
});

describe("formatMoney never guesses a symbol", () => {
  it("formats in the store's currency", () => {
    expect(formatMoney("749.95", "USD")).toContain("$");
    expect(formatMoney("749.95", "INR")).toContain("₹");
  });

  it("prints the bare number when the currency is unknown", () => {
    // THE ORIGINAL BUG, inverted. Defaulting to ₹ is what showed
    // "₹749.95" for a $749.95 product; a number with no symbol is
    // unhelpful but never WRONG.
    expect(formatMoney("749.95", null)).toBe("749.95");
    expect(formatMoney("749.95", undefined)).toBe("749.95");
  });
});

describe("all three stages state the currency before any amount", () => {
  const shopify = committed("src/lib/publish/platforms/shopify.ts");
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const handler = brain.slice(
    brain.indexOf('case "propose_price_change": {'),
    brain.indexOf('case "propose_campaign_budget_change":')
  );

  it("stage 1 — the preview summary leads with it", () => {
    expect(shopify).toMatch(/Store currency: \$\{currencyLabel\}/);
  });

  it("stage 2 — the disambiguation question leads with it", () => {
    // A candidate list is where the merchant first sees prices, so it
    // is the first place the currency has to be unambiguous.
    expect(handler).toMatch(/Your store's currency is \$\{listCurrency\}/);
    expect(handler).toContain("store_currency: listCurrency");
  });

  it("stage 3 — the success payload carries it for the confirmation", () => {
    expect(handler).toContain("store_currency:");
    expect(handler).toContain("state_currency_first");
  });

  it("the tool description tells the model to lead with it", () => {
    // The model composes the confirmation sentence. Without this
    // instruction it would happily write "change to 799?" with no
    // currency at all — the gap this whole change exists to close.
    const description = brain.slice(brain.indexOf('name: "propose_price_change"'), brain.indexOf('input_schema', brain.indexOf('name: "propose_price_change"')));
    expect(description).toMatch(/state the store's currency/i);
    expect(description).toMatch(/BEFORE the amounts/i);
  });

  it("no hardcoded rupee symbol survives in the publish path", () => {
    // The original defect, asserted against directly. An India-first
    // product still has merchants on USD stores, and a wrong currency
    // label on a live price change is exactly what erodes trust in the
    // preview.
    for (const file of [
      "src/lib/publish/platforms/shopify.ts",
      "src/lib/publish/money.ts",
      "src/lib/publish/create.ts",
    ]) {
      // Targets the DEFECT SHAPE, not every occurrence of the symbol.
      //
      // money.ts legitimately maps "₹" to INR when READING what a
      // merchant typed. That is input parsing, and banning it would
      // mean refusing to understand someone who types ₹999 — the
      // opposite of the fix.
      //
      // The bug was a rupee sign in OUTPUT: a literal glued to an
      // amount, as in `₹${price}` or "₹" + price. That is what this
      // looks for, so the check stays sharp instead of being
      // whitelisted away file by file.
      const source = committed(file);
      const offending = source
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .filter((l) => /₹\s*(\$\{|"\s*\+|\+)/.test(l) || /(\}|\+\s*")\s*₹/.test(l));
      expect(offending, `${file} formats an amount with a hardcoded ₹: ${offending.join(" | ")}`).toEqual([]);
    }
  });
});
