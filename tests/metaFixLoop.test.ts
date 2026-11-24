// Proposing the page-SEO fixes the audit already finds — S-a/b/c.
//
// ──────────────────────────────────────────────────────────────────
// L0, BY THE OWNER'S DECISION of 24 November 2026: every fix is
// PROPOSED and he approves it. S-d — the same loop unattended — is out
// of scope until a measured outcome exists on a real business. The
// ladder for it is already built (`update_page_meta` is the single
// entry in L2_ALLOWLIST) and the evidence is not.
//
// THE THREE THINGS THIS FILE HOLDS:
//
//   1. THREE A DAY, counted from the record. The first run on a
//      neglected site would otherwise raise forty cards, he would read
//      none, and the feature would be muted in week one.
//   2. A REJECTED FIX IS NOT RE-ASKED. createPublishAction refuses a
//      duplicate still WAITING, but a rejected intent can be asked
//      again — and a daily loop would ask every morning, which is how
//      a product teaches somebody to ignore it.
//   3. COPYING IS NOT NEUTRAL. These words come off the page itself,
//      which feels safe and is not: a claim in a meta description is
//      MORE prominent than the same claim in a paragraph, because it is
//      what the search result shows.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { findMetaGaps, proposedSeoTitle, proposedMetaDescription, MIN_DESCRIPTION } from "@/lib/seo/metaGaps";
import { rejectedRecently, PROPOSALS_PER_DAY, AUDIT_SOURCE } from "@/lib/seo/metaFixLoop";
import { META_DESCRIPTION_LIMIT } from "@/lib/seo/metaLength";
import { REJECTION_COOLDOWN_DAYS } from "@/lib/growth/findings";
import { code } from "./helpers/source";

const page = (over: Record<string, any> = {}) => ({
  id: "p1",
  slug: "candles",
  title: "Candles",
  seo_title: null,
  meta_description: null,
  sections: [{ type: "text", props: { body: "Hand poured soy candles made in small batches. Each one cures for a day." } }],
  is_fallback: false,
  ...over,
});

describe("1. THE TITLE IS THE PAGE'S OWN, PLUS THE BUSINESS", () => {
  it("THE SAME SHAPE THE TAB ALREADY SHOWS, so approving changes nothing visible", () => {
    // THE LOAD-BEARING ONE. He is approving a STORED value. If it read
    // differently from what his page already displays he would be
    // right to refuse, and the loop would teach him to refuse.
    expect(proposedSeoTitle(page(), "candle_by_qaaf")).toBe("Candles | Candle by Qaaf");
  });

  it("AND THE HANDLE BECOMES WORDS, never candle_by_qaaf", () => {
    // That name reaches Google. A raw signup handle there is the
    // business's brand, spelled wrong, in public.
    expect(proposedSeoTitle(page(), "candle_by_qaaf")).not.toContain("candle_by_qaaf");
  });

  it("NO DOUBLED BUSINESS NAME when the page title already carries it", () => {
    expect(proposedSeoTitle(page({ title: "Candle by Qaaf Workshops" }), "candle_by_qaaf")).toBe("Candle by Qaaf Workshops");
  });

  it("AN UNTOUCHED HOME PAGE GETS NOTHING, not the business name", () => {
    // Its only available title is the business name, which the tab
    // already falls back to — so storing it changes nothing and spends
    // a decision. A real home title says what the business DOES, which
    // is a sentence from facts, which is A6.
    expect(proposedSeoTitle(page({ slug: "home", title: "Home" }), "candle_by_qaaf")).toBeNull();
    expect(proposedSeoTitle(page({ slug: "home", title: "" }), "candle_by_qaaf")).toBeNull();
    // A home page he has titled himself is a different thing.
    expect(proposedSeoTitle(page({ slug: "home", title: "Hand-poured soy candles" }), "x_y")).toBe("Hand-poured soy candles");
  });

  it("and no business name at all proposes nothing", () => {
    expect(proposedSeoTitle(page(), null)).toBeNull();
    expect(proposedSeoTitle(page(), "")).toBeNull();
  });
});

describe("2. THE DESCRIPTION FITS BEFORE IT IS PROPOSED", () => {
  it("WHOLE SENTENCES, NEVER A MID-WORD CUT", () => {
    const out = proposedMetaDescription(page())!;
    expect(out).toBe("Hand poured soy candles made in small batches. Each one cures for a day.");
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT);
  });

  it("IT BUILDS SOMETHING THAT FITS rather than trimming something that does not", () => {
    // metaLength's own header draws this line: a silent edit is
    // acceptable on a machine's first draft with nobody reviewing, and
    // NOT on a card where a person decides. So sentences past the
    // limit are left out, not cut.
    const long = `${"A sentence that is quite long indeed. ".repeat(8)}`;
    const out = proposedMetaDescription(page({ sections: [{ props: { body: long } }] }))!;
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT);
    expect(out.endsWith(".")).toBe(true);
    expect(out, "a truncation marker means something was cut").not.toContain("…");
  });

  it("A SINGLE SENTENCE TOO LONG FOR THE LIMIT STILL CUTS ON A WORD", () => {
    // FOUND BY MUTATION. The first fixture repeated a 5-character word,
    // which divides the 160 limit exactly — so the slice landed on a
    // space by arithmetic and a mid-word cut passed. An 11-character
    // word does not divide it, so the cut has to be handled.
    const out = proposedMetaDescription(page({ sections: [{ props: { body: "handpoured ".repeat(30) } }] }))!;
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT);
    expect(out.endsWith("handpoured"), "the description was cut mid-word").toBe(true);
    expect(out.split(" ").every((w) => w === "handpoured")).toBe(true);
  });

  it("AND A URL IN A BLOCK NEVER REACHES THE DESCRIPTION", () => {
    // FOUND BY MUTATION. A link's own href is a string in the tree, and
    // a URL in a search-result description is junk a person reads
    // before they read the sentence.
    const out = proposedMetaDescription(page({
      sections: [
        { props: { link: "https://example.test/book-a-workshop" } },
        { props: { body: "Hand poured soy candles made in small batches here. Each one cures for a day." } },
      ],
    }))!;
    expect(out, "a URL reached the description").not.toMatch(/https?:\/\//);
    expect(out).toContain("Hand poured soy candles");
  });

  it("TOO LITTLE TEXT PROPOSES NOTHING", () => {
    // A description of five words says nothing in a search result, and
    // storing one closes the gap without fixing it.
    expect(proposedMetaDescription(page({ sections: [{ props: { body: "Candles." } }] }))).toBeNull();
    expect(proposedMetaDescription(page({ sections: [] }))).toBeNull();
    expect(proposedMetaDescription(page({ sections: null }))).toBeNull();
    expect(MIN_DESCRIPTION).toBeGreaterThan(20);
  });

  it("and markup in a block never reaches the description", () => {
    // The `html` prop on a block is markdown, and has put raw <p> tags
    // on a live homepage once already.
    const out = proposedMetaDescription(page({
      sections: [{ props: { html: "<p>Hand poured soy candles made in small batches here.</p> <b>Each</b> cures for a day." } }],
    }))!;
    expect(out).not.toMatch(/[<>]/);
  });
});

describe("3. WHICH PAGES ARE PROPOSED FOR, AND IN WHAT ORDER", () => {
  it("ONE GAP PER FIELD, so one card decides one thing", () => {
    const gaps = findMetaGaps([page()], "candle_by_qaaf");
    expect(gaps.map((g) => g.field)).toEqual(["seoTitle", "metaDescription"]);
    expect(new Set(gaps.map((g) => g.pageId)).size).toBe(1);
  });

  it("A FIELD THAT IS ALREADY SET IS NOT A GAP", () => {
    expect(findMetaGaps([page({ seo_title: "Candles | Candle by Qaaf" })], "x").map((g) => g.field)).toEqual(["metaDescription"]);
    expect(findMetaGaps([page({ meta_description: "Something already here." })], "x").map((g) => g.field)).toEqual(["seoTitle"]);
    expect(findMetaGaps([page({ seo_title: "T", meta_description: "D" })], "x")).toEqual([]);
    // Whitespace is not a value.
    expect(findMetaGaps([page({ seo_title: "   " })], "candle_by_qaaf").map((g) => g.field)).toContain("seoTitle");
  });

  it("A FALLBACK PAGE IS SKIPPED ENTIRELY", () => {
    // Its body is the builder's placeholder, so a description drawn
    // from it would describe the placeholder — and a tidy search title
    // on it invites a visitor to a page with nothing on it.
    expect(findMetaGaps([page({ is_fallback: true })], "candle_by_qaaf")).toEqual([]);
  });

  it("HOME FIRST, then by slug, so the order is stable between runs", () => {
    const pages = [
      page({ id: "p3", slug: "workshops", title: "Workshops" }),
      page({ id: "p1", slug: "home", title: "Hand-poured candles" }),
      page({ id: "p2", slug: "about", title: "About" }),
    ];
    expect(findMetaGaps(pages, "x_y").map((g) => g.slug)).toEqual(["home", "home", "about", "about", "workshops", "workshops"]);
  });

  it("and a page with no id is not proposed for", () => {
    expect(findMetaGaps([page({ id: null })], "candle_by_qaaf")).toEqual([]);
  });
});

describe("4. A REJECTED FIX IS NOT ASKED AGAIN", () => {
  const now = new Date("2026-11-24T04:00:00Z");
  const gap = { pageId: "p1", slug: "candles", field: "seoTitle" as const, value: "T", label: "Candles page" };
  const row = (over: Record<string, any> = {}) => ({
    target_ref: "p1",
    requested_changes: { seoTitle: "T" },
    status: "rejected",
    updated_at: "2026-11-20T04:00:00Z",
    ...over,
  });

  it("A RECENT NO IS RESPECTED", () => {
    expect(rejectedRecently([row()], gap, now)).toBe(true);
  });

  it("AND AN OLD ONE IS NOT, so a page is not frozen forever", () => {
    const old = new Date(now.getTime() - (REJECTION_COOLDOWN_DAYS + 2) * 86_400_000).toISOString();
    expect(rejectedRecently([row({ updated_at: old })], gap, now)).toBe(false);
  });

  it("THE SAME FIELD, NOT MERELY THE SAME PAGE", () => {
    // Saying no to a title is not saying no to a description.
    expect(rejectedRecently([row({ requested_changes: { metaDescription: "D" } })], gap, now)).toBe(false);
  });

  it("AND A DIFFERENT PAGE IS A DIFFERENT DECISION", () => {
    expect(rejectedRecently([row({ target_ref: "p9" })], gap, now)).toBe(false);
  });

  it("AN APPROVED OR WAITING ROW IS NOT A REJECTION", () => {
    for (const status of ["executed", "awaiting_approval", "previewed", "draft", "stale"]) {
      expect(rejectedRecently([row({ status })], gap, now), status).toBe(false);
    }
  });

  it("AN UNREADABLE TIMESTAMP COUNTS AS INSIDE THE COOLDOWN", () => {
    // The strategist's rule, reused: "the owner said no to this once; a
    // timestamp this code cannot parse is not permission to ask again."
    for (const bad of ["", "not a date", null, undefined]) {
      expect(rejectedRecently([row({ updated_at: bad })], gap, now), JSON.stringify(bad)).toBe(true);
    }
  });

  it("and an empty history blocks nothing", () => {
    expect(rejectedRecently([], gap, now)).toBe(false);
    expect(rejectedRecently(null as any, gap, now)).toBe(false);
  });
});

describe("5. THE SHAPE OF THE LOOP, WHERE A UNIT TEST CANNOT RUN IT", () => {
  const src = () => code("src/lib/seo/metaFixLoop.ts");

  it("THREE A DAY, COUNTED FROM THE RECORD, not from a local tally", () => {
    // The daily run is resumed by a 2-minute nudge, so a second
    // invocation in the same day is normal — and a local counter would
    // let each one propose its own three.
    expect(PROPOSALS_PER_DAY).toBe(3);
    const s = src();
    expect(s).toMatch(/from\("publish_actions"\)/);
    expect(s).toMatch(/created_at \?\? ""\)\.slice\(0, 10\) === today/);
    expect(s).toMatch(/room = PROPOSALS_PER_DAY - todayCount/);
  });

  it("AND AN ALREADY-WAITING CARD DOES NOT SPEND TODAY'S ROOM", () => {
    const s = src();
    // BOUNDED AT BOTH ENDS. A fixed 220-character slice ran past the
    // branch into `proposed++` and failed on the correct code.
    const at = s.indexOf("alreadyPending");
    const end = s.indexOf("proposed++", at);
    expect(at).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(at);
    const block = s.slice(at, end);
    expect(block.length).toBeLessThan(260);
    expect(block).toMatch(/continue;/);
    expect(block, "an already-waiting card counted as a new proposal").not.toMatch(/proposed\+\+/);
  });

  it("IT COUNTS ONLY ITS OWN CARDS, not the ones he asked for in chat", () => {
    // Capping the loop because he used chat would punish him for using
    // the product.
    const s = src();
    expect(s).toMatch(/resolution_detail\?\.query \?\? ""\) === AUDIT_SOURCE/);
    expect(AUDIT_SOURCE).toMatch(/^audit:/);
  });

  it("IT GOES THROUGH THE PUBLISH DOOR, and signs its rows where the column allows it", () => {
    // `requested_by` is `uuid references auth.users` (migration 170),
    // so a text label there is an invalid insert — and no user asked.
    const s = src();
    expect(s).toMatch(/createPublishAction\(/);
    expect(s).toMatch(/requestedBy: null/);
    expect(s).toMatch(/resolutionDetail: \{ query: AUDIT_SOURCE/);
    expect(s, "a text label was written to a uuid column").not.toMatch(/requestedBy: "/);
  });

  it("THE COPY PASSES THE CLAIMS GUARD IN PUBLISH MODE, the strictest", () => {
    // Copying the page's own words is not neutral: a claim in a meta
    // description is more prominent than the same claim in a
    // paragraph. And after approval nobody reads it again.
    const s = src();
    expect(s).toMatch(/guardOrMark\(\{ value: gap\.value \}, facts, "publish"\)/);
    // Nothing left after the guard is a skip, not an empty proposal.
    expect(s).toMatch(/nothing left after the claims check/);
  });

  it("A FAILED PAGE READ PROPOSES NOTHING, rather than proposing for every page", () => {
    // Treating a read failure as an empty site would make every page
    // look like it had no title.
    const s = src();
    expect(s).toMatch(/if \(!Array\.isArray\(pages\)\)/);
  });

  it("and it never throws into the daily run", () => {
    const s = src();
    expect(s).toMatch(/catch \(err: any\)/);
    expect(s, "a page-SEO proposal cost the rest of the run").not.toMatch(/throw /);
  });
});

describe("6. IT RUNS AFTER THE AUDIT THAT FINDS THE GAPS", () => {
  it("IN signals, AND AFTER site_audit", () => {
    // Running first would propose against yesterday's reading — on the
    // one morning he had just fixed a page by hand, it would ask him
    // to fix it again.
    const groups = code("src/lib/automation/cronGroups.ts");
    const signals = groups.slice(groups.indexOf("signals: ["), groups.indexOf("heavy: ["));
    expect(signals).toContain('"seo_fixes"');
    expect(signals.indexOf('"site_audit"')).toBeLessThan(signals.indexOf('"seo_fixes"'));
    // NOT in heavy: it calls no model.
    const heavy = groups.slice(groups.indexOf("heavy: ["));
    expect(heavy, "a model-free subsystem was put in the heavy group").not.toContain('"seo_fixes"');
  });

  it("AND THE SUBSYSTEM HAS A RUNNER", () => {
    // A key with no runner is a job that stays pending for ever.
    expect(code("src/lib/automation/dailyRunners.ts")).toMatch(/seo_fixes: \(s, id\) => runMetaFixLoop\(s, id\)/);
  });

  it("the third page-SEO finding is deliberately not in scope", () => {
    // pages_still_fallback means WRITING the page — real copy, from
    // facts, with a model. That is A6's generator, and putting it in
    // the safest commit would move the riskiest piece into it.
    const s = code("src/lib/seo/metaGaps.ts");
    expect(s).not.toMatch(/pages_still_fallback/);
    expect(code("src/lib/seo/metaFixLoop.ts")).not.toMatch(/update_page_text/);
  });
});
