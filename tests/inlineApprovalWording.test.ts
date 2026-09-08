// Nothing on the price-change path sends the merchant to a page.
//
// THIRD TIME. This was "fixed" twice by changing one string, and both
// times a sibling survived:
//
//   1st — the happy-path note said "Sent to Approvals".
//   2nd — the DUPLICATE path had its own copy, untouched.
//   3rd — neither was the real source. The model was composing the
//         line from the TOOL DESCRIPTION ("sends it to the Approvals
//         queue for the owner to review") and from a SYSTEM PROMPT
//         instruction that fires on every approval-gated action
//         ("clearly tell them where to go review and approve it").
//
// Changing one string at a time is what kept missing. The rule is not
// "this sentence must differ"; it is "no input the model reads on this
// path may point anywhere but the card". So this scans every such
// input at once, and it is the check that has to fail — not a person
// re-reading three files hoping to spot the fourth.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** Phrasings that send someone away from the card in front of them. */
const SENDS_THEM_AWAY = [
  /approvals?\s+page/i,
  /go to\s+\/dashboard\/approvals/i,
  /sent to approvals/i,
  /review it (on|in|at)/i,
  /confirm it (on|in|at) the/i,
  /head (over )?to the approvals/i,
];

/** Every input the model reads when handling a price change. */
function priceChangeInputs(): { name: string; text: string }[] {
  const brain = committed("src/lib/agents/masterBrainV2.ts");

  const toolStart = brain.indexOf('name: "propose_price_change"');
  const toolDescription = brain.slice(toolStart, brain.indexOf("input_schema", toolStart));

  const handler = brain.slice(
    brain.indexOf('case "propose_price_change": {'),
    brain.indexOf('case "propose_campaign_budget_change":')
  );

  // The card lives in extractArtifact. The anchor here USED to be
  // "function toArtifact", a function that does not exist — indexOf
  // returned -1, the fallback searched from 0, and the slice silently
  // became a second copy of the handler. It passed, it looked like
  // four inputs were scanned, and the real card was never read once.
  // Exactly the vacuity the test below was written to prevent, in the
  // test that prevents it.
  const cardStart = brain.indexOf('case "propose_price_change": {', brain.indexOf("function extractArtifact"));
  const card = brain.slice(cardStart, cardStart + 3000);

  // The system prompt is the shared step: it applies to EVERY
  // approval-gated action, which is exactly why a fix confined to the
  // price tool could not reach it.
  const promptStart = brain.indexOf("const systemPrompt = ");
  const systemPrompt = brain.slice(promptStart);

  return [
    { name: "tool description (masterBrainV2)", text: toolDescription },
    { name: "handler result strings (masterBrainV2)", text: handler },
    { name: "artifact card (masterBrainV2)", text: card },
    { name: "system prompt", text: systemPrompt },
    { name: "tool registry", text: committed("src/lib/businessBrain/toolRegistry.ts") },
    { name: "create.ts", text: committed("src/lib/publish/create.ts") },
  ];
}

describe("the price-change path never points away from the inline card", () => {
  const inputs = priceChangeInputs();

  it("found every input, so the scan is not vacuous", () => {
    // Each slice depends on an anchor string. A rename would silently
    // empty one and the assertions below would pass over nothing —
    // the same failure that let this bug survive two fixes.
    for (const input of inputs) {
      expect(input.text.length, `${input.name} came back empty — its anchor moved`).toBeGreaterThan(100);
    }
  });

  it("no two slices are the same text, so none is a duplicate standing in for a missing one", () => {
    // Non-empty was not a strong enough check. A broken anchor fell
    // back to offset 0 and produced a DUPLICATE of another slice —
    // long, plausible, and covering nothing new. Distinctness is what
    // actually catches that.
    const seen = new Map<string, string>();
    for (const input of inputs) {
      const prior = seen.get(input.text);
      expect(prior, `${input.name} is byte-identical to ${prior} — one anchor is resolving to the other's region`).toBeUndefined();
      seen.set(input.text, input.name);
    }
  });

  it.each(inputs.map((i) => [i.name, i] as const))("%s does not send them away", (_name, input) => {
    const offenders: string[] = [];
    for (const line of input.text.split("\n")) {
      // Comments explain the rule and necessarily quote the banned
      // phrasings; they are not read by the model.
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      // The campaign tools DO still use the Approvals page — they have
      // no inline card. Their lines are legitimately allowed to say so.
      if (/propose_campaign_(budget|targeting)_change/.test(line)) continue;
      if (/Ads Manager/.test(line)) continue;

      // A PROHIBITION quotes the banned phrasing in order to forbid
      // it — `NEVER add "sent to Approvals"` is the fix, not the bug.
      //
      // Matched literally rather than by a cleverer regex: the first
      // attempt used regex word boundaries, a heredoc turned them into
      // literal backspace bytes, and the exemption silently never
      // fired. A plain substring cannot fail that way, and anything
      // it lets through is a line that explicitly forbids the phrase.
      if (/NEVER add|never tell|do not tell|never direct/i.test(line)) continue;

      for (const pattern of SENDS_THEM_AWAY) {
        if (pattern.test(line)) {
          offenders.push(trimmed.slice(0, 160));
          break;
        }
      }
    }
    expect(
      offenders,
      `${input.name} tells the merchant to go somewhere else, but the Approve/Reject buttons are already in the message:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("the system prompt explicitly carves out inline-approval actions", () => {
    // Not enough to remove the offending phrasing — the prompt has a
    // general "tell them where to go" instruction for ad spend, and
    // without an explicit exception the model reapplies it to any
    // gated action. Removing wording fixes one output; naming the
    // exception fixes the reasoning.
    const prompt = inputs.find((i) => i.name === "system prompt")!.text;
    expect(prompt).toMatch(/buttons directly in the chat|Approve\/Reject buttons in the chat/i);
    expect(prompt).toMatch(/propose_price_change/);
  });
});

// FOURTH TIME, and the reason the first three scans could not have
// caught it: the offending instruction contains none of the banned
// phrasings. It COMMANDS the behaviour generically —
//
//   "ALWAYS end your reply with one short line ... Name the exact
//    page/tab it landed on"
//
// — and the model, required to name a page and forbidden from naming
// the Approvals page, named it anyway because it is the only page that
// fits a pending price change. Banning output phrasings cannot reach a
// rule that produces them; the rule itself needs the exception.
//
// So this is a different check from the scan above: not "does any line
// say the bad thing", but "does every blanket instruction that would
// produce it carve out the inline-approval case".
describe("blanket prompt rules carve out the inline-approval and choose-from cases", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const prompt = brain.slice(brain.indexOf("const systemPrompt = "));

  function ruleContaining(needle: string): string {
    const line = prompt.split("\n").find((l) => l.includes(needle));
    expect(line, `no prompt rule contains "${needle}" — it was reworded, so this check is no longer reading the rule it was written for`).toBeDefined();
    return line!;
  }

  it("the saved-to-a-page rule is not unconditional", () => {
    // Nothing is saved when a price change is awaiting approval, so
    // the confirming line is not merely misplaced — it is untrue.
    const rule = ruleContaining("its normal dashboard page");
    expect(rule).not.toMatch(/ALWAYS end your reply/);
    expect(rule).toMatch(/EXCEPTION/);
    expect(rule).toMatch(/propose_price_change|inline approval card/i);
  });

  it("the don't-enumerate-lists rule exempts a list the person must choose from", () => {
    // THE DISAMBIGUATION REGRESSION. candidates[] is an array result,
    // so the blanket rule suppressed it — leaving "I found 3 matches"
    // and no way to answer. A list that IS the question has to be
    // written out.
    const rule = ruleContaining("don't enumerate a tool's list/array results");
    expect(rule).toMatch(/EXCEPTION/);
    expect(rule).toMatch(/needs_clarification|choose from|CHOOSE FROM/);
    expect(rule).toMatch(/number(ed)? (them|list)/i);
  });

  it("the candidate card numbers its options, matching the numbered list", () => {
    // "The second one" refers to nothing if only one of the two
    // surfaces counts.
    const cardStart = brain.indexOf('case "propose_price_change": {', brain.indexOf("function extractArtifact"));
    const card = brain.slice(cardStart, cardStart + 3000);
    expect(card).toMatch(/\$\{i \+ 1\}\./);
  });
});
