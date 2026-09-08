// Prices are shown in the STORE's currency, never an assumed one.
//
// FROM THE FIRST LIVE TEST. The preview showed "₹749.95" for a product
// priced at $749.95 — the test store is on USD.
//
// The instructive part is where the bug was NOT: nothing in the
// publish path had hardcoded a rupee symbol. The path emitted a BARE
// NUMBER, and Master Chat's system prompt ("ground everything in
// India-specific business reality") supplied the symbol from context.
// Handing a model a number and expecting it not to render one is a
// wish, not a design.
//
// This matters past tidiness. A wrong currency on a live price change
// is the sort of detail that makes an approver stop trusting the
// preview — and the preview is the ONLY place a mis-resolved product
// or a mistyped amount gets caught before customers see it.

import { describe, it, expect } from "vitest";
import { formatMoney } from "@/lib/publish/money";

describe("formatMoney", () => {
  it("formats in the store's actual currency", () => {
    expect(formatMoney("749.95", "USD")).toContain("749.95");
    expect(formatMoney("749.95", "USD")).toContain("$");
    expect(formatMoney("1299", "INR")).toContain("₹");
  });

  it("does NOT assume rupees when the currency is unknown", () => {
    // THE LOAD-BEARING ONE. A bare number is honest; a guessed symbol
    // is the bug. Silence beats a confident wrong answer here.
    for (const missing of [null, undefined, "", "   "]) {
      const out = formatMoney("749.95", missing as any);
      expect(out).not.toContain("₹");
      expect(out).not.toContain("$");
      expect(out).toBe("749.95");
    }
  });

  it("degrades to CODE + amount for an unrecognised currency", () => {
    // An odd code should not take down a preview a merchant is
    // waiting on. Unambiguous beats pretty.
    const out = formatMoney("100", "XYZ");
    expect(out).toMatch(/XYZ|100/);
  });

  it("handles a missing or non-numeric amount without throwing", () => {
    expect(formatMoney(null, "USD")).toBe("unknown");
    expect(formatMoney(undefined, "USD")).toBe("unknown");
    expect(formatMoney("", "USD")).toBe("unknown");
    expect(formatMoney("not-a-number", "USD")).toBe("not-a-number");
  });

  it("accepts a number as readily as a string", () => {
    // Shopify returns Money as a string; a caller computing one will
    // have a number. Both must render the same.
    expect(formatMoney(999, "USD")).toBe(formatMoney("999", "USD"));
  });

  it("is case-insensitive about the code", () => {
    expect(formatMoney("10", "usd")).toBe(formatMoney("10", "USD"));
  });
});

describe("the store currency is actually fetched", () => {
  it("both Shopify queries ask for it", async () => {
    // The formatter is useless if nothing supplies a code. Asserted
    // against the real query strings so a future edit that drops the
    // field fails here rather than in front of a merchant.
    const { execFileSync } = await import("child_process");
    const read = (f: string) =>
      execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

    expect(read("src/lib/publish/platforms/shopify.ts")).toContain("shop { currencyCode }");
    expect(read("src/lib/publish/platforms/shopifySearch.ts")).toContain("shop { currencyCode }");
  });
});

describe("parseStatedPrice — the store's currency is not a user choice", () => {
  it("reads a bare number", async () => {
    const { parseStatedPrice } = await import("@/lib/publish/money");
    expect(parseStatedPrice("999")).toEqual({ amount: "999", statedCurrency: null });
  });

  it("reads symbols and words as the SAME instruction", async () => {
    const { parseStatedPrice } = await import("@/lib/publish/money");
    // Every one of these means "set it to 999". A store's currency is
    // fixed in Shopify's settings, so asking "which currency?" offers
    // a decision the merchant does not have.
    for (const said of ["₹999", "$999", "999 rupees", "rs 999", "999 dollars", "USD 999", "£999"]) {
      expect(parseStatedPrice(said).amount, said).toBe("999");
    }
  });

  it("records WHICH currency was named, for the preview warning", async () => {
    const { parseStatedPrice } = await import("@/lib/publish/money");
    expect(parseStatedPrice("₹999").statedCurrency).toBe("INR");
    expect(parseStatedPrice("$999").statedCurrency).toBe("USD");
    expect(parseStatedPrice("999 rupees karo").statedCurrency).toBe("INR");
    expect(parseStatedPrice("999").statedCurrency).toBeNull();
  });

  it("strips thousands separators", async () => {
    const { parseStatedPrice } = await import("@/lib/publish/money");
    // "1,299" is 1299, not 1 — the difference between a price and a
    // catastrophe.
    expect(parseStatedPrice("₹1,299").amount).toBe("1299");
    expect(parseStatedPrice("1,00,000").amount).toBe("100000");
  });

  it("keeps decimals", async () => {
    const { parseStatedPrice } = await import("@/lib/publish/money");
    expect(parseStatedPrice("$749.95").amount).toBe("749.95");
  });

  it("returns null rather than guessing when there is no number", async () => {
    const { parseStatedPrice } = await import("@/lib/publish/money");
    for (const junk of ["", "   ", "cheaper please", "rupees"]) {
      expect(parseStatedPrice(junk).amount, junk).toBeNull();
    }
  });
});

describe("no page-pointing in the price-change notes", () => {
  it("neither note tells the person to go somewhere else", async () => {
    const { execFileSync } = await import("child_process");
    const src = execFileSync("git", ["show", "HEAD:src/lib/agents/masterBrainV2.ts"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const handler = src.slice(src.indexOf('case "propose_price_change": {'), src.indexOf('case "propose_campaign_budget_change":'));
    // The decision is on the card. Sending someone to a separate page
    // is the bug that came back through the duplicate path after being
    // fixed once on the happy path — so both notes are asserted, not
    // just the one that was reported.
    expect(handler).not.toMatch(/go to \/dashboard|waiting in Approvals|review it there/i);
    expect(handler).toMatch(/still waiting on your approval/);
    expect(handler).toMatch(/Ready for your approval below/);
  });
});
