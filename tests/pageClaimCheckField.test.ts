// WHAT THE PAGE TOOLS HAND FORWARD ABOUT THEIR OWN CLAIM CHECK — S7/P1.
//
// The executor is the only place that knows a change landed, and these
// tools are the only places that know what the guard did to the copy.
// So the counts ride on the action row, in
// `requested_changes.claimCheck`, and the executor writes the row.
//
// THE DISTINCTION THIS FILE EXISTS FOR, and getting it wrong would make
// S7's demotion rule punish the owner for his own sentences:
//
//   REMOVED            the guard took it out. It never reached anyone.
//                      A high number here is the system WORKING.
//   KEPT, UNSUPPORTED  it went out anyway. Which happens in exactly one
//                      case: the owner wrote it himself, and the tool
//                      keeps his wording and tells him he is the one
//                      standing behind the claim.
//
// Both are "an unsupported claim" to the claim guard. Only the first is
// this product's doing. Migration 217's `owner_words` is the column, and
// these are the tests that make sure the right number lands in it.
//
// A SEPARATE FILE FROM pageMetaTool.test.ts because it mocks
// guardGenerated, and vi.mock is hoisted for the whole file — folding
// it in would silently change what every other test there exercises.

import { describe, it, expect, vi } from "vitest";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

const created: any[] = [];
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/publish/create", () => ({
  createPublishAction: async (_supabase: any, _platform: any, input: any) => {
    created.push(input);
    return { ok: true, actionId: "action-1", approvalId: "approval-1", preview: { summary: "", changes: [], warnings: [] } };
  },
}));

/**
 * A guard that always finds one unsupported claim, and a business that
 * has facts at all.
 *
 * WITHOUT BOTH OF THESE THE BRANCH IS UNREACHABLE. `checkedCopy` returns
 * the value untouched when there are no facts, so with the real
 * businessFacts against an empty fixture the guard never runs and every
 * assertion below would be about a path that was skipped.
 */
const REMOVED = "burns 40% longer than paraffin";
vi.mock("@/lib/claims/claimCheck", async (orig) => ({
  ...(await orig<any>()),
  guardGenerated: (output: any) => ({
    output: { value: "Hand-poured soy candles" },
    removed: [REMOVED],
    priceWarnings: [],
    substantiation: [],
    narrative: [],
    linksFixed: [],
    _given: output,
  }),
}));
import { executeTool } from "@/lib/agents/masterBrainV2";

// FACTS ON THE CONTEXT, which is how the tool gets them: `factsFor`
// returns `ctx.facts` when it has them and only gathers from the
// database otherwise. My first version mocked the gatherer instead and
// every assertion here was about a guard that had been SKIPPED — the
// log said "couldn't gather facts" and the tests failed for the right
// reason by luck.
const CTX: any = {
  id: "d1",
  name: "A Business",
  city: "Srinagar",
  category: "candles",
  team: [],
  toneOfVoice: null,
  facts: { business: { name: "A Business" }, products: [], links: {} },
};
const HOME = { id: "p1", slug: "home", title: "Home" };

function db() {
  return {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: async () => ({ data: [HOME] }),
        maybeSingle: async () => ({
          data:
            table === "websites"
              ? { id: "w1", slug: "a-business", published: true }
              : table === "dealerships"
                ? { id: "d1", dealership_name: "A Business" }
                : null,
        }),
      };
      return chain;
    },
  };
}

async function claimCheckFor(input: Record<string, any>) {
  created.length = 0;
  const result = await executeTool(db(), CTX, "propose_page_meta", { page: "home", ...input }, "");
  return { result, field: created[0]?.requestedChanges?.claimCheck, warnings: created[0]?.requestedChanges?.claimWarnings ?? [] };
}

describe("1. HAWLAI'S OWN WORDING: taken out, and counted as removed", () => {
  it("COUNTS THE REMOVAL AND KEEPS NOTHING UNSUPPORTED", async () => {
    const { field, warnings } = await claimCheckFor({ metaDescription: "Hand-poured soy candles that " + REMOVED });
    expect(field, "no claim check rode on the action").toBeTruthy();
    expect(field.removed).toBe(1);
    expect(field.keptUnsupported).toBe(0);
    // AND THEREFORE NOT THE OWNER'S PROBLEM. owner_words on a row where
    // nothing was kept would excuse a later escape that was ours.
    expect(field.ownerWords).toBe(false);
    // The guard really did run — otherwise this is a test of nothing.
    expect(warnings.join(" ")).toContain(REMOVED);
  });

  it("AND THE TEXT THAT RIDES ALONG IS WHAT GOES LIVE, not what was asked for", async () => {
    // The monitor re-reads this text. If it carried the ORIGINAL
    // wording, the monitor would find the claim the guard had already
    // removed and demote for a sentence nobody published.
    const { field } = await claimCheckFor({ metaDescription: "Hand-poured soy candles that " + REMOVED });
    expect(field.text).toBe("Hand-poured soy candles");
    expect(field.text).not.toContain(REMOVED);
  });
});

describe("2. THE OWNER'S OWN WORDING: kept, unsupported, and counted apart", () => {
  it("KEEPS THE OWNER'S OWN WORDING, AND COUNTS IT APART", async () => {
    // `writtenByOwner` is the owner saying "these are my words".
    // The tool keeps them exactly and warns him. That is an unsupported
    // claim reaching the public — his, not ours — and S7 must not take
    // a permission away for it.
    const { field, warnings } = await claimCheckFor({
      metaDescription: "Hand-poured soy candles that " + REMOVED,
      writtenByOwner: ["metaDescription"],
    });
    expect(field.keptUnsupported).toBe(1);
    expect(field.ownerWords).toBe(true);
    // NOT counted as removed, because nothing was.
    expect(field.removed).toBe(0);
    // And the text is his, whole.
    expect(field.text).toContain(REMOVED);
    expect(warnings.join(" ")).toMatch(/you're the one standing behind that claim/);
  });

  it("and only the fields he claimed are treated as his", async () => {
    // He said the description was his. The title was not, so the
    // guard's removal still counts as a removal.
    const { field } = await claimCheckFor({
      title: "Candles that " + REMOVED,
      metaDescription: "Soy candles that " + REMOVED,
      writtenByOwner: ["metaDescription"],
    });
    expect(field.removed).toBe(1);
    expect(field.keptUnsupported).toBe(1);
    expect(field.ownerWords).toBe(true);
  });
});
