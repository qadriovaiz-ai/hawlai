// The menu edit Shopify will not be offered — 3.4, 20 November 2026.
//
// THIS FILE EXISTS BECAUSE THE REASON WAS WRONG. The adapter's comment
// said "Shopify has no menu API at all — there is no menu scope and no
// menu object, and `write_online_store_navigation` covers URL
// redirects only." Checked against the 2026-07 reference rather than
// trusted: a `Menu` object exists, `menuCreate` and `menuUpdate` both
// exist, and `write_online_store_navigation` is the scope `menuUpdate`
// itself says it requires. The access-scope TABLE lists only
// `UrlRedirect` against that scope, which is where the mistake came
// from — the table is incomplete and the mutation page is the
// authority.
//
// The exclusion stands, on two reasons that are actually true:
//
//   1. The scope is not granted. App version 4 declares
//      write_products, write_content and write_files. Adding a
//      navigation scope costs a new app version AND every connected
//      merchant re-approving.
//   2. `menuUpdate` replaces the whole menu — `items` and `title` are
//      both required and `items` is the complete list. Changing one
//      link means writing all of them back, and an item shape the read
//      did not understand is an item the write drops.
//
// So what this file pins is not "there is no API". It is: the
// vocabulary has no menu verb, the adapter claims none, the scope
// string asks for none, and the recorded reason cannot go back to the
// false one.

import { describe, it, expect } from "vitest";
import { createShopifyPlatform } from "@/lib/publish/platforms/shopify";
import { ACTION_RISK, type ActionKey, type PublishActionRecord } from "@/lib/publish/types";
import { SHOPIFY_SCOPES } from "@/lib/commerce/shopifyAuth";
import { sourceWithComments, code } from "./helpers/source";

const ADAPTER = "src/lib/publish/platforms/shopify.ts";

/** Anything whose name is about navigation. */
const NAVIGATIONAL = /menu|navigation|nav_/i;

function sent() {
  const calls: unknown[] = [];
  const impl = (async (_u: unknown, init: any) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: {} }) };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const platform = (impl: typeof fetch) =>
  createShopifyPlatform({
    getCredentials: async () => ({ shop: "hawlaitest.myshopify.com", accessToken: "tok" }),
    fetchImpl: impl,
  });

describe("the assistant is never offered a Shopify menu edit", () => {
  it("the detector this file relies on actually detects", () => {
    // Every assertion below is a sweep through NAVIGATIONAL. A regex
    // narrowed to match nothing would make all of them pass while
    // checking nothing at all — the sweep would find no navigational
    // keys because it can no longer recognise one.
    for (const name of ["update_menu", "create_menu", "update_navigation", "nav_items", "MENU"]) {
      expect(NAVIGATIONAL.test(name), `${name} must be recognised as navigational`).toBe(true);
    }
    // And it is not matching everything, which would be the other way
    // to break it.
    for (const name of ["update_page_text", "upload_image", "update_product_price"]) {
      expect(NAVIGATIONAL.test(name), `${name} is not navigational`).toBe(false);
    }
  });

  it("THE LOAD-BEARING ONE: no navigational key is in Shopify's supports", () => {
    // ACTION_RISK is declared `Record<ActionKey, RiskLevel>`, so the
    // compiler forces it to hold EVERY key in the union. That makes
    // Object.keys on it the whole vocabulary at runtime, which is what
    // lets this assertion mean something the day a key is added.
    //
    // It is deliberately written as a sweep rather than naming
    // `update_menu`. WordPress and WooCommerce DO have menu APIs and
    // the plan has a key for them; on the day that key is added to the
    // union, this test is what stops Shopify quietly inheriting it.
    const { impl } = sent();
    const p = platform(impl);
    const all = Object.keys(ACTION_RISK) as ActionKey[];
    const navigational = all.filter((k) => NAVIGATIONAL.test(k));
    for (const key of navigational) {
      expect(p.supports, `Shopify must not claim ${key} — the scope is not granted`).not.toContain(key);
    }
    // Today there is no navigational key at all, which is a stronger
    // statement than the loop above and worth asserting on its own:
    // nothing in this product can even NAME a menu edit.
    expect(navigational).toEqual([]);
    // Not vacuous: the vocabulary is real and the adapter claims some
    // of it.
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(p.supports.length).toBeGreaterThanOrEqual(5);
  });

  it("and refuses one at runtime, writing nothing", async () => {
    // Belt as well as braces. `supports` is what the tool layer reads,
    // but a caller that fabricated the key must not reach Shopify
    // either — preview and execute both read the same list.
    const { impl, calls } = sent();
    const p = platform(impl);
    const fake = { actionKey: "update_menu", dealershipId: "d1", id: "a1", targetRef: "gid://shopify/Menu/1", requestedChanges: {}, preview: null } as unknown as PublishActionRecord;

    const pv = await p.preview(fake);
    expect(pv.ok).toBe(false);
    expect(!pv.ok && pv.reason).toMatch(/cannot do/i);

    const ex = await p.execute(fake);
    expect(ex.ok).toBe(false);
    expect(ex.ok === false && !ex.stale && ex.reason).toMatch(/not built yet/i);

    // The whole point: Shopify was never called.
    expect(calls.length).toBe(0);
  });

  it("the scope string asks for no navigation scope", () => {
    // `supports` and the scopes have to agree. Claiming a menu action
    // while not holding the scope is an offer that fails at Shopify's
    // door; holding the scope while claiming nothing is asking a
    // merchant for access this product does not use. Neither is
    // acceptable, so both halves are checked.
    expect(SHOPIFY_SCOPES).not.toMatch(NAVIGATIONAL);
    // And the scopes it DOES ask for are the three the content work
    // needs — so this test fails if the string is emptied to make the
    // line above pass.
    expect(SHOPIFY_SCOPES).toContain("write_products");
    expect(SHOPIFY_SCOPES).toContain("write_content");
    expect(SHOPIFY_SCOPES).toContain("write_files");
  });

  it("no menu query or mutation is in the adapter, comments excluded", () => {
    // Through `code()`, per the rule: the comment above the exclusion
    // discusses menuUpdate by name while explaining that it is not
    // used, which is precisely the shape that defeats a raw grep.
    const src = code(ADAPTER);
    expect(src).not.toMatch(/menuUpdate\s*\(/);
    expect(src).not.toMatch(/menuCreate\s*\(/);
    expect(src).not.toMatch(/\bmenus\s*\(/);
  });

  it("THE RECORDED REASON CANNOT GO BACK TO THE FALSE ONE", () => {
    // Read WITH comments, deliberately — here the comment IS the thing
    // being asserted. This codebase records why each exclusion exists,
    // and this particular record was wrong until it was checked. A
    // future tidy-up that restored the shorter, wronger reason would
    // read as perfectly sensible to anyone who had not read Shopify's
    // docs.
    //
    // THE FIRST VERSION OF THIS TEST WAS WRONG IN THE SAME WAY THE
    // RULE DESCRIBES. It asserted the false phrase was absent — and
    // the correction QUOTES that phrase in order to retract it, so the
    // test failed on the fix. "Absent" was never the property worth
    // having. The property is: the phrase never appears without its
    // retraction. So: slice to the block, then anchor inside it.
    const withComments = sourceWithComments(ADAPTER);
    const FALSE_CLAIM = "there is no menu scope and no menu object";

    // Exactly once. A second copy somewhere else in the file would be
    // an uncorrected one, and a sweep for the retraction would find
    // this block's and pass.
    expect(withComments.split(FALSE_CLAIM).length - 1, "the false claim appears more than once").toBe(1);

    // The retraction lives in the same comment block, not elsewhere in
    // an 800-line file.
    const at = withComments.indexOf(FALSE_CLAIM);
    const block = withComments.slice(Math.max(0, at - 400), at + 400);
    expect(block, "the false claim is quoted without being marked as past").toMatch(/USED TO SAY/);
    expect(block, "the false claim is quoted without being called false").toMatch(/THAT WAS\s*\n?\s*\*?\s*FALSE/);

    // And the true reasons, both of them, are in the file.
    expect(withComments).toMatch(/THE SCOPE IS NOT GRANTED/);
    expect(withComments).toMatch(/REPLACES THE WHOLE MENU/);
  });
});
