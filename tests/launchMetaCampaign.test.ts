// Launching a Meta campaign from Master Chat.
//
// THE GAP THIS CLOSES: asking Master Chat for an ad campaign produced
// a text plan and "go to the Ads Manager page". Not a wording bug —
// there was no launch tool in the registry at all, and TWO inputs
// explicitly instructed the referral (the generate_ad_plan description
// and a system-prompt line saying "You CANNOT launch real ads").
// Every backend layer built for this — PAUSED-on-create, the budget
// clamp, the account gate, [meta] logging — was reachable only from a
// page.
//
// So the tests here are in two halves: the tool exists and behaves,
// and the instructions that used to send people away no longer do.

import { describe, it, expect, vi } from "vitest";
import { execFileSync } from "child_process";
import { BUSINESS_BRAIN_TOOLS } from "@/lib/businessBrain/toolRegistry";
import { getActionPolicy } from "@/lib/executionPolicy";
import { ALWAYS_REQUIRES_APPROVAL, ACTION_RISK } from "@/lib/publish/types";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "d".repeat(64);

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

describe("the tool is registered and honest about what it does", () => {
  const tool = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "launch_meta_campaign");

  it("exists in the catalog", () => {
    expect(tool).toBeDefined();
  });

  it("is CHAT ONLY", () => {
    // The decision rests on seeing the creative. Read aloud on a call,
    // "approve this ad?" asks about something the person cannot see.
    expect(tool!.channels).toEqual(["chat"]);
  });

  it("says it never launches directly and never sends them to a page", () => {
    const d = tool!.description.toLowerCase();
    expect(d).toContain("never launches it directly");
    expect(d).toMatch(/inline in the chat/);
    expect(d).not.toMatch(/ads manager|paid ads page/);
  });
});

describe("the policy treats it as a real action", () => {
  it("requires approval", () => {
    expect(getActionPolicy("launch_ad_campaign")?.requiresApproval).toBe(true);
  });

  it("is in the always-approve list, so no amount can exempt it", () => {
    expect(ALWAYS_REQUIRES_APPROVAL).toContain("launch_ad_campaign");
  });

  it("is classified high risk — real public objects in the merchant's account", () => {
    expect(ACTION_RISK.launch_ad_campaign).toBe("high");
  });
});

describe("the handler's safety rules, read from the committed source", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const handler = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {'),
    brain.indexOf('case "propose_campaign_budget_change":')
  );

  it("the slice is not empty, so these assertions are not vacuous", () => {
    expect(handler.length).toBeGreaterThan(500);
  });

  it("NEVER calls Meta itself — writes go through the platform module", () => {
    // The same rule publishContract.test.ts enforces for Shopify. A
    // shortcut here would bypass the approval entirely.
    expect(handler).not.toMatch(/metaPost|launchPausedCampaign/);
    expect(handler).toMatch(/createPublishAction/);
  });

  it("checks the connection and the account BEFORE generating anything", () => {
    // A plan and an image are two model calls. Spending them on an
    // account that cannot run ads wastes them and delays the real
    // answer.
    const connIdx = handler.indexOf("isn't connected yet");
    const acctIdx = handler.indexOf("acct.usable");
    const planIdx = handler.indexOf("await makePlan(");
    expect(connIdx).toBeGreaterThan(-1);
    expect(acctIdx).toBeGreaterThan(-1);
    expect(connIdx).toBeLessThan(planIdx);
    expect(acctIdx).toBeLessThan(planIdx);
  });

  it("prefers a budget the person actually stated over the model's guess", () => {
    expect(handler).toMatch(/plan\.daily_budget = statedBudget/);
  });

  it("tells them when the request was already waiting, WITHOUT sending them away", () => {
    expect(handler).toMatch(/already asked for this/i);
    expect(handler).not.toMatch(/ads manager|approvals page|go to \/dashboard/i);
  });
});

describe("the card carries the decision inline", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const card = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {', brain.indexOf("function extractArtifact")),
    brain.indexOf('case "propose_campaign_budget_change":', brain.indexOf("function extractArtifact"))
  );

  it("passes the approval id so Approve/Reject render on the card", () => {
    expect(card).toMatch(/approval: result\.approval_id/);
  });

  it("shows the creative — the picture is most of what is being approved", () => {
    // THIS TEST ASSERTED THE BUG. It required `url: result.image_url`,
    // which is exactly what rendered nothing: a record card ignores
    // `url` unless kind === "link". The test passed for as long as the
    // feature was broken, and only failed once the feature was fixed.
    //
    // A green test over a field the renderer never reads is worse than
    // no test — it is a claim that the picture is covered. The
    // assertion now names the field that actually draws it.
    expect(card).toMatch(/imageUrl: result\.image_url/);
  });

  it("states that nothing runs until activated", () => {
    expect(card).toMatch(/Paused until you activate/i);
  });
});

// ---------------------------------------------------------------
// The two instruction sources that produced the regression.
// ---------------------------------------------------------------
describe("nothing tells the model to send someone to a page for a Meta launch", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");

  it("the generate_ad_plan description points at the tool, not a page", () => {
    const start = brain.indexOf('name: "generate_ad_plan"');
    const desc = brain.slice(start, brain.indexOf("input_schema", start));
    expect(desc).toContain("launch_meta_campaign");
    // It may still NAME Ads Manager in order to forbid it; what it must
    // not do is instruct the referral.
    expect(desc).not.toMatch(/tell the person to use the Ads Manager/i);
  });

  it("the system prompt no longer claims ads cannot be launched", () => {
    const prompt = brain.slice(brain.indexOf("const systemPrompt = "));
    expect(prompt).not.toMatch(/You CANNOT launch real ads/);
    expect(prompt).toMatch(/You CAN launch Meta/);
    expect(prompt).toMatch(/launch_meta_campaign/);
  });

  it("the system prompt is still honest about the platforms that CANNOT launch", () => {
    // Google, LinkedIn, Pinterest and Snapchat genuinely have only
    // planning tools. Fixing the Meta claim must not overcorrect into
    // implying every platform can launch — that would produce the
    // opposite failure, promising something no tool can do.
    const prompt = brain.slice(brain.indexOf("const systemPrompt = "));
    expect(prompt).toMatch(/Google, LinkedIn, Pinterest,? (and )?Snapchat/);
    expect(prompt).toMatch(/cannot launch it yet/i);
  });
});

// ---------------------------------------------------------------
// The platform module.
// ---------------------------------------------------------------
describe("the Meta platform module", () => {
  const DRAFT = {
    id: "draft-1",
    dealership_id: "d1",
    status: "draft",
    plan_json: { headline: "Diwali Sale", body: "Limited time", daily_budget: 500, targeting_city: "Lucknow" },
    generated_image_url: "https://cdn/ad.png",
  };
  const CONN = {
    business_category: "candles",
    fb_page_id: "page_1",
    fb_lead_form_id: "form_1",
    fb_ad_account_id: "act_999",
    fb_page_access_token: "TOKEN",
    fb_page_access_token_encrypted: null,
    fb_min_daily_budget: 9491,
    fb_currency: "INR",
    fb_account_status: 1,
    fb_limits_checked_at: new Date().toISOString(),
  };

  function db(conn: any = CONN, draft: any = DRAFT) {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: table === "ad_creatives" ? draft : conn }) }),
            maybeSingle: async () => ({ data: table === "ad_creatives" ? draft : conn }),
          }),
        }),
        update: () => ({ eq: async () => ({ data: null }) }),
      }),
    };
  }

  async function platform(conn?: any, draft?: any) {
    const { createMetaPlatform } = await import("@/lib/publish/platforms/meta");
    return createMetaPlatform({ supabase: db(conn, draft) as any });
  }

  const action = {
    id: "act-1", dealershipId: "d1", platform: "meta" as const, connectionRef: null,
    actionKey: "launch_ad_campaign" as const, targetRef: "draft-1", targetLabel: "Diwali Sale",
    requestedChanges: {}, preview: null, previewedAt: null, status: "draft" as const, idempotencyKey: "k",
  };

  // Pinned as an exact list so adding a Meta action is a deliberate
  // change here, not something that slips in. Activation was added so
  // chat can start a campaign through the approval spine.
  it("supports exactly launch and activation", async () => {
    expect((await platform()).supports).toEqual(["launch_ad_campaign", "activate_ad_campaign"]);
  });

  it("preview describes the campaign and NEVER calls Meta to create anything", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);

    const r = await (await platform()).preview(action);
    expect(r.ok).toBe(true);
    // The limits are cached and fresh, so nothing should go out.
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("preview says plainly that nothing spends yet", async () => {
    const r = await (await platform()).preview(action);
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/Nothing spends yet/i);
  });

  it("preview warns when the budget was raised to the account minimum", async () => {
    const cheap = { ...DRAFT, plan_json: { ...DRAFT.plan_json, daily_budget: 50 } };
    const r = await (await platform(CONN, cheap)).preview(action);
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/minimum.*raised/i);
  });

  it("preview refuses a disabled ad account", async () => {
    const r = await (await platform({ ...CONN, fb_account_status: 2 })).preview(action);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/disabled/i);
  });

  it("preview refuses when Facebook is not connected", async () => {
    const r = await (await platform({ ...CONN, fb_page_access_token: null, fb_page_access_token_encrypted: null })).preview(action);
    expect(r.ok).toBe(false);
  });

  it("preview refuses an incomplete draft rather than previewing a blank ad", async () => {
    const r = await (await platform(CONN, { ...DRAFT, generated_image_url: null })).preview(action);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/incomplete/i);
  });

  it("every change has a null before-value, because this creates", async () => {
    const r = await (await platform()).preview(action);
    expect(r.ok && r.preview.changes.every((c) => c.before === null)).toBe(true);
  });

  it("execute does NOT relaunch a draft that already went live", async () => {
    // The idempotency hazard for a create: not a stale before-value,
    // but the same approved draft being launched twice.
    const launched = { ...DRAFT, status: "launched", meta_ad_id: "ad_1", meta_campaign_id: "camp_1" };
    const r = await (await platform(CONN, launched)).execute(action);
    expect(r.ok).toBe(true);
    expect(r.ok && (r.platformResponse as any).already).toBe(true);
  });

  it("execute re-checks the account status at execution time", async () => {
    // An account can be disabled between approval and execution.
    const r = await (await platform({ ...CONN, fb_account_status: 2 })).execute(action);
    expect(r.ok).toBe(false);
  });
});

describe("execute uses the approved creative, never a fresh one", () => {
  it("the module never regenerates the plan or the image", async () => {
    // THE LOAD-BEARING PROPERTY. A regenerated creative means the ad
    // that runs is not the ad that was approved — the same class of
    // failure the price path's before-value re-verification prevents.
    const source = committed("src/lib/publish/platforms/meta.ts");
    const execute = source.slice(source.indexOf("async execute("));
    expect(execute).not.toMatch(/generateAdPlan|buildCreativeWithoutPhoto|generateAdImageFromDescription/);
    expect(execute).toMatch(/draft\.generated_image_url/);
    expect(execute).toMatch(/plan: draft\.plan_json/);
  });
});

// ---------------------------------------------------------------
// The creative's source photo (the real gap found in live testing).
//
// A generated backdrop is a fallback, not the product. An ad running
// with a generic image instead of the real thing performs worse and
// misrepresents what is being sold — so the real photo is tried first,
// and when it can't be used the card says so in words rather than
// leaving the merchant to notice.
// ---------------------------------------------------------------
describe("the real product photo comes first", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const handler = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {'),
    brain.indexOf('case "propose_campaign_budget_change":')
  );

  it("reuses the price path's resolver rather than a second one", () => {
    // interpretCandidates never guesses. A bespoke matcher here would
    // be a second resolution rule with its own opinion about ties —
    // and the losing side of that tie is which product gets advertised.
    expect(handler).toMatch(/interpretCandidates: interpret/);
    expect(handler).toMatch(/searchShopifyVariants/);
  });

  it("validates a supplied variant_id against what the search returned", () => {
    // Same hazard as the price path: a hallucinated id, or a real id
    // for the wrong product, would put someone else's photo in the ad.
    expect(handler).toMatch(/found\.candidates\.find/);
    expect(handler).toMatch(/doesn't match anything I found/);
  });

  it("ASKS when the phrase is ambiguous instead of picking one", () => {
    expect(handler).toMatch(/needs_clarification: true/);
    expect(handler).toMatch(/Which product's photo should I use/);
  });

  it("ASKS when no product was named at all", () => {
    // Which product this advertises decides the picture. Guessing it is
    // exactly the silent choice that ends up on a live ad.
    expect(handler).toMatch(/needs_product: true/);
  });

  it("searches BOTH catalogues, not just Shopify", () => {
    // The gap found live: photo resolution searched Shopify only, so a
    // business using Hawlai's own shop — the default state of a new
    // account — had a real catalogue the ad path could not see.
    expect(handler).toMatch(/searchAllProductSources/);
  });

  it("falls back ONLY for honest reasons", () => {
    // The product has no photo, nothing matched, the catalogue could
    // not be read, or they asked for a generated image. Never as a
    // shortcut around asking.
    expect(handler).toMatch(/has no photo on its listing/);
    expect(handler).toMatch(/You asked for a generated image/);
    expect(handler).toMatch(/Couldn't read your product list/);
  });

  it("records WHICH catalogue answered", () => {
    // "No photo found" and "no photo found in the store we searched"
    // are different diagnoses, and only one of them is actionable.
    expect(handler).toMatch(/source: found\.source/);
    expect(handler).toMatch(/found\.source === "shopify" \? "shopify_product" : "hawlai_product"/);
  });

  it("does not silently fall back when the product simply wasn't found", () => {
    // not_found means the phrase matched nothing — the merchant should
    // see that sentence, not an unexplained generated image.
    // Asserts the MEANING, not the phrasing. The wording moved from
    // "in your store" to "in your products" when a second catalogue was
    // added -- "your store" had quietly meant Shopify. Pinning the old
    // string would have made a correct improvement look like a
    // regression, which is the third time that trap has come up here.
    expect(handler).toMatch(/I couldn't find \$\{productPhrase\}|I couldn't find "\$\{productPhrase\}"/);
  });

  it("builds from the real photo WITHOUT regenerating it", () => {
    // THIS TEST ASSERTED THE BUG — the second in this file to do so.
    // It required buildFinalCreative("ai_generate"), which is exactly
    // the call that sent the photo to Gemini and got back a different
    // product. The comment even repeated the vendor's claim that the
    // product is kept unchanged, which the live output disproved.
    //
    // Both times the shape was the same: an assertion written from what
    // the code did rather than from what the feature owes the user. A
    // test that pins the implementation cannot notice the
    // implementation is wrong.
    expect(handler).toMatch(/buildCreativeFromPhoto/);
    expect(handler).toMatch(/buildCreativeWithoutPhoto/);
  });

  it("carries the photo source out to the card", () => {
    expect(handler).toMatch(/photo_source: photoSource/);
    expect(handler).toMatch(/photo_product: photoProduct/);
  });
});

describe("the card says which photo it is", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const card = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {', brain.indexOf("function extractArtifact")),
    brain.indexOf('case "propose_campaign_budget_change":', brain.indexOf("function extractArtifact"))
  );

  it("names the listing when a real photo was used", () => {
    expect(card).toMatch(/Using the real photo from your/);
    expect(card).toMatch(/result\.photo_product/);
  });

  it("says plainly when the image was generated, and why", () => {
    // "AI-generated image" alone invites the merchant to wonder what
    // went wrong. The reason is what makes it actionable — "add a photo
    // to that listing" is something they can go and do.
    expect(card).toMatch(/AI-generated image/);
    expect(card).toMatch(/result\.photo_reason/);
  });

  it("numbers the product candidates, matching the numbered list in the reply", () => {
    expect(card).toMatch(/\$\{i \+ 1\}\./);
  });

  it("flags candidates that have no photo, so a useless pick is visible first", () => {
    expect(card).toMatch(/no photo on this listing/);
  });
});

// ---------------------------------------------------------------
// The preview must never claim a picture it cannot show.
// ---------------------------------------------------------------
describe("the creative is verified, not assumed", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const handler = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {'),
    brain.indexOf('case "propose_campaign_budget_change":')
  );

  it("checks the storage upload's error instead of ignoring it", () => {
    // Supabase's storage client returns { data, error } and does NOT
    // throw. Unchecked, a failed upload fell through to getPublicUrl,
    // which returns a well-formed URL for an object that was never
    // written — so the card carried an imageUrl, the text said "real
    // product photo used", and the <img> 404'd into nothing.
    expect(handler).toMatch(/const \{ error: uploadError \}/);
    expect(handler).toMatch(/if \(uploadError\) throw/);
  });

  it("VERIFIES the saved image is actually readable", () => {
    // "The upload reported success" is not "the browser can load it".
    // This is the same request the card will make.
    expect(handler).toMatch(/method: "HEAD"/);
    expect(handler).toMatch(/isn't readable/);
  });

  it("logs whether the creative was produced and verified", () => {
    // So the next time a picture is missing, the log says whether one
    // was ever made — rather than leaving it to be inferred from a
    // blank space in a card.
    expect(handler).toMatch(/mlog\("chat\.creative"/);
    expect(handler).toMatch(/image_verified: true/);
  });
});

describe("the card is honest when there is no image", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const card = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {', brain.indexOf("function extractArtifact")),
    brain.indexOf('case "propose_campaign_budget_change":', brain.indexOf("function extractArtifact"))
  );

  it("does NOT claim a real photo when no image url reached the card", () => {
    // Claiming a real photo beside a blank space is worse than saying
    // nothing: it invites approval of something unseen, which is the
    // one thing the preview step exists to prevent.
    expect(card).toMatch(/!result\.image_url/);
    expect(card).toMatch(/don't approve this until you can see it/i);
  });
});

// ---------------------------------------------------------------
// The creative IS the product photo, not a picture inspired by it.
// ---------------------------------------------------------------
describe("a real product photo is used, not regenerated", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const handler = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {'),
    brain.indexOf('case "propose_campaign_budget_change":')
  );

  it("does NOT send the product photo through the AI image generator", () => {
    // THE BUG. ai_generate sends the photo to Gemini with "keep the
    // product unchanged, only change the background" — a request, not
    // a guarantee. A real photo of pink candles on pink satin came
    // back as candles on a wooden tray against a beige couch:
    // recognisably the same category of thing, not the same product.
    // The card then showed something the merchant does not sell while
    // correctly stating the real photo had been used.
    expect(handler).not.toMatch(/buildFinalCreative\("ai_generate"/);
    expect(handler).toMatch(/buildCreativeFromPhoto\(photoBuf, plan\)/);
  });

  it("still generates an image when there is NO product photo", () => {
    // The fallback is untouched — a generated backdrop is right when
    // there is genuinely nothing to show.
    expect(handler).toMatch(/buildCreativeWithoutPhoto\(plan/);
  });

  it("logs the source photo beside the creative built from it", () => {
    // So a future divergence between what was resolved and what
    // reached the card is one log line rather than a trace.
    expect(handler).toMatch(/product_photo: productPhotoUrl/);
    expect(handler).toMatch(/ai_generated: !productPhotoUrl/);
  });
});

describe("buildCreativeFromPhoto keeps the photo intact", () => {
  const engine = committed("src/lib/adEngine.ts");
  const fn = engine.slice(
    engine.indexOf("export async function buildCreativeFromPhoto"),
    engine.indexOf("export async function buildFinalCreativeImage")
  );

  it("calls no image generator at all", () => {
    expect(fn).not.toMatch(/generateAIImage|generateAdImageFromDescription|gemini|generativelanguage/i);
  });

  it("composites the copy over the merchant's own pixels", () => {
    expect(fn).toMatch(/sharp\(photoBuffer\)/);
    expect(fn).toMatch(/buildTextOverlaySvg/);
  });
});

describe("a photo that cannot be used degrades instead of failing", () => {
  const brain = committed("src/lib/agents/masterBrainV2.ts");
  const handler = brain.slice(
    brain.indexOf('case "launch_meta_campaign": {'),
    brain.indexOf('case "propose_campaign_budget_change":')
  );

  it("falls back to a generated image rather than erroring the whole action", () => {
    expect(handler).toMatch(/chat\.photo_unusable/);
    expect(handler).toMatch(/photoSource = "ai_generated"/);
  });

  it("stops claiming the real photo once it stops using it", () => {
    expect(handler).toMatch(/productPhotoUrl = null/);
    expect(handler).toMatch(/couldn't use your product photo/);
  });

  it("a genuinely fatal error names its cause", () => {
    // "Couldn't generate the picture" with no reason is the exact shape
    // this run has been spent removing from other paths.
    expect(handler).toMatch(/couldn't produce the image: \$\{err\?\.message/);
  });
});
