// The agent is on the whole site, not one landing page — V4a.
//
// It lived on /p/[slug] only. A business with a real Website Builder
// storefront — products, policies, an about page, the pages a visitor
// actually has questions about — had nobody to ask. That was a
// placement problem rather than an intelligence one, and these tests
// are about placement: the route answers for a site, the widget is
// mounted on every page of one, and a draft still answers for nobody.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

const ROUTE = "src/app/api/public/chat/route.ts";
const LAYOUT = "src/app/site/[slug]/layout.tsx";

describe("1. THE CHAT ROUTE ANSWERS FOR A STOREFRONT", () => {
  it("IT RESOLVES THE SLUG THROUGH THE SHARED RESOLVER", () => {
    // Which is what makes a `websites` slug work at all — and what
    // makes an unpublished draft resolve to nobody here too, without a
    // third hand-written copy of that rule.
    const src = code(ROUTE);
    expect(src).toMatch(/resolvePublicSite\(supabase, slug\)/);
  });

  it("AND NO LONGER LOOKS THE SLUG UP IN landing_pages ITSELF", () => {
    const src = code(ROUTE);
    const lookup = src.indexOf('.from("landing_pages")');
    expect(lookup).toBeGreaterThan(-1); // it still reads the page's own copy
    // ...but only AFTER the resolver has said whose page it is, and
    // only for a landing page. Slice from the resolver call to the
    // lookup: the resolver must come first.
    expect(src.indexOf("resolvePublicSite(supabase, slug)")).toBeLessThan(lookup);
  });

  it("A STOREFRONT IS NOT GIVEN A LANDING PAGE'S HEADLINE OR OFFER", () => {
    // THE LOAD-BEARING ONE. `headline` and `offer_text` are the
    // quick-launch page's own copy. Reading them by slug without
    // checking which kind of page answered would hand a storefront the
    // tagline and the "current offer" of somebody else's landing page
    // that happens to share a slug — an offer the agent would then
    // repeat to a visitor as if it were running.
    const src = code(ROUTE);
    const start = src.indexOf("const [{ data: dealership }, { data: page }]");
    expect(start).toBeGreaterThan(-1);
    const read = src.slice(start, src.indexOf("]);", start));
    expect(read).toMatch(/site\.source === "landing_page"/);
    expect(read).toMatch(/Promise\.resolve\(\{ data: null \}\)/);
  });

  it("and the page's own copy is optional everywhere it is used", () => {
    const src = code(ROUTE);
    expect(src).toMatch(/headline: page\?\.headline \?\? null/);
    expect(src).toMatch(/offerText: page\?\.offer_text \?\? null/);
  });

  it("THE BUSINESS COMES FROM THE RESOLVER, not from the page row", () => {
    // Every use of the business id must be the resolved one; a leftover
    // `page.dealership_id` would be null for a storefront and the turn
    // would run against undefined.
    const src = code(ROUTE);
    expect(src).not.toMatch(/page\.dealership_id/);
    expect(src).toMatch(/const dealershipId = site\.dealershipId;/);
  });
});

describe("2. THE WIDGET IS ON EVERY PAGE OF THE SITE", () => {
  it("IT IS MOUNTED IN THE LAYOUT, not on one page", () => {
    // The same reasoning the tracker in this file already carries: a
    // visitor can land on a product page, a custom page or the cart,
    // and the question they want to ask follows them.
    const src = code(LAYOUT);
    expect(src).toMatch(/import ChatWidget from "@\/components\/website\/ChatWidget"/);
    expect(src).toMatch(/<ChatWidget\s/);
  });

  it("AND IT IS GIVEN THE FORMATTED BUSINESS NAME, not the signup handle", () => {
    // "Ask candle_by_qaaf" is the bug this layout's header and footer
    // were already fixed for; the widget prints the same name.
    const src = code(LAYOUT);
    const mount = src.slice(src.indexOf("<ChatWidget"));
    const tag = mount.slice(0, mount.indexOf("/>"));
    expect(tag).toMatch(/dealershipName=\{dealershipName\}/);
    expect(tag).not.toMatch(/dealership_name/);
  });

  it("the storefront layout still only renders for a published site", () => {
    // The widget inherits this: the layout calls notFound() first, so
    // there is no mount on a draft to begin with.
    const src = code(LAYOUT);
    const guard = src.indexOf("notFound()");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf("<ChatWidget"));
  });
});

describe("3. THE LANDING PAGE IS UNCHANGED", () => {
  it("it still mounts the same widget", () => {
    // V4a is an upgrade in placement. If this stops rendering, the
    // change has moved the agent rather than spread it.
    const src = code("src/app/p/[slug]/page.tsx");
    expect(src).toMatch(/<ChatWidget\s/);
  });
});
