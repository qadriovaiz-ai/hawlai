// Adding one question and its answer to a page — A6-d.
//
// ──────────────────────────────────────────────────────────────────
// THE OWNER CHOSE A NEW ACTION KEY (Raasta 2), and the reason is a
// hard limit rather than a preference: `update_page_text` can only
// change a string prop that is ALREADY on the page — `lineNow` returns
// null for a block that is not there and preview refuses. So it can
// FILL an empty `faq_item` he added by hand, and it cannot ADD one.
//
// REVERSIBLE, UNLIKE CREATING A PAGE. The item carries the id this
// action generated, so undo removes exactly that one and the page is
// precisely as it was. `canHoldL1` tests for that property, and it is
// the reason A6-e (new pages) stayed out of scope: un-creating a page
// is a deletion, not a reverse.
//
// AND STILL L0. The owner's decision of 24 November keeps the whole
// SEO loop approval-first until a measured outcome exists on a real
// business, so this is deliberately NOT in L2_ALLOWLIST.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { faqItemId, faqRejectedRecently, hasFaqBlock, PROPOSALS_PER_DAY } from "@/lib/seo/metaFixLoop";
import { ACTION_POLICIES } from "@/lib/executionPolicy";
import { ACTION_RISK } from "@/lib/publish/types";
import { canHoldL1, canHoldL2 } from "@/lib/autonomyLevels";
import { L2_ALLOWLIST } from "@/lib/autonomy/policy";
import { measureForAction, isMeasurable } from "@/lib/growth/measures";
import { REJECTION_COOLDOWN_DAYS } from "@/lib/growth/findings";
import { code } from "./helpers/source";

const LOOP = "src/lib/seo/metaFixLoop.ts";
const SITE = "src/lib/publish/platforms/hawlaiSite.ts";

describe("1. THE NEW ACTION KEY IS REGISTERED EVERYWHERE IT HAS TO BE", () => {
  it("IT IS APPROVAL-GATED, AN EDIT, AND MEDIUM RISK", () => {
    // Rule 6: nothing changes a live page without a registry entry.
    // Two registries demanded this one and each named itself —
    // approvalCoverage for ACTION_POLICIES, recordDecision for the
    // outcome measure. Neither was found by reading; both failed.
    expect(ACTION_POLICIES.add_faq_item?.requiresApproval).toBe(true);
    expect(ACTION_POLICIES.add_faq_item?.actionType).toBe("edit");
    expect(ACTION_RISK.add_faq_item).toBe("medium");
  });

  it("IT CAN HOLD L1 BECAUSE IT IS REVERSIBLE, and not without that", () => {
    // THE LOAD-BEARING ONE for the whole design choice. canHoldL1's own
    // words: "L1 only means anything because a change is reversible".
    expect(canHoldL1("add_faq_item", { hasUndo: true }).ok).toBe(true);
    expect(canHoldL1("add_faq_item", { hasUndo: false }).ok).toBe(false);
    expect(canHoldL1("add_faq_item", { hasUndo: false }).why).toMatch(/nothing can put this back/);
  });

  it("AND IT IS NOT ALLOWLISTED FOR L2 — the owner's decision stands", () => {
    // update_page_meta is in that list because a search title is read
    // by strangers. An answer on a page is the business speaking to its
    // own customers, and the loop stays L0 until S-e measures something.
    expect(L2_ALLOWLIST).not.toContain("add_faq_item");
    expect(canHoldL2("add_faq_item", { hasUndo: true }).ok).toBe(false);
  });

  it("ITS OUTCOME MEASURE IS THE SAME AS THE OTHER PAGE ACTIONS", () => {
    // Not "not collected": something changed on a page, and what this
    // product can count about a page is visits to it. A number claiming
    // to attribute one FAQ answer is one the data cannot support.
    const m = measureForAction("add_faq_item");
    expect(isMeasurable(m)).toBe(true);
    expect(m).toEqual(measureForAction("update_page_text"));
  });

  it("the platform declares it in BOTH lists, supports and undoes", () => {
    // `undoes` is per key, not per platform — a key missing from it
    // cannot hold L1 however reversible the code actually is.
    const s = code(SITE);
    expect(s).toMatch(/supports: \["update_page_meta", "update_page_text", "add_faq_item"\] as const/);
    expect(s).toMatch(/undoes: \["update_page_meta", "update_page_text", "add_faq_item"\] as const/);
  });
});

describe("2. THE ITEM ID IS STABLE, AND THAT IS THREE THINGS AT ONCE", () => {
  it("THE SAME KEY GIVES THE SAME ID TOMORROW", () => {
    // It has to: createPublishAction's intent key must stay stable so a
    // retry cannot stack a second card, the platform's already-present
    // check must recognise its own work, and the cooldown must be able
    // to tell which question he declined.
    expect(faqItemId("delivery_time")).toBe(faqItemId("delivery_time"));
    expect(faqItemId("delivery_time")).toBe("faq-delivery-time");
  });

  it("AND TWO QUESTIONS NEVER SHARE ONE", () => {
    expect(faqItemId("delivery_time")).not.toBe(faqItemId("delivery_area"));
  });

  it("it survives an odd key without producing a broken id", () => {
    expect(faqItemId("  Delivery_Time!! ")).toBe("faq-delivery-time");
    expect(faqItemId("")).toBe("faq");
  });
});

describe("3. A DECLINED ANSWER IS NOT ASKED AGAIN", () => {
  const now = new Date("2026-11-24T04:00:00Z");
  const row = (over: Record<string, any> = {}) => ({
    requested_changes: { itemId: "faq-delivery-time", question: "Q", answer: "A" },
    status: "rejected",
    updated_at: "2026-11-20T04:00:00Z",
    ...over,
  });

  it("A RECENT NO IS RESPECTED", () => {
    expect(faqRejectedRecently([row()], "faq-delivery-time", now)).toBe(true);
  });

  it("AND A DIFFERENT QUESTION IS A DIFFERENT DECISION", () => {
    expect(faqRejectedRecently([row()], "faq-delivery-area", now)).toBe(false);
  });

  it("AN APPROVED OR WAITING ROW IS NOT A REJECTION", () => {
    for (const status of ["executed", "awaiting_approval", "previewed", "draft", "stale"]) {
      expect(faqRejectedRecently([row({ status })], "faq-delivery-time", now), status).toBe(false);
    }
  });

  it("AN UNREADABLE TIMESTAMP COUNTS AS INSIDE THE COOLDOWN", () => {
    // The same reading as the meta half: the status already says he
    // declined, so a date this code cannot parse is not permission.
    for (const bad of ["", "not a date", null, undefined]) {
      expect(faqRejectedRecently([row({ updated_at: bad })], "faq-delivery-time", now), JSON.stringify(bad)).toBe(true);
    }
  });

  it("and an old no is not, so a question is not frozen for ever", () => {
    const old = new Date(now.getTime() - (REJECTION_COOLDOWN_DAYS + 2) * 86_400_000).toISOString();
    expect(faqRejectedRecently([row({ updated_at: old })], "faq-delivery-time", now)).toBe(false);
  });
});

describe("4. IT ONLY FILLS AN FAQ SECTION HE ALREADY HAS", () => {
  it("A PAGE WITH AN faq BLOCK IS FOUND, nested or not", () => {
    expect(hasFaqBlock([{ id: "b1", type: "faq", children: [] }])).toBe(true);
    expect(hasFaqBlock([{ id: "s1", type: "section", children: [{ id: "b1", type: "faq", children: [] }] }])).toBe(true);
  });

  it("AND A PAGE WITHOUT ONE IS NOT GUESSED AT", () => {
    // Where an FAQ sits on a page is a layout decision — what it is
    // headed, where it goes — and this action is about one answer
    // rather than redesigning his page.
    expect(hasFaqBlock([{ id: "b1", type: "text", props: { body: "FAQ" } }])).toBe(false);
    expect(hasFaqBlock([])).toBe(false);
    expect(hasFaqBlock(null)).toBe(false);
  });

  it("A BLOCK WITH NO ID IS NOT A USABLE CONTAINER", () => {
    // The platform addresses the container by id, so claiming the page
    // has an FAQ would produce a card that always fails.
    expect(hasFaqBlock([{ type: "faq", children: [] }])).toBe(false);
  });

  it("AND A FALLBACK PAGE NEVER HOSTS THE ANSWER", () => {
    // FOUND BY MUTATION. hasFaqBlock is pure and tested, but the host
    // SELECTION is inside proposeFaqAnswers, which no unit test
    // executes — so dropping the fallback check survived.
    //
    // A fallback page is the builder's placeholder. Putting a real
    // answer on it publishes that answer on a page with nothing else
    // on it, which is the same reasoning that keeps fallback pages out
    // of the meta-gap list.
    //
    // THIS IS A SOURCE ASSERTION AND THEREFORE WEAKER than the rest of
    // this file: it reads one clause rather than running the loop.
    // Bounded to the line so it cannot pass on the word appearing
    // elsewhere.
    const s = code(LOOP);
    const at = s.indexOf("const host = pages.find(");
    expect(at).toBeGreaterThan(-1);
    const line = s.slice(at, s.indexOf("\n", at));
    expect(line.length).toBeLessThan(140);
    expect(line, "a fallback page could host the answer").toMatch(/!p\?\.is_fallback/);
    expect(line).toMatch(/hasFaqBlock\(p\?\.sections\)/);
  });

  it("AND THE REFUSAL TELLS HIM WHAT TO DO", () => {
    const s = code(LOOP);
    expect(s).toMatch(/no FAQ section on any page yet/);
    // Once, not once per question.
    const at = s.indexOf("const host = pages.find(");
    const block = s.slice(at, s.indexOf("gatherAnswerGaps", at));
    expect(block).toMatch(/return \{ proposed: 0/);
  });
});

describe("5. ONE CAP, AND THE RIGHT ORDER", () => {
  it("THE FAQ HALF SPENDS THE SAME THREE, not three of its own", () => {
    // Two subsystems would have meant three meta proposals AND three
    // FAQ proposals — six a day, against the owner's number of three.
    expect(PROPOSALS_PER_DAY).toBe(3);
    const s = code(LOOP);
    expect(s).toMatch(/if \(room > 0\) \{\s*const faq = await proposeFaqAnswers\(/);
    expect(s).toMatch(/proposeFaqAnswers\([\s\S]{0,120}room,/);
  });

  it("AND IT RUNS AFTER THE META GAPS", () => {
    // A page with no search title is invisible in a result list, and an
    // answer on a page nobody can find helps nobody.
    const s = code(LOOP);
    expect(s.indexOf("findMetaGaps(")).toBeLessThan(s.indexOf("proposeFaqAnswers("));
  });

  it("THE HISTORY READ COVERS BOTH KEYS, or the cap counts half the work", () => {
    const s = code(LOOP);
    expect(s).toMatch(/\.in\("action_key", \["update_page_meta", "add_faq_item"\]\)/);
  });
});

describe("6. THE ANSWER IS HIS, AND STILL GUARDED", () => {
  it("GUARDED IN PUBLISH MODE, the strictest", () => {
    // He wrote it as an internal note; on a public page it becomes an
    // advertising claim, which is a different thing — the
    // site-as-evidence work settled that owner-written is not the same
    // as substantiated. And after approval nobody reads it again.
    const s = code(LOOP);
    const at = s.indexOf("async function proposeFaqAnswers");
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at);
    expect(block).toMatch(/guardOrMark\(\{ value: answer \}, facts, "publish"\)/);
    expect(block).toMatch(/nothing left after the claims check/);
  });

  it("AND NOTHING IS GENERATED — the answer comes from answerDraft", () => {
    const s = code(LOOP);
    for (const forbidden of ["callClaude", "getModel", "anthropic"]) {
      expect(s, `the loop can reach ${forbidden}`).not.toContain(forbidden);
    }
    expect(s).toMatch(/gatherAnswerGaps\(/);
  });

  it("the loop never writes to a page itself", () => {
    // Every change goes through createPublishAction and an approval.
    const s = code(LOOP);
    expect(s, "the loop writes to the site directly").not.toMatch(/from\("website_pages"\)[\s\S]{0,60}\.update\(/);
    expect(s).toMatch(/createPublishAction\(/);
  });
});

describe("7. THE PLATFORM'S SIDE: PREVIEW, WRITE, AND PUT IT BACK", () => {
  const site = () => code(SITE);

  it("A PAGE WITH NO FAQ SECTION IS REFUSED, NOT GIVEN ONE", () => {
    const s = site();
    const at = s.indexOf("async function previewFaq");
    const block = s.slice(at, s.indexOf("async function executeFaq"));
    expect(block).toMatch(/has no FAQ section yet/);
    expect(block, "preview creates the container it was missing").not.toMatch(/type: "faq"/);
  });

  it("AN ENTRY NEEDS BOTH A QUESTION AND AN ANSWER", () => {
    const s = site();
    const at = s.indexOf("async function previewFaq");
    const block = s.slice(at, s.indexOf("async function executeFaq"));
    expect(block).toMatch(/needs both a question and an answer/);
  });

  it("A SECOND COPY IS REFUSED, so a retry cannot double it", () => {
    const s = site();
    const at = s.indexOf("async function previewFaq");
    const block = s.slice(at, s.indexOf("async function executeFaq"));
    expect(block).toMatch(/already in the FAQ on this page/);
  });

  it("THE PROPS ARE heading AND html, NOT question AND answer", () => {
    // Four systems are keyed on that exact prop set — provenance, the
    // claims guard, the owner's claims review and the Properties Panel
    // — and a prop named `answer` would be invisible to all four, which
    // is precisely the 2026-09-30 incident.
    const s = site();
    const at = s.indexOf("async function executeFaq");
    const block = s.slice(at, s.indexOf("return {\n    id: \"hawlai_site\""));
    expect(block).toMatch(/type: "faq_item", props: \{ heading: want\.question, html: want\.answer \}/);
    expect(block, "a prop named answer would bypass four guards").not.toMatch(/props: \{[^}]*answer:/);
  });

  it("ALREADY AT THE TARGET IS NOT A FAILURE", () => {
    // A successful write followed by a timeout and a retry must not
    // read as a failure — the same order the text and meta actions use.
    const s = site();
    const at = s.indexOf("async function executeFaq");
    const block = s.slice(at, s.indexOf("return {\n    id: \"hawlai_site\""));
    expect(block).toMatch(/if \(want\.remove \? !present : present\)/);
    expect(block).toMatch(/faq_noop/);
  });

  it("IT WRITES A DEEP COPY OF THE TREE AS IT IS NOW", () => {
    // An unrelated block somebody edited in Website Builder since the
    // preview must not be rolled back by this save.
    const s = site();
    const at = s.indexOf("async function executeFaq");
    const block = s.slice(at, s.indexOf("return {\n    id: \"hawlai_site\""));
    expect(block).toMatch(/JSON\.parse\(JSON\.stringify\(page\.sections \?\? \[\]\)\)/);
  });

  it("REMOVAL IS NOT VERIFIED BY READING THE PAGE", () => {
    // An absence cannot be told apart from a page that failed to load,
    // and reporting "it is gone" off a failed fetch is the kind of
    // claim this adapter exists to avoid.
    const s = site();
    const at = s.indexOf("async function executeFaq");
    const block = s.slice(at, s.indexOf("return {\n    id: \"hawlai_site\""));
    const removal = block.indexOf("if (want.remove) {");
    const verify = block.indexOf("readLiveText");
    expect(removal).toBeGreaterThan(-1);
    expect(removal, "a removal goes on to claim it read the page").toBeLessThan(verify);
  });

  it("UNDO REMOVES EXACTLY THE ITEM THAT WAS ADDED", () => {
    // THE CLAUSE THAT MAKES THE WHOLE KEY ELIGIBLE FOR L1. Not "clear
    // the FAQ", not "restore a snapshot" — that one id.
    const s = site();
    const at = s.indexOf('if (action.actionKey === "add_faq_item") {');
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at, s.indexOf('if (action.actionKey === "update_page_text") {', at));
    expect(block.length).toBeLessThan(2000);
    expect(block).toMatch(/requestedChanges: \{ itemId: want\.itemId, remove: true \}/);
    expect(block).toMatch(/actionKey: "add_faq_item"/);
  });

  it("AND IT PROPOSES RATHER THAN WRITING", () => {
    // The contract for every undo on every platform here, which is why
    // a removal goes back through an approval of its own.
    const s = site();
    const at = s.indexOf('if (action.actionKey === "add_faq_item") {');
    const block = s.slice(at, s.indexOf('if (action.actionKey === "update_page_text") {', at));
    expect(block, "undo wrote to the page itself").not.toMatch(/\.update\(/);
  });

  it("UNDOING A REMOVAL IS REFUSED, not quietly republished", () => {
    // Putting an answer back would mean re-approving copy that was
    // taken down on purpose.
    const s = site();
    const at = s.indexOf('if (action.actionKey === "add_faq_item") {');
    const block = s.slice(at, s.indexOf('if (action.actionKey === "update_page_text") {', at));
    expect(block).toMatch(/if \(want\.remove\)/);
    expect(block).toMatch(/already a removal/);
  });

  it("and an item that is gone already cannot be undone", () => {
    const s = site();
    const at = s.indexOf('if (action.actionKey === "add_faq_item") {');
    const block = s.slice(at, s.indexOf('if (action.actionKey === "update_page_text") {', at));
    expect(block).toMatch(/isn't in the FAQ any more/);
  });
});
