// The propose_price_change tool, as a contract rather than a mock of
// Master Chat's whole loop.
//
// CLARIFICATION STATE: there is none, and that is the design. The
// existing pattern in this codebase (propose_campaign_budget_change)
// keeps multi-turn context in CHAT HISTORY — the tool returns
// something the model relays, the person answers, the model calls the
// tool again. No pending-question table, no session state.
//
// This tool follows that, with one change: where the campaign tool
// returns "couldn't tell which one you meant" and LOSES the list, this
// returns the candidates. The list then lives in the chat history as a
// tool result, and the follow-up call passes back a variant_id from
// it — user_clarified resolution with no new state to manage.

import { describe, it, expect } from "vitest";
import { BUSINESS_BRAIN_TOOLS } from "@/lib/businessBrain/toolRegistry";
import { interpretCandidates, userClarified, type ResolvedTarget } from "@/lib/publish/resolve";
import { execFileSync } from "child_process";

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

const candidate = (over: Partial<ResolvedTarget> = {}): ResolvedTarget => ({
  ref: "gid://shopify/ProductVariant/1",
  title: "Blue Kurta",
  variantTitle: null,
  currentPrice: "1299",
  imageUrl: "https://cdn/1.jpg",
  active: true,
  ...over,
});

describe("the tool is registered honestly", () => {
  const tool = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "propose_price_change");

  it("exists in the catalog", () => {
    expect(tool).toBeDefined();
  });

  it("is CHAT ONLY", () => {
    // A voice call cannot show a candidate list with prices and
    // images. "Which one did you mean?" over the phone against five
    // similar variants is how the wrong product gets repriced — a
    // channel that cannot show the options cannot honour "never
    // guess".
    expect(tool!.channels).toEqual(["chat"]);
  });

  it("says plainly that it does not apply the change", () => {
    // The description is what the model reads to decide whether this
    // is the right tool. If it implied the price changes immediately,
    // the model would describe the outcome wrongly to the person.
    expect(tool!.description.toLowerCase()).toContain("never applies it directly");
    expect(tool!.description.toLowerCase()).toContain("approvals");
  });
});

describe("the clarification round trip needs no new state", () => {
  it("an ambiguous phrase yields candidates, not a pick", () => {
    const outcome = interpretCandidates("kurta", [
      candidate({ ref: "v1", variantTitle: "Small", currentPrice: "1299" }),
      candidate({ ref: "v2", variantTitle: "Medium", currentPrice: "1399" }),
    ]);
    expect(outcome.status).toBe("ambiguous");
  });

  it("a variant_id from that list resolves as user_clarified", () => {
    // The whole multi-turn mechanism: the candidate list lives in the
    // chat history as a tool result, and the follow-up call passes an
    // id back out of it. Nothing is stored between turns.
    const shown = [candidate({ ref: "v1" }), candidate({ ref: "v2" })];
    const outcome = userClarified("kurta", shown[1], shown);
    expect(outcome.status === "resolved" && outcome.path).toBe("user_clarified");
    expect(outcome.detail.chosenRef).toBe("v2");
    expect(outcome.detail.candidateCount).toBe(2);
  });
});

describe("the handler's safety rules, read from the committed source", () => {
  const source = committed("src/lib/agents/masterBrainV2.ts");
  const handler = source.slice(source.indexOf('case "propose_price_change": {'), source.indexOf('case "propose_campaign_budget_change":'));

  it("validates a supplied variant_id against the search results", () => {
    // THE LOAD-BEARING ONE. A model can hallucinate an id, and a REAL
    // id for the wrong product would reprice something nobody looked
    // at. The id must be one of the candidates this search returned.
    expect(handler).toMatch(/search\.candidates\.find/);
    expect(handler).toMatch(/doesn't match anything I found/);
  });

  it("returns needs_clarification rather than an error when ambiguous", () => {
    // Not an error: the model needs to show the options and wait. An
    // error phrasing makes it apologise instead of asking.
    expect(handler).toContain("needs_clarification");
  });

  it("records the resolution path on the action", () => {
    expect(handler).toMatch(/resolutionPath: resolution\.path/);
    expect(handler).toMatch(/resolutionDetail: resolution\.detail/);
  });

  it("never calls a Shopify write itself", () => {
    // Writes belong to the platform module — enforced generally by
    // publishContract.test.ts, asserted here too because this is the
    // file most likely to grow a shortcut.
    expect(handler).not.toMatch(/productVariantsBulkUpdate|shopifyMutation/);
    expect(handler).toMatch(/createPublishAction/);
  });

  it("tells the person when the request was already waiting", () => {
    // Asking twice returns the existing action. Silently reporting
    // "sent!" a second time would leave them expecting two approvals.
    expect(handler).toContain("already waiting in Approvals");
  });
});
