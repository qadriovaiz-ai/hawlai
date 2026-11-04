// NOTHING THAT CHANGES STATE IS REACHABLE EXCEPT THROUGH AN ACTION.
//
// S6/P0, and this sentence replaces the stage's original exit clause
// ("tool count falls") by the founder's decision of 4 November 2026.
// The old one could be satisfied by DELETING READS — the analytics
// tool, read_page, research_competitor — which costs the owner
// capability and buys no safety. The architecture doc recommended the
// replacement in §4.3 and nothing had acted on it.
//
// WHY A SECOND DOOR TEST, when tests/approvalCoverage.test.ts exists.
// That one greps each tool's `case` body for the symbols that reach the
// outside world. It is a good guard and it stays. But two tools' case
// bodies are one line long:
//
//     case "activate_meta_campaign":
//       return activateMetaCampaign(ctx, supabase, input);
//
// A ONE-HOP GREP IS DEFEATED BY A ONE-LINE DELEGATION. The money step
// behind that call is gated, and was gated before this file existed —
// but that grep could not see it, so the grep was not what kept it
// gated. This walks the call graph instead.
//
// DOORS ARE WALLS, which is what makes the result mean something: the
// walk never enters an Action, so a sender it can still reach is a
// sender reachable WITHOUT one. See tests/helpers/reachability.ts for
// what the walk can and cannot see, written down honestly.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { functionIndex, reachable } from "./helpers/reachability";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

/**
 * The symbols that reach the outside world, or change what a customer
 * can transact with.
 *
 * KEPT IN STEP WITH approvalCoverage.test.ts BY A TEST BELOW, rather
 * than by hoping. Two lists of senders in two files is two lists that
 * drift, and the drift would be silent in the dangerous direction.
 */
const OUTBOUND = [
  // mail, calls, public posts, customer replies
  "sendDealerEmail",
  "sendMarketingEmail",
  "triggerVapiCall",
  "uploadVideoToYouTube",
  "postPhotoToPage",
  "postTextToPage",
  "postPhotoToInstagram",
  "sendDmReply",
  "sendCommentReply",
  "sendWhatsAppText",
  "sendWhatsAppImage",
  // money and live platform state
  "setCampaignStatus",
];

/**
 * The Actions. The walk stops at each of these.
 *
 * `createPublishAction` and `requestApproval` are the two doors. The
 * platform factories are here for a different reason: constructing a
 * platform is handing the Action layer its tool, not performing
 * anything. A platform's `preview`/`execute` is invoked ONLY inside
 * `src/lib/publish/` — which the first test below pins, because that
 * invariant is what licenses these walls. Without it, a tool could call
 * `createMetaPlatform(...).execute(...)` itself and this walk would
 * look away.
 */
const DOORS = [
  "createPublishAction",
  "requestApproval",
  "createMetaPlatform",
  "createShopifyPlatform",
  "createHawlaiShopPlatform",
  "createHawlaiSitePlatform",
  "createPlatformRegistry",
];

/**
 * The paths that are ungated on purpose. Each carries the decision and
 * its date, and NOTHING NEW GOES ON THIS LIST — the test below asserts
 * its exact membership, so adding an entry is a visible edit to a
 * frozen set rather than a line in a diff nobody reads.
 */
const UNGATED_BY_DECISION: Record<string, { symbols: string[]; why: string }> = {
  pause_meta_campaign: {
    symbols: ["setCampaignStatus"],
    why:
      "2026-11-04, recorded: stopping spend is never gated — CLAUDE.md rule 6, the safe direction must not be the slow one. Gating a pause would leave someone watching money burn while waiting on a click. The policy agrees: auto_paused_campaign is requiresApproval: false, and pauseMetaCampaign's own header carries the reason.",
  },
  send_email: {
    symbols: ["sendDealerEmail"],
    why:
      "2026-09-14, approved by the founder (Part 1 step 3): mail to a TEAM MEMBER of the same business sends directly. No customer sees it, nothing is published, nothing is spent. Mail to a lead or customer from the same tool is NOT exempt and is gated by a preview card, which approvalCoverage.test.ts asserts.",
  },
};

/** The body of one `case "<tool>":` block inside executeTool. */
function toolCases(): { tool: string; body: string }[] {
  const src = code(BRAIN);
  const start = src.indexOf("export async function executeTool");
  const end = src.indexOf("export interface ChatTurnResult");
  const body = src.slice(start, end);
  const names = [...body.matchAll(/\n    case "([a-z_0-9]+)"/g)].map((m) => m[1]);
  return names.map((tool) => {
    const from = body.indexOf(`\n    case "${tool}"`);
    const next = body.indexOf('\n    case "', from + 10);
    return { tool, body: body.slice(from, next < 0 ? undefined : next) };
  });
}

describe("1. the walls are walls for a reason", () => {
  it("A PLATFORM IS ONLY EVER PERFORMED INSIDE src/lib/publish/", () => {
    // THE INVARIANT THAT LICENSES THE PLATFORM WALLS. If a tool could
    // call `platform.execute(...)` itself, treating the factory as a
    // wall would hide exactly the call this file exists to find.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of require("fs").readdirSync(dir)) {
        const path = `${dir}/${entry}`;
        if (require("fs").statSync(path).isDirectory()) {
          if (entry === "node_modules" || entry === ".next") continue;
          walk(path);
          continue;
        }
        if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
        if (path.includes("src/lib/publish/")) continue;
        const src = code(path);
        for (const m of src.matchAll(/\bplatform\s*\.\s*(execute|preview|undo|verify)\s*\(/g)) {
          offenders.push(`${path}: platform.${m[1]}(`);
        }
      }
    };
    walk("src");
    expect(
      offenders,
      `A platform is performed outside the Action layer. Either move it inside src/lib/publish/, or stop treating the platform factories as walls in this file:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("and the factories this file walls off are real functions", () => {
    // A typo in DOORS would silently wall off nothing, and every
    // assertion below would be weaker without saying so.
    const index = functionIndex();
    for (const door of DOORS) {
      expect(index.has(door), `${door} is not a function this repo declares`).toBe(true);
    }
  });
});

describe("2. THE WALK ITSELF WORKS — asserted before it is trusted", () => {
  // Without these, a walker that found nothing would make every
  // assertion in section 3 vacuous and green.
  const index = functionIndex();

  it("FINDS A SENDER CALLED DIRECTLY", () => {
    const r = reachable(`{ await sendDealerEmail(a, b); }`, OUTBOUND, DOORS, { index });
    expect(r.found).toEqual(["sendDealerEmail"]);
  });

  it("FINDS A SENDER TWO HOPS AWAY — the gap a one-hop grep leaves", () => {
    // This is the whole reason the file exists: switchMetaCampaign was
    // one such hop, and the old grep saw a clean two-line case body.
    const r = reachable(`{ return activateMetaCampaign(ctx, supabase, input); }`, ["setCampaignStatus"], [], { index });
    expect(r.found).toContain("setCampaignStatus");
  });

  it("FINDS A SENDER HIDDEN BEHIND A RENAME", () => {
    // `const { sendDealerEmail: mail } = await import(...)` is the
    // house style in masterBrainV2.ts, and the first version of the
    // walker missed it entirely.
    const r = reachable(
      `{ const { sendDealerEmail: mail } = await import("../email/sendDealerEmail"); await mail(a, b); }`,
      OUTBOUND,
      DOORS,
      { index }
    );
    expect(r.found).toEqual(["sendDealerEmail"]);
  });

  it("FINDS A SENDER CALLED AS A METHOD", () => {
    // `callsIn` collects property calls as well as plain ones. Nothing
    // in OUTBOUND is called as a method TODAY, so a mutation deleting
    // that line survived — the line was insurance nothing tested. It is
    // kept, because a sender reached as `client.sendWhatsAppText(...)`
    // is one import away, and now it is pinned.
    const r = reachable(`{ await client.sendWhatsAppText(to, text); }`, OUTBOUND, DOORS, { index });
    expect(r.found).toEqual(["sendWhatsAppText"]);
  });

  it("AND DOES NOT WALK PAST A DOOR", () => {
    const r = reachable(`{ await requestApproval(x); }`, OUTBOUND, DOORS, { index });
    expect(r.found).toEqual([]);
    expect(r.walls).toEqual(["requestApproval"]);
  });

  it("finds the tool switch at all, and all of it", () => {
    // A parsing mistake here would make section 3 pass over nothing.
    const cases = toolCases();
    expect(cases.length).toBeGreaterThan(50);
    expect(cases.map((c) => c.tool)).toContain("send_email");
    expect(cases.map((c) => c.tool)).toContain("activate_meta_campaign");
    for (const c of cases) expect(c.body.length, c.tool).toBeGreaterThan(20);
  });
});

describe("3. NOTHING THAT CHANGES STATE IS REACHABLE EXCEPT THROUGH AN ACTION", () => {
  it("NO CHAT TOOL REACHES THE OUTSIDE WORLD WITHOUT A DOOR", () => {
    const index = functionIndex();
    const offences: string[] = [];
    for (const { tool, body } of toolCases()) {
      const r = reachable(body, OUTBOUND, DOORS, { index });
      const allowed = UNGATED_BY_DECISION[tool]?.symbols ?? [];
      for (const symbol of r.found) {
        if (allowed.includes(symbol)) continue;
        offences.push(`${tool} can reach ${symbol} without passing an Action`);
      }
    }
    expect(
      offences,
      `A chat tool can change something outside this product without going through an Action.\nCreate an approval (requestApproval) or a publish action (createPublishAction) instead.\nIf the path is deliberate, it needs an entry in UNGATED_BY_DECISION with the decision and its date — and the founder's, not yours:\n${offences.join("\n")}`
    ).toEqual([]);
  });

  it("AND THE ONES THAT DO ARE THERE BY A RECORDED DECISION", () => {
    // The list is frozen. Adding an entry means editing this set, which
    // is a visible edit rather than a line in a diff nobody reads.
    expect(Object.keys(UNGATED_BY_DECISION).sort()).toEqual(["pause_meta_campaign", "send_email"]);
    for (const [tool, entry] of Object.entries(UNGATED_BY_DECISION)) {
      expect(entry.why, `${tool}'s exemption needs the date of the decision`).toMatch(/20\d\d-\d\d-\d\d/);
      expect(entry.why.length, `${tool}'s exemption needs a reason, not a label`).toBeGreaterThan(80);
      expect(entry.symbols.length, tool).toBeGreaterThan(0);
    }
  });

  it("AND EACH EXEMPTION IS STILL LIVE — an entry for a path that closed is deleted", () => {
    // The same rule oneDoorForCopy.test.ts has: a file that migrates
    // fails the suite until its entry is removed, so the list can only
    // shrink. An exemption nobody needs any more is an exemption
    // somebody will one day lean on.
    const index = functionIndex();
    const cases = new Map(toolCases().map((c) => [c.tool, c.body]));
    for (const [tool, entry] of Object.entries(UNGATED_BY_DECISION)) {
      const body = cases.get(tool);
      expect(body, `${tool} is not a tool any more — delete its exemption`).toBeTruthy();
      const r = reachable(body!, OUTBOUND, DOORS, { index });
      for (const symbol of entry.symbols) {
        expect(
          r.found,
          `${tool} no longer reaches ${symbol} without a door — delete that symbol from its exemption`
        ).toContain(symbol);
      }
    }
  });

  it("THE TWO CAMPAIGN DIRECTIONS ARE SEPARATE FUNCTIONS", () => {
    // What makes the walk able to tell them apart at all — see
    // pauseMetaCampaign's header. campaignSwitchTools.test.ts asserts
    // this too, but against `git show HEAD:`, so a working-tree change
    // that merged them again would not fail until it was committed.
    // This reads the file on disk.
    const brain = code(BRAIN);
    expect(brain).not.toMatch(/switchMetaCampaign/);
    expect(brain).toMatch(/case "activate_meta_campaign":\s*\n\s*return activateMetaCampaign\(/);
    expect(brain).toMatch(/case "pause_meta_campaign":\s*\n\s*return pauseMetaCampaign\(/);
  });

  it("THE MONEY STEP IS NOT ON THE LIST, AND CANNOT BE", () => {
    // The one entry this list must never carry. Spend is always human:
    // executionPolicy pins activate_ad_campaign to requiresApproval,
    // and this pins that the walk still holds it.
    expect(Object.keys(UNGATED_BY_DECISION)).not.toContain("activate_meta_campaign");
    expect(Object.keys(UNGATED_BY_DECISION)).not.toContain("launch_meta_campaign");
    const index = functionIndex();
    const cases = new Map(toolCases().map((c) => [c.tool, c.body]));
    for (const tool of ["activate_meta_campaign", "launch_meta_campaign"]) {
      const r = reachable(cases.get(tool)!, OUTBOUND, DOORS, { index });
      expect(r.found, `${tool} must reach nothing outside an Action`).toEqual([]);
      expect(r.walls, `${tool} must pass through an Action`).toContain("createPublishAction");
    }
  });
});

describe("4. the two door tests cannot drift apart", () => {
  it("EVERY SENDER approvalCoverage WATCHES IS WATCHED HERE TOO", () => {
    // Two lists of senders in two files is two lists that drift, and
    // the drift would be silent in the dangerous direction: a sender
    // added there and forgotten here would be followed by neither the
    // grep (which only sees one hop) nor this walk.
    const other = code("tests/approvalCoverage.test.ts");
    // ITS SENDERS BLOCK, READ AS WORDS rather than as regex syntax. The
    // first version of this tried to parse the regex literals that
    // block holds and matched nothing, which made the assertion vacuous
    // and green — the exact failure mode section 2 exists to prevent in
    // the walk itself, found here by its own guard.
    const from = other.indexOf("const SENDERS");
    const block = other
      .slice(from, other.indexOf("];", from))
      // `\b` glued to the front of every name, because the list holds
      // regex literals: without this, `\bsendDealerEmail` reads as the
      // word `bsendDealerEmail` and the filter below drops it. The
      // second version of this assertion matched the words "sends" and
      // "posts" out of the prose and nothing else.
      .replace(/\\b/g, "");
    const theirs = new Set(
      (block.match(/[A-Za-z]\w*/g) ?? []).filter((w) => /^(send|post|trigger|upload)[A-Z]/.test(w))
    );
    expect(theirs.size, "the sender list in approvalCoverage.test.ts could not be read").toBeGreaterThan(5);
    for (const symbol of theirs) {
      expect(OUTBOUND, `${symbol} is watched by approvalCoverage but not here`).toContain(symbol);
    }
  });

  it("and the grep-based test is still there, because it says something this one does not", () => {
    // It asserts the SHAPE of the gate — that send_email proposes, that
    // the five audited actions name their action type, that switching a
    // toggle off is ungated. This file only asserts reachability.
    const other = code("tests/approvalCoverage.test.ts");
    expect(other).toMatch(/NO TOOL CASE CALLS A SENDER DIRECTLY/);
    expect(other).toMatch(/THE FIVE AUDITED ACTIONS EACH ASK FIRST/);
  });
});
