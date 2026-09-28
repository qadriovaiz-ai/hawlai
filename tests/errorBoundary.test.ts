// The SEO page's fallbacks — the sixth part of the 2026-09-28 fix.
//
// Not rendered through renderToStaticMarkup here: React does not run
// error boundaries during static rendering, so a test built that way
// would assert on the happy path only and pass whatever the fallback
// said. These check the two things that actually decide what an owner
// sees — that a thrown error flips the boundary, and what the fallback
// then renders.

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import ErrorBoundary from "../src/components/ui/ErrorBoundary";

describe("the error boundary around a page section", () => {
  it("passes children straight through while nothing is wrong", () => {
    const html = renderToStaticMarkup(
      createElement(ErrorBoundary, { section: "SEO Toolkit", children: createElement("p", null, "the toolkit") })
    );
    expect(html).toContain("the toolkit");
    expect(html).not.toContain("didn't load");
  });

  it("names the section that failed, and says the rest of the page is fine", () => {
    // The state a thrown error puts it in, which React reaches via
    // getDerivedStateFromError.
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });

    const boundary = new ErrorBoundary({ section: "SEO Toolkit", children: null });
    boundary.state = { failed: true };
    const html = renderToStaticMarkup(boundary.render() as any);
    expect(html).toContain("SEO Toolkit didn&#x27;t load");
    expect(html).toContain("The rest of this page is fine");
    expect(html).toContain("Try again");
  });

  it("the SEO page wraps its toolkit, and the route has a fallback of its own", () => {
    const page = readFileSync("src/app/dashboard/seo/page.tsx", "utf8");
    expect(page).toMatch(/<ErrorBoundary section="SEO Toolkit">\s*<SeoToolkit \/>/);
    // Next only uses this file if it is named exactly this, so read it
    // rather than trusting that some error component exists somewhere.
    const route = readFileSync("src/app/dashboard/seo/error.tsx", "utf8");
    expect(route).toContain('"use client"');
    expect(route).toContain("reset");
  });
});
