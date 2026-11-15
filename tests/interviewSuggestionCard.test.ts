// Confirm, change, or say it's wrong — D3.
//
// The draft from D2 reaches the owner here. The tests that matter are
// about what the screen does NOT do: it never shows a draft beside a
// blank box, it never implies a draft that does not exist, and
// confirming one never quietly turns a guess into something the owner
// is recorded as having said.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

const ROUTE = "src/app/api/interview/route.ts";
const CARD = "src/components/settings/InterviewCard.tsx";

describe("1. CONFIRMING DOES NOT LAUNDER A GUESS", () => {
  it("THE ORIGIN IS READ OFF THE EXISTING ROW AND WRITTEN BACK", () => {
    // THE LOAD-BEARING ONE. An upsert writes the whole row, so saying
    // nothing about `source` would blank it — a confirmed discovery
    // would come back reading as if nobody had ever suggested
    // anything, and the one question this column exists to answer
    // would be unanswerable.
    const src = code(ROUTE);
    expect(src).toMatch(/const origin = String\(before\?\.source \?\? ""\)\.trim\(\) \|\| "owner";/);
    const upsert = src.slice(src.indexOf('status: "answered"'));
    expect(upsert.slice(0, 200)).toMatch(/source: origin,/);
  });

  it("AND `owner` IS ONLY USED WHEN THERE WAS NO DRAFT", () => {
    const src = code(ROUTE);
    // The fallback is the literal, reached only when the row carries
    // no source — which is a question nothing ever suggested.
    expect(src).toMatch(/\|\| "owner";/);
    expect(src).not.toMatch(/source: "owner",/);
  });

  it("THE ROUTE READS THE SOURCE COLUMN IT NEEDS", () => {
    // Asked for by name: an upsert cannot preserve a column the select
    // never fetched, and the failure would be silent.
    const src = code(ROUTE);
    expect(src).toMatch(/select\("question_key, status, attempts, weak, source, suggested_value"\)/);
  });

  it("the draft is cleared once it has been decided", () => {
    const src = code(ROUTE);
    const upsert = src.slice(src.indexOf('status: "answered"'));
    expect(upsert.slice(0, 300)).toMatch(/suggested_value: null,/);
  });
});

describe("2. REJECTING IS NOT SKIPPING", () => {
  it("THE ROUTE HAS ITS OWN BRANCH, BEFORE ANYTHING IS JUDGED", () => {
    const src = code(ROUTE);
    expect(src).toMatch(/const reject = \(body as any\)\?\.reject === true;/);
    const branch = src.indexOf("if (reject) {");
    expect(branch).toBeGreaterThan(-1);
    // Before judgeAnswer: there is no answer to judge.
    expect(branch).toBeLessThan(src.indexOf("judgeAnswer("));
  });

  it("IT CALLS rejectSuggestion AND NOT THE SKIP WRITE", () => {
    const src = code(ROUTE);
    const start = src.indexOf("if (reject) {");
    const branch = src.slice(start, src.indexOf("}", src.indexOf("return", start)));
    expect(branch).toMatch(/rejectSuggestion\(service, dealershipId, key\)/);
    expect(branch).not.toMatch(/status: "skipped"/);
  });

  it("AND THE CARD OFFERS IT AS A THIRD THING, not as the skip", () => {
    const src = code(CARD);
    expect(src).toMatch(/async function reject\(\)/);
    const fn = src.slice(src.indexOf("async function reject()"));
    expect(fn.slice(0, 200)).toMatch(/send\(\{ reject: true \}\)/);
    // The skip is still there, separately, with its own words.
    expect(src).toMatch(/send\(\{ skip: true \}\)/);
  });
});

describe("3. THE SCREEN NEVER ASKS FOR THE SAME THING TWICE", () => {
  it("A DRAFT AND A BLANK BOX ARE NEVER BOTH ON SCREEN", () => {
    // THE FRICTION ONE. A suggested answer beside an empty field asks
    // him to do both, which is more work than the form this replaces.
    const src = code(CARD);
    expect(src).toMatch(/\{\(!suggestion \|\| editing\) && \(question\.kind === "yes_no" \?/);
  });

  it("AND THE SAVE BUTTON GOES WITH THE BOX, not with the draft", () => {
    const src = code(CARD);
    expect(src).toMatch(/question\.kind !== "yes_no" && \(!suggestion \|\| editing\) &&/);
  });

  it("EDITING STARTS FROM THE DRAFT, not from an empty field", () => {
    // Correcting two words beats retyping a sentence, and that is the
    // whole reason this is lower friction than the interview alone.
    const src = code(CARD);
    const onEdit = src.slice(src.indexOf("setEditing(true)") - 400, src.indexOf("setEditing(true)"));
    expect(onEdit).toMatch(/setAnswer\(suggestion\.value\)/);
  });
});

describe("4. THE CARD SHOWS WHAT HE NEEDS TO CHECK IT", () => {
  it("THE SENTENCE IT WAS READ FROM IS ON SCREEN — unless it IS the draft", () => {
    // Without it he is confirming something he cannot check, which is
    // the friction this feature exists to remove.
    //
    // BUT NOT TWICE. The hours and the address are passed through from
    // his page unchanged, so the draft and its evidence are word for
    // word identical — and printing both makes him read the same line
    // twice looking for a difference that is not there. Found by
    // rendering the card and looking at it, not by reasoning about it.
    const src = code(CARD);
    expect(src).toMatch(
      /suggestion\.evidence\?\.quote && suggestion\.evidence\.quote\.trim\(\) !== suggestion\.value\.trim\(\) && \(/
    );
  });

  it("AND A DISCOVERY AND A DEDUCTION ARE DESCRIBED DIFFERENTLY", () => {
    // A wrong transcription and a wrong deduction are different
    // mistakes; he is checking for different things.
    const src = code(CARD);
    expect(src).toMatch(/suggestion\.source === "discovered"/);
    expect(src).toMatch(/Your website already says this/);
    expect(src).toMatch(/Worked out from your own products/);
  });

  it("THREE WAYS OUT, ALL THREE PRESENT", () => {
    const src = code(CARD);
    expect(src).toMatch(/Yes, that&apos;s right/);
    expect(src).toMatch(/Change it/);
    expect(src).toMatch(/That&apos;s wrong/);
  });

  it("CONFIRMING SENDS THE DRAFT AS AN ORDINARY ANSWER", () => {
    // Which is what puts it through judgeAnswer and into
    // business_knowledge exactly like a typed one — no second write
    // path, no second set of rules.
    const src = code(CARD);
    expect(src).toMatch(/send\(\{ answer: suggestion\.value \}\)/);
  });
});

describe("5. A DRAFT IS NEVER IMPLIED WHERE THERE IS NONE", () => {
  it("THE SERVER SENDS ONE DRAFT, FOR THE QUESTION BEING ASKED", () => {
    const src = code(ROUTE);
    expect(src).toMatch(/pendingSuggestions\(rows\)\.find\(\(s\) => s\.questionKey === next!\.key\) \?\? null/);
    expect(src).toMatch(/suggestion: draft,/);
  });

  it("AND THE CARD CHECKS IT BELONGS TO THIS QUESTION", () => {
    const src = code(CARD);
    expect(src).toMatch(/draft && draft\.questionKey === data\.next\?\.key \? draft : null/);
  });

  it("a question with no draft leaves the card exactly as it was", () => {
    const src = code(CARD);
    expect(src).toMatch(/\{suggestion && !editing && \(/);
  });
});

describe("6. DISCOVERY IS A WRITE, SO IT IS A POST", () => {
  // AN EXISTING TEST CAUGHT THE FIRST VERSION OF THIS, and it was
  // right. interviewProgress's "the reads go through RLS in the
  // handler that only reads" asserts GET never reaches for the service
  // client — and D3 originally ran discovery there, writing rows from
  // a GET. The test was not weakened; the design was changed.

  it("THE READ-ONLY HANDLER STAYS READ-ONLY", () => {
    const src = code(ROUTE);
    const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
    expect(get).not.toMatch(/createServiceClient/);
    expect(get).not.toMatch(/storeSuggestion/);
    expect(get).not.toMatch(/\.upsert\(/);
  });

  it("AND IT ONLY TELLS THE SCREEN THAT DISCOVERY IS WANTED", () => {
    const src = code(ROUTE);
    const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"));
    expect(get).toMatch(/const needsDiscovery = !\(rows \?\? \[\]\)\.length;/);
    expect(get).toMatch(/needsDiscovery,/);
  });

  it("THE POST DOES THE WORK, with the service client", () => {
    // Which is where this file's writes already live, after the
    // session has resolved the business.
    const src = code(ROUTE);
    const post = src.slice(src.indexOf("export async function POST"));
    const block = post.slice(post.indexOf("if (discover) {"), post.indexOf("const question = questionByKey"));
    expect(block).toMatch(/const service = createServiceClient\(\);/);
    expect(block).toMatch(/storeSuggestion\(service, dealershipId, suggestion, null\)/);
  });

  it("IT RUNS ONLY WHILE NOTHING HAS BEEN DECIDED", () => {
    // Not "no suggestions left", which would re-run forever once he
    // had dealt with every draft.
    const src = code(ROUTE);
    const post = src.slice(src.indexOf("export async function POST"));
    const block = post.slice(post.indexOf("if (discover) {"), post.indexOf("const question = questionByKey"));
    expect(block).toMatch(/if \(\(existing \?\? \[\]\)\.length\) return NextResponse\.json\(\{ ok: true, discovered: 0, already: true \}\)/);
  });

  it("A SITE THAT CANNOT BE READ STILL LEAVES THE INTERVIEW WORKING", () => {
    const src = code(ROUTE);
    const post = src.slice(src.indexOf("export async function POST"));
    const block = post.slice(post.indexOf("if (discover) {"), post.indexOf("const question = questionByKey"));
    expect(block).toMatch(/catch \(err: any\) \{/);
    expect(block).toMatch(/console\.error/);
    expect(block).toMatch(/return NextResponse\.json\(\{ ok: true, discovered: 0 \}\)/);
  });

  it("AND THE CARD ASKS ONCE, THEN READS AGAIN", () => {
    const src = code(CARD);
    expect(src).toMatch(/if \(data\.needsDiscovery\) \{/);
    expect(src).toMatch(/JSON\.stringify\(\{ discover: true \}\)/);
    // One retry, carried on the call itself — a site that yields
    // nothing still leaves the business with no rows, so without this
    // the card would ask, re-read, find nothing, and ask again.
    expect(src).toMatch(/if \(!discovered\) return load\(true\);/);
  });
});
