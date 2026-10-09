// HAWLAI BELONGS TO EVERY BUSINESS THAT SIGNS UP, NOT TO ONE OF THEM.
//
// Two leaks, from two eras, found together on 2026-10-09 with real
// businesses due to test the next day.
//
// THE FIRST is older than the product's current name. Hawlai began as
// AutoPilot AI, for car dealerships, and the vocabulary stayed behind in
// the places nobody re-read: the SIGNUP PAGE asked for a "Dealership
// Name"; the Appointments page was subtitled "Scheduled test rides and
// showroom visits"; the landing-page fallback called every business
// "Your Trusted Car Partner" and offered "Book a free test drive today";
// the video-script fallback was a car in a showroom; the ad-copy
// fallback read "Limited Stock! Hurry, offer ends soon."
//
// THE SECOND is newer and was ours. Every incident this year happened on
// one real business — a candle shop — so its words seeped into prompt
// examples, placeholders and stopword lists until a sweet shop asking
// for a Reel could be handed a script about scented candles.
//
// Both are the same bug: ONE business's vocabulary presented to all of
// them. This test fails the build when it comes back.
//
// WHAT IT CANNOT DO: prove the copy is category-neutral. A prompt can
// still assume a physical product nobody ships. See
// tests/multiTenantRender.test.ts for the execution half.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";

// ---------------------------------------------------------------------
// The vocabulary, grouped by the business it belongs to.
// ---------------------------------------------------------------------

/**
 * Grouped on purpose. A line naming TWO different categories is a
 * deliberately mixed example, which is what we want prompts to use —
 * "e.g. 'the lavender candle', 'kaju katli box', 'weekend coaching
 * batch'" teaches the model the shape without teaching it one trade.
 * Only a line that names a single category's words is a leak.
 */
const FAMILIES: Record<string, RegExp[]> = {
  automotive: [
    /\btest[ _-]?drives?\b/i,
    /\btest[ _-]?rides?\b/i,
    /\bshowroom[ _]visits?\b/i,
    /\bcar\s+(?:partner|dealer|dealership|model|listings?|gallery)\b/i,
    /\bdealership\s+name\b/i,
    /\bcarModel\b/,
    /\bFeatured\s+Cars\b/i,
    /\bOur\s+Dealership\b/i,
  ],
  candles: [/\bcandles?\b/i, /\blavender\b/i, /\bqaaf\b/i, /\bbeeswax\b/i, /\bsoy\s+wax\b/i],
  sweets: [/\bmithai\b/i, /\bkaju\s+katli\b/i, /\bladdu\b/i, /\bbarfi\b/i],
  clothing: [/\bsarees?\b/i, /\blehenga\b/i, /\bkurtis?\b/i],
  coaching: [/\bcoaching\s+(?:batch|centre|center)\b/i, /\btuition\b/i],
};

// ---------------------------------------------------------------------
// The allowlist, with a reason for every entry.
// ---------------------------------------------------------------------

type Allow = { file: string; why: string; match?: RegExp };

const ALLOWED: Allow[] = [
  // LEGACY DATABASE VALUES. Rows already carry these; renaming the
  // stored value would orphan them. Each is read, never written fresh.
  { file: "src/types/index.ts", why: "AppointmentType keeps test_ride/showroom_visit so pre-2026 rows still render" },
  { file: "src/app/api/creative/product-description/route.ts", why: "accepts carModel as a legacy alias for productName" },
  { file: "src/app/dashboard/creative-studio/page.tsx", why: "sends carModel alongside productName for one release" },
  // STORED TEMPLATE KEYS. background_style values live on saved ad
  // plans; "showroom" is a template name, not a subject.
  { file: "src/lib/adEngine.ts", why: "TEMPLATE_COLORS keys + the schema line that explains they are template names" },
  { file: "src/app/api/ads/generate-creative/route.ts", why: "same TEMPLATE_COLORS keys" },
  // CROSS-CATEGORY WORD LISTS. Deliberately contain many categories;
  // the point is that no single one is privileged.
  { file: "src/lib/pages/editPage.ts", why: "NAME_STOPWORDS spans every category Hawlai serves" },
  // CLAIM_TERMS lists claims a business must be able to substantiate.
  // "soy wax" and "beeswax" are there because they ARE claims when
  // written as copy, the same way "pure ghee" or "pure silk" would be.
  // Allowlisted as a claims vocabulary, with a recorded gap: the list
  // leans toward one category's materials because that is where the
  // incidents happened, and widening it to ghee, silk and cotton is
  // follow-up work, not a leak to strip.
  { file: "src/lib/claims/claimCheck.ts", why: "CLAIM_TERMS is a substantiation list; material words there are claims, not examples" },
  // SEED KNOWLEDGE. A marketing playbook cites real examples; that is
  // what makes it concrete rather than a platitude.
  { file: "src/lib/knowledge/marketingKnowledgeSeed", why: "curated marketing knowledge, examples are the content" },
  // ADMIN TEST FIXTURES.
  { file: "src/app/api/admin/website-generation-test/route.ts", why: "an admin smoke-test fixture, never customer-facing" },
];

const SOURCE = /\.tsx?$/;

/** A file's CODE, with every comment line dropped. */
function codeOf(path: string): string {
  return codeLines(readFileSync(path, "utf8"))
    .map((l) => l.line)
    .join("\n");
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      sourceFiles(path, out);
    } else if (SOURCE.test(entry)) out.push(path);
  }
  return out;
}

/**
 * A comment is not a leak.
 *
 * Every guard in this codebase records the incident that caused it, and
 * those records name the business it happened to — deliberately, because
 * a dated incident is why the rule exists and is the only thing that
 * stops someone "simplifying" it away later. Stripping them would make
 * the code less safe, not more neutral.
 */
function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*");
}

/**
 * The lines of a file that are CODE.
 *
 * A per-line guess is not enough: a `/* ... *\/` or a JSX `{/* ... *\/}`
 * block wraps, and its middle lines carry no marker at all. Both of the
 * first two leaks this test reported were its own explanatory comments
 * read as code.
 */
function codeLines(text: string): { line: string; number: number }[] {
  const out: { line: string; number: number }[] = [];
  let inBlock = false;
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (inBlock) {
      if (t.includes("*\/")) inBlock = false;
      return;
    }
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      if (!t.includes("*\/")) inBlock = true;
      return;
    }
    if (isComment(line)) return;
    out.push({ line, number: i + 1 });
  });
  return out;
}

function allowedFor(path: string): Allow | undefined {
  return ALLOWED.find((a) => path.includes(a.file));
}

describe("no single business's vocabulary is shipped to all of them", () => {
  const files = sourceFiles("src");

  it("scans a real number of files", () => {
    // A path mistake that silently scanned nothing would make every
    // assertion below pass.
    expect(files.length).toBeGreaterThan(300);
  });

  it("NO FILE PRESENTS ONE CATEGORY'S WORDS AS EVERY BUSINESS'S", () => {
    const leaks: string[] = [];

    for (const path of files) {
      const allow = allowedFor(path);
      for (const { line, number } of codeLines(readFileSync(path, "utf8"))) {
        const families = Object.entries(FAMILIES)
          .filter(([, patterns]) => patterns.some((re) => re.test(line)))
          .map(([name]) => name);

        if (families.length === 0) continue;
        // Two or more categories on one line is a mixed example, which
        // is the shape we want.
        if (families.length > 1) continue;
        if (allow) continue;

        leaks.push(`${path}:${number} [${families[0]}] ${line.trim().slice(0, 100)}`);
      }
    }

    expect(leaks, `One business's vocabulary, shown to every business:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("every allowlist entry still earns its place", () => {
    // An allowlist that outlives its reason is how this bug comes back.
    for (const entry of ALLOWED) {
      const matching = files.filter((f) => f.includes(entry.file));
      expect(matching.length, `allowlisted but no longer present: ${entry.file}`).toBeGreaterThan(0);
      expect(entry.why.length, `allowlist entry needs a reason: ${entry.file}`).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------
// The fallbacks that were the actual damage.
// ---------------------------------------------------------------------

describe("no fallback invents a claim, an offer or someone else's trade", () => {
  it("the landing-page fallback is the business's own name, and nothing else", async () => {
    const src = codeOf("src/lib/agents/websiteAgent.ts");
    // Was: "Your Trusted Car Partner" / "Best deals, honest advice" /
    // "Book a free test drive today." — a trade, two claims and an offer.
    expect(src).not.toMatch(/Car Partner/);
    expect(src).not.toMatch(/Best deals/);
    // The fallback's two text fields are deliberately empty strings;
    // anything else there is a sentence Hawlai made up.
    expect(src).toMatch(/subheadline: "",/);
    expect(src).toMatch(/offer_text: "",/);
  });

  it("the video-script fallback writes no scenes rather than someone else's", () => {
    const src = codeOf("src/lib/agents/creativeAgent.ts");
    expect(src).not.toMatch(/Wide shot of the car/);
    expect(src).not.toMatch(/Book your test drive/);
    expect(src).toMatch(/scenes: \[\]/);
  });

  it("THE AD-COPY FALLBACK IS EMPTY: no Limited Stock, no offer ends soon", () => {
    const src = codeOf("src/lib/agents/creativeAgent.ts");
    // An invented stock claim and an invented offer, hand-written into
    // a path the claims guard never ran on.
    expect(src).not.toMatch(/Limited Stock/);
    expect(src).not.toMatch(/offer ends soon/);
    expect(src).toMatch(/const fallback: CopyVariation\[\] = \[\];/);
  });

  it("THE SIGNUP PAGE AND THE PRIVACY POLICY DO NOT CALL EVERYONE A DEALERSHIP", () => {
    // The first screen a new business sees, and the legal document its
    // customers read. "Dealership Name", "Register your dealership" and
    // "vehicle interest" were all still there on 2026-10-09, the day
    // before real businesses were due to test.
    for (const path of ["src/app/auth/signup/page.tsx", "src/app/privacy-policy/page.tsx"]) {
      const code = codeOf(path);
      // Visible text only: `dealership_id` and the `dealerships` table
      // are the database's own names and stay.
      const visible = code.replace(/dealership_id|home_dealership_id|dealerships?\.|from\("dealerships"\)|data: dealership/g, "");
      expect(visible, path).not.toMatch(/Dealership Name/i);
      expect(visible, path).not.toMatch(/your dealership/i);
      expect(visible, path).not.toMatch(/vehicle interest/i);
    }
  });

  it("the public page shows no pillar it cannot back", () => {
    const src = codeOf("src/app/p/[slug]/page.tsx");
    expect(src).not.toMatch(/Transparent pricing, no hidden charges/);
    expect(src).not.toMatch(/Verified, quality-checked vehicles/);
    expect(src).not.toMatch(/Book a Free Test Drive/);
    expect(src).not.toMatch(/defaultPillars/);
  });

  it("and no page names a business Hawlai made up", () => {
    for (const path of ["src/app/p/[slug]/page.tsx", "src/app/api/website/generate-copy/route.ts"]) {
      const src = readFileSync(path, "utf8");
      const code = src
        .split("\n")
        .filter((l) => !isComment(l))
        .join("\n");
      expect(code, path).not.toMatch(/"Our Dealership"/);
    }
  });
});
