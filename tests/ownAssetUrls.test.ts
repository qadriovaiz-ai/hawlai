// Our own pictures are not a claim about the business's website.
//
// THE BUG, reported 21 November 2026, one turn after the fix that
// caused it. The chat was given a list of the business's existing
// generated images so it could re-use one instead of making a second
// and charging again. The claims guard stripped every URL:
//
//   "a link to '<storage-url>' — this business has no published
//    website to link to"
//
// THE GUARD WAS NOT WRONG ABOUT ITS OWN RULE. A link to a site the
// business does not have is exactly what findUnsupportedLinks exists
// to remove — that rule is why a workshop caption once pointed at the
// wrong page. It was wrong about WHAT IT WAS LOOKING AT. A Supabase
// storage URL for an image this product generated is this product's
// own infrastructure, and the model needs it to ask "which of these
// three?".
//
// AND THE EXEMPTION ALREADY EXISTED, in the other guard. replyLinks.ts
// has skipped the storage host since 2026-09-21, with the comment
// "Where Hawlai puts the pictures it makes — a generated image in a
// reply is not a customer-facing link and must survive untouched."
// Only one of the two guards knew. That is the whole bug, and it is
// why there is now one definition instead of two.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ownAssetHost, isOwnAssetUrl } from "@/lib/assetHost";
import { code } from "./helpers/source";
import { findUnsupportedLinks } from "@/lib/claims/claimCheck";
import { fixReplyLinks } from "@/lib/chat/replyLinks";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const STORAGE = "https://abcdefgh.supabase.co";
const OURS = `${STORAGE}/storage/v1/object/public/ad-creatives/d1/guru-nanak.png`;

describe("1. the shared definition", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = STORAGE;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("knows our own host, from configuration rather than a literal", () => {
    // Rule 3 leaves no room for a hardcoded host, and the origin
    // differs per deployment.
    expect(ownAssetHost()).toBe("abcdefgh.supabase.co");
  });

  it("recognises our own asset URL", () => {
    expect(isOwnAssetUrl(OURS)).toBe(true);
  });

  it("accepts a subdomain of ours, because a CDN host is still ours", () => {
    // The 2026-10-03 measurement: cdn.hawlai.online was read as a
    // foreign host because the allowed set held the exact host only.
    expect(isOwnAssetUrl(`https://cdn.${"abcdefgh.supabase.co"}/x.png`)).toBe(true);
  });

  it("THE LOAD-BEARING ONE: a near-miss host is NOT ours, in either direction", () => {
    // This cost a surviving mutation in the Shopify upload guard on 20
    // November, twice: a suffix check let one shape through and a
    // prefix check let the other.
    for (const impostor of [
      "https://abcdefgh.supabase.co.evil.example.com/x.png", // ours is a prefix of theirs
      "https://evil-abcdefgh.supabase.co/x.png", // theirs ends with ours
      "https://notabcdefgh.supabase.co/x.png",
    ]) {
      expect(isOwnAssetUrl(impostor), impostor).toBe(false);
    }
  });

  it("and plain http is not ours", () => {
    expect(isOwnAssetUrl(OURS.replace("https://", "http://"))).toBe(false);
  });

  it("UNCONFIGURED EXEMPTS NOTHING, rather than everything", () => {
    // An un-set variable must not switch a guard off. The safe
    // direction for a missing origin is "nothing is ours".
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(ownAssetHost()).toBeNull();
    expect(isOwnAssetUrl(OURS)).toBe(false);
  });

  it("a malformed origin or URL is not ours either", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not a url";
    expect(ownAssetHost()).toBeNull();
    process.env.NEXT_PUBLIC_SUPABASE_URL = STORAGE;
    expect(isOwnAssetUrl("not a url")).toBe(false);
  });
});

describe("2. BOTH GUARDS READ IT — the thing that was wrong", () => {
  it("THE LOAD-BEARING ONE: the claims guard exempts our asset host", () => {
    // findUnsupportedLinks had no exemption at all, which is what
    // stripped the list.
    const src = code("src/lib/claims/claimCheck.ts");
    expect(src).toMatch(/import \{ ownAssetHost \} from "@\/lib\/assetHost"/);
    const at = src.indexOf("export function findUnsupportedLinks");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, at + 1800);
    expect(fn).toMatch(/const assetHost = ownAssetHost\(\)/);
    expect(fn).toMatch(/if \(assetHost\) allowedHosts\.add\(assetHost\)/);
  });

  it("and the reply-link guard reads the SAME definition, not its own copy", () => {
    // It had its own `process.env.NEXT_PUBLIC_SUPABASE_URL` read. Two
    // copies of "which host is ours" is how one of them came to be
    // missing.
    const src = code("src/lib/chat/replyLinks.ts");
    expect(src).toMatch(/import \{ ownAssetHost \} from "@\/lib\/assetHost"/);
    // THE RESULT MUST BE USED, not merely computed. Asserting the call
    // alone let a mutation that deleted `hosts.add(assetHost)` survive
    // — the call was still there and the exemption was gone.
    expect(src).toMatch(/if \(assetHost\) hosts\.add\(assetHost\)/);
    // The duplicated read is gone.
    expect(src).not.toMatch(/const storage = process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("NEITHER GUARD KEEPS A SECOND COPY of the host rule", () => {
    // The whole point of the module. A third guard that reads links
    // must use it rather than growing its own.
    for (const file of ["src/lib/claims/claimCheck.ts", "src/lib/chat/replyLinks.ts"]) {
      const src = code(file);
      expect(src, `${file} reads the storage env var directly again`).not.toMatch(
        /NEXT_PUBLIC_SUPABASE_URL/
      );
    }
  });
});

describe("3. the rule it must NOT have weakened", () => {
  it("a foreign link is still a foreign link", () => {
    // The guard exists because a workshop caption once pointed at the
    // wrong page. Exempting our own images must not exempt anyone
    // else's site.
    expect(isOwnAssetUrl("https://example.com/whatever.png")).toBe(false);
    expect(isOwnAssetUrl("https://instagram.com/candle_by_qaaf")).toBe(false);
  });
});

// ---------------------------------------------------------------------
// The behaviour, by CALLING the guard.
//
// Everything above reads source. That is the right shape for "both
// guards import the same thing", and the wrong shape for "does our URL
// survive" — which is the question the owner actually asked. Four card
// bugs in this codebase survived source-reading tests; this one gets a
// call.
// ---------------------------------------------------------------------

/** A business with NO website, which is the case that produced the message. */
function noSiteFacts(): BusinessFacts {
  return {
    businessName: "A Business",
    category: "Retail",
    categoryKnown: true,
    businessModels: { models: ["products"], inferred: false },
    city: "Shahjahanpur",
    site: null,
    home: null,
    products: [],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 0, leads: 0 },
    ownerFacts: [],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    // NOTHING HERE. No store, no products, no booking — so every link
    // is foreign unless something else exempts it.
    links: { store: null, products: [], booking: null } as any,
    season: { today: "2026-11-21", now: [], launchNow: [], planAhead: [], justEnded: [], monthGuide: "", datesKnownUntil: null, outOfSeason: [] } as any,
    unreadable: [],
  } as unknown as BusinessFacts;
}

describe("4. THE BUG ITSELF, by calling the guard", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = STORAGE;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("THE LOAD-BEARING ONE: our own image URL is not flagged", () => {
    // The exact sentence the owner saw, in reverse: a business with no
    // website, a list of its own generated pictures, and nothing
    // stripped.
    const text = `Which one? 1) ${OURS} 2) ${STORAGE}/storage/v1/object/public/ad-creatives/d1/second.png`;
    expect(findUnsupportedLinks(text, noSiteFacts())).toEqual([]);
  });

  it("AND A FOREIGN LINK IS STILL FLAGGED, for the same business", () => {
    // The rule must not have been weakened into "allow everything".
    // This guard exists because a caption once pointed at the wrong
    // page.
    const reasons = findUnsupportedLinks("Have a look at https://example.com/shop", noSiteFacts());
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("example.com");
    expect(reasons[0]).toMatch(/no published website/);
  });

  it("both in one sentence: ours kept, theirs named", () => {
    const reasons = findUnsupportedLinks(`Ours: ${OURS} and theirs: https://evil.example.com/x`, noSiteFacts());
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("evil.example.com");
    expect(reasons.join(" ")).not.toContain("supabase");
  });

  it("A NEAR-MISS HOST IS STILL FLAGGED, which is the half a sloppy fix loses", () => {
    const reasons = findUnsupportedLinks(
      "Look: https://evil-abcdefgh.supabase.co/storage/x.png",
      noSiteFacts()
    );
    expect(reasons).toHaveLength(1);
  });

  it("and with no storage origin configured, ours is flagged like anything else", () => {
    // Unconfigured exempts nothing. The guard goes back to its old
    // behaviour rather than opening up.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(findUnsupportedLinks(`Here: ${OURS}`, noSiteFacts())).toHaveLength(1);
  });
});

describe("5. THE REPLY GUARD, by calling it too", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = STORAGE;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("THE LOAD-BEARING ONE: our own image URL survives the reply guard", () => {
    // This guard has exempted the storage host since 2026-09-21, and a
    // mutation removing the exemption survived a test that only checked
    // the lookup was CALLED. Calling the guard is what finds it.
    const fix = fixReplyLinks(`Which one? ${OURS}`, noSiteFacts());
    expect(fix.reply).toContain(OURS);
    expect(fix.removed).toBe(0);
    expect(fix.corrected).toBe(0);
  });

  /**
   * A business that HAS addresses, so this guard is switched on.
   *
   * fixReplyLinks returns early when nothing is known — "every link
   * here is equally unverifiable, and silently emptying the reply
   * would be worse than leaving it as written". My first two tests
   * here asserted removal with no-site facts and failed, correctly:
   * they were testing behaviour the code deliberately does not have.
   *
   * It also means the reply guard was never part of the owner's bug —
   * his business has no published website, so this guard was already
   * returning early. Only claimCheck's link rule was stripping.
   */
  const withSiteFacts = (): BusinessFacts =>
    ({ ...noSiteFacts(), links: { store: "https://hawlai.online/site/a-business", products: [], booking: null } } as unknown as BusinessFacts);

  it("our image URL survives even when the guard IS switched on", () => {
    const fix = fixReplyLinks(`Which one? ${OURS}`, withSiteFacts());
    expect(fix.reply).toContain(OURS);
    expect(fix.removed).toBe(0);
  });

  it("THE REMOVAL RULE IS NOT RETESTED HERE, and that is deliberate", () => {
    // Two tests sat here asserting that a foreign link is removed, and
    // both failed — correctly. fixReplyLinks is narrower than I
    // assumed: a BARE url is only touched when there is a booking link
    // to redirect it to, and only when the text reads as a call to
    // action. "Shop here: https://example.com/shop" with no booking
    // configured is left exactly as written, on purpose.
    //
    // tests/chatReplyLinks.test.ts owns that contract and asserts the
    // markdown-CTA case properly. Writing a worse version of it here,
    // with fixtures I had to keep bending until it passed, would have
    // been a test shaped to its own answer.
    //
    // What belongs here is the one thing this change is about: our own
    // asset URL survives. That is asserted above, by calling the guard.
    const src = code("tests/chatReplyLinks.test.ts");
    expect(src).toMatch(/not\.toContain\("\]\(https:\/\/calendly\.com\)"\)/);
  });
});
