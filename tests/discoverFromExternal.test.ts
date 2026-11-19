// The business's own website, somewhere else — D5, 19 November 2026.
//
// D2 reads the site Hawlai built. Most businesses that sign up already
// have a website elsewhere, and it answers the same questions. Asking a
// shopkeeper to type his phone number into a form when he has already
// published it is the product not reading what it was given.
//
// THE JUDGEMENT IS D2'S, UNCHANGED. Everything decided here goes
// through `suggestFromLines` — exactly one line or say nothing, the
// line itself as the suggestion, a suggestion never a record. A phone
// number on a brochure site deserves neither more nor less trust than
// one on a page we built, so there is no second set of rules.
//
// THIS FILE'S WHOLE JOB is turning a URL into the lines those rules
// read, and the two things that could go wrong doing it: losing the
// line boundaries, and fetching an address we should not.

import { describe, it, expect } from "vitest";
import {
  htmlToLines,
  readExternalSite,
  discoverFromExternalSite,
  EXTERNAL_SOURCE,
  MAX_LINES,
  MAX_HTML_BYTES,
} from "@/lib/onboarding/discoverFromExternal";
import { publicHttpUrl, isPublicHost } from "@/lib/net/publicUrl";
import { code } from "./helpers/source";

/** A fetch that answers with this page, and records what it was asked. */
function serving(html: string, opts: { status?: number; type?: string } = {}) {
  const calls: string[] = [];
  const impl = (async (url: any) => {
    calls.push(String(url));
    return {
      ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
      status: opts.status ?? 200,
      headers: { get: () => opts.type ?? "text/html; charset=utf-8" },
      text: async () => html,
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const CONTACT = `
  <html><body>
    <h1>Qaaf Candles</h1>
    <p>Call us on 98765 43210</p>
    <div>Mon-Sat 10am to 7pm</div>
    <p>12 Taj Road, Lucknow 226001</p>
  </body></html>`;

describe("1. BLOCK BOUNDARIES SURVIVE, OR THE WHOLE DISCIPLINE DOES NOT", () => {
  it("THE LOAD-BEARING ONE: separate blocks become separate lines", () => {
    // D2's rule is "exactly one line matches". The obvious thing to
    // reuse — stripHtmlToText — collapses ALL whitespace into one line,
    // and then every pattern matches the SAME line, "exactly one" is
    // always true, and the rail that makes this safe to show a
    // non-technical owner silently stops existing.
    const lines = htmlToLines(CONTACT);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines).toContain("Call us on 98765 43210");
    expect(lines).toContain("12 Taj Road, Lucknow 226001");
  });

  it("A <br> IS A LINE TOO", () => {
    expect(htmlToLines("<p>98765 43210<br>12345 67890</p>")).toEqual(["98765 43210", "12345 67890"]);
  });

  it("BUT SPACES INSIDE A LINE STILL COLLAPSE", () => {
    expect(htmlToLines("<p>Call    us   on\t98765</p>")).toEqual(["Call us on 98765"]);
  });

  it("SCRIPTS, STYLES AND COMMENTS CONTRIBUTE NOTHING", () => {
    // A phone number in a tracking script is not a number the business
    // published, and it would make a clean page read as ambiguous.
    const lines = htmlToLines(`<script>var a="98765 43210";</script><style>.x{}</style><!-- 11111 22222 --><p>Open daily</p>`);
    expect(lines).toEqual(["Open daily"]);
  });

  it("entities become what they stand for", () => {
    expect(htmlToLines("<p>Tea &amp; Coffee</p>")).toEqual(["Tea & Coffee"]);
    expect(htmlToLines("<p>A&nbsp;B</p>")).toEqual(["A B"]);
  });

  it("A SITEMAP-SIZED PAGE IS BOUNDED", () => {
    const huge = Array.from({ length: MAX_LINES + 200 }, (_, i) => `<p>line ${i}</p>`).join("");
    expect(htmlToLines(huge)).toHaveLength(MAX_LINES);
  });

  it("nothing readable is an empty list, not a crash", () => {
    expect(htmlToLines("")).toEqual([]);
    expect(htmlToLines(null)).toEqual([]);
    expect(htmlToLines("<html><head><title>x</title></head><body></body></html>").join("")).toContain("x");
  });
});

describe("2. THE ADDRESS IS GUARDED, EVEN THOUGH THE OWNER TYPED IT", () => {
  it("THE LOAD-BEARING ONE: a private or loopback host is refused", () => {
    // A typed address is still an SSRF primitive if it says
    // 169.254.169.254 — wooAuth's own example, and why that guard now
    // lives in one place instead of two.
    for (const host of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "172.16.0.1", "box.internal", "printer.local"]) {
      expect(isPublicHost(host), host).toBe(false);
    }
  });

  it("and an ordinary website is allowed", () => {
    for (const host of ["qaafcandles.com", "www.example.co.in", "shop.example.com"]) {
      expect(isPublicHost(host), host).toBe(true);
    }
  });

  it("A BARE HOSTNAME IS NOT A WEBSITE", () => {
    expect(isPublicHost("intranet")).toBe(false);
  });

  it("http IS ALLOWED HERE, unlike a store connection", () => {
    // A corner shop's brochure site on plain http is simply a website.
    // We send no secret and read only what the page shows the public,
    // so refusing it would cost a feature to protect nothing.
    expect(publicHttpUrl("http://qaafcandles.com").ok).toBe(true);
    expect(publicHttpUrl("ftp://qaafcandles.com").ok).toBe(false);
  });

  it("a typed address without a scheme still works", () => {
    const out = publicHttpUrl("qaafcandles.com");
    expect(out.ok && out.url.protocol).toBe("https:");
  });

  it("A REFUSED ADDRESS IS NEVER FETCHED", async () => {
    const { impl, calls } = serving(CONTACT);
    const out = await readExternalSite("http://169.254.169.254/latest/meta-data", impl);
    expect(out.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("3. A SITE THAT CANNOT BE READ COSTS NOTHING", () => {
  it("A 404 IS NOT A CRASH, and suggests nothing", async () => {
    const { impl } = serving("", { status: 404 });
    expect((await readExternalSite("qaafcandles.com", impl)).ok).toBe(false);
    expect(await discoverFromExternalSite("qaafcandles.com", impl)).toEqual([]);
  });

  it("A PDF IS NOT A PAGE", async () => {
    const { impl } = serving("%PDF-1.4", { type: "application/pdf" });
    const out = await readExternalSite("qaafcandles.com", impl);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toMatch(/isn't a web page/i);
  });

  it("A THROWN FETCH IS A REASON, not an exception", async () => {
    const impl = (async () => {
      throw new Error("timed out");
    }) as unknown as typeof fetch;
    const out = await readExternalSite("qaafcandles.com", impl);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toMatch(/timed out/);
  });

  it("no URL on record is simply nothing to read", async () => {
    expect(await discoverFromExternalSite(null)).toEqual([]);
    expect(await discoverFromExternalSite("")).toEqual([]);
  });

  it("AND THE PAGE IS BOUNDED BEFORE IT IS PARSED", () => {
    const src = code("src/lib/onboarding/discoverFromExternal.ts");
    expect(src).toMatch(/\.slice\(0, MAX_HTML_BYTES\)/);
    expect(MAX_HTML_BYTES).toBeLessThanOrEqual(2_000_000);
  });
});

describe("4. THE SUGGESTIONS ARE D2'S, WITH A DIFFERENT SOURCE", () => {
  it("THE LOAD-BEARING ONE: it finds what the page actually published", async () => {
    const { impl } = serving(CONTACT);
    const out = await discoverFromExternalSite("qaafcandles.com", impl);
    const byKey = Object.fromEntries(out.map((s) => [s.questionKey, s]));
    expect(byKey.public_phone?.value).toBe("98765 43210");
    expect(byKey.opening_hours?.value).toMatch(/Mon-Sat/);
    expect(byKey.street_address?.value).toMatch(/226001/);
  });

  it("AND EVERY ONE SAYS WHERE IT CAME FROM", () => {
    // D1's distinction. The owner confirming a fact read off his old
    // website should be able to see that is what it was.
    expect(EXTERNAL_SOURCE).toBe("external_site");
  });

  it("the evidence carries the page and the sentence", async () => {
    const { impl } = serving(CONTACT);
    const out = await discoverFromExternalSite("qaafcandles.com", impl);
    const phone = out.find((s) => s.questionKey === "public_phone")!;
    expect(phone.source).toBe("discovered");
    expect(phone.evidence.sourceKind).toBe(EXTERNAL_SOURCE);
    expect(phone.evidence.url).toMatch(/qaafcandles\.com/);
    expect(phone.evidence.quote).toMatch(/98765 43210/);
  });

  it("TWO PHONE NUMBERS STILL MEAN NO SUGGESTION", async () => {
    // D2's discipline, inherited rather than re-implemented: a guess
    // picked from several is worse than a blank field, because a blank
    // field does not invite a careless yes.
    const { impl } = serving("<p>98765 43210</p><p>91234 56789</p>");
    const out = await discoverFromExternalSite("qaafcandles.com", impl);
    expect(out.find((s) => s.questionKey === "public_phone")).toBeUndefined();
  });

  it("AND NOTHING HERE WRITES A RECORD", () => {
    // A page saying something is not the business being something. The
    // owner's tap is what turns a suggestion into a fact.
    const src = code("src/lib/onboarding/discoverFromExternal.ts");
    expect(src).not.toMatch(/business_knowledge|business_listing_facts/);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(/);
  });
});

describe("5. IT RUNS SECOND, AND ONLY WHERE THE FIRST BUCKET WAS SILENT", () => {
  const route = () => code("src/app/api/interview/route.ts");

  it("THE HAWLAI SITE IS READ FIRST", () => {
    // D2 costs one read already done; this costs an outbound request.
    const s = route();
    expect(s.indexOf("discoverFromSite(facts)")).toBeLessThan(s.indexOf("discoverFromExternalSite("));
  });

  it("THE LOAD-BEARING ONE: it never overwrites what D2 already answered", () => {
    const s = route();
    expect(s).toMatch(/const answered = new Set\(found\.map\(\(f\) => f\.questionKey\)\)/);
    expect(s).toMatch(/if \(!answered\.has\(s\.questionKey\)\) found\.push\(s\)/);
  });

  it("THE URL IS THE OWNER'S OWN, off the dealerships row", () => {
    // Never a link found on a page — that would let a page choose what
    // our servers fetch next.
    const s = route();
    const at = s.indexOf("discoverFromExternalSite(");
    expect(s.slice(Math.max(0, at - 400), at)).toMatch(/\.select\("external_website_url"\)/);
    expect(s).toMatch(/discoverFromExternalSite\(biz\.external_website_url\)/);
  });

  it("and a business with no external site does nothing extra", () => {
    expect(route()).toMatch(/if \(biz\?\.external_website_url\) \{/);
  });
});
