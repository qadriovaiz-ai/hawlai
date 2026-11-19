// The Instagram account an ad runs under — 19 November 2026.
//
// `instagram_actor_id` was DEPRECATED in Marketing API v22.0 and
// replaced by `instagram_user_id`. This codebase is on v23.0, so the
// old name is not discouraged, it is gone — and Meta's error reference
// says sending BOTH is an error, so this is one correct name and never
// a pair.
//
// Neither name had ever appeared in this repository. There was nothing
// to migrate: ads have simply been running Facebook-only by omission.
//
// THE RULE THAT SHAPES EVERYTHING HERE: an absent or refused Instagram
// account must never stop an ad. Most small businesses have a Page and
// no connected professional account, and that has to stay a perfectly
// good way to advertise. An optional identity that can fail a launch is
// worse than no identity at all — it turns a working product into a
// broken one for the businesses least able to diagnose it.
//
// AND IT IS PROVEN BEFORE IT IS USED. Commit 5 validates the campaign,
// the ad set and the ad; the CREATIVE is created before all three and
// was never validated at all. Adding an untested field to an
// unvalidated real POST is how a launch flow breaks for everybody at
// once, so the creative is dry-run first.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  readInstagramIdentity,
  withInstagramIdentity,
  placementNote,
} from "@/lib/ads/instagramIdentity";
import { code } from "./helpers/source";

const LAUNCH = "src/lib/ads/launchCampaign.ts";

const spec = (): { name: string; object_story_spec: Record<string, any> } => ({
  name: "Diwali - Creative",
  object_story_spec: { page_id: "P1", link_data: { name: "Diwali" } },
});

function graphReturns(status: number, body: Record<string, any>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as any);
}

afterEach(() => vi.restoreAllMocks());

describe("1. THE FIELD NAME, WHICH IS THE WHOLE POINT", () => {
  it("THE LOAD-BEARING ONE: it is instagram_user_id", () => {
    const out = withInstagramIdentity(spec(), { id: "17841400000", username: "candle_by_qaaf" });
    expect(out.object_story_spec.instagram_user_id).toBe("17841400000");
  });

  it("AND instagram_actor_id APPEARS NOWHERE AT ALL", () => {
    // Deprecated at v22.0, and sending both is an error. One name, in
    // one place, so a future rename has one line to change.
    for (const f of ["src/lib/ads/instagramIdentity.ts", LAUNCH, "src/lib/ads/metaTargeting.ts"]) {
      expect(code(f), f).not.toMatch(/instagram_actor_id/);
    }
  });

  it("IT RIDES ON object_story_spec, beside the page it partners", () => {
    const out = withInstagramIdentity(spec(), { id: "1", username: null });
    expect(out.object_story_spec.page_id).toBe("P1");
    expect(out.object_story_spec.link_data).toEqual({ name: "Diwali" });
  });

  it("NO IDENTITY LEAVES THE SPEC EXACTLY AS IT WAS", () => {
    const original = spec();
    const out = withInstagramIdentity(original, null);
    expect(out).toBe(original);
    expect(JSON.stringify(out)).not.toMatch(/instagram/);
  });
});

describe("2. READING IT, AND EVERY WAY THAT CAN FAIL", () => {
  it("a connected professional account comes back with its handle", async () => {
    graphReturns(200, { instagram_business_account: { id: "17841400000", username: "candle_by_qaaf" } });
    expect(await readInstagramIdentity("P1", "T")).toEqual({ id: "17841400000", username: "candle_by_qaaf" });
  });

  it("THE LOAD-BEARING ONE: no account connected is null, never an error", async () => {
    // The ordinary answer for most small businesses.
    graphReturns(200, { id: "P1" });
    expect(await readInstagramIdentity("P1", "T")).toBeNull();
  });

  it("A TOKEN THAT CANNOT SEE IT IS ALSO null", async () => {
    // Not distinguishable from "none connected" in a way the owner
    // could act on, and not worth stopping a launch for either way.
    graphReturns(400, { error: { message: "(#200) Missing permission", code: 200 } });
    expect(await readInstagramIdentity("P1", "T")).toBeNull();
  });

  it("AND SO IS META BEING UNREACHABLE", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await readInstagramIdentity("P1", "T")).toBeNull();
  });

  it("an account with no username still works", async () => {
    graphReturns(200, { instagram_business_account: { id: "999" } });
    expect(await readInstagramIdentity("P1", "T")).toEqual({ id: "999", username: null });
  });
});

describe("3. THE OWNER IS TOLD EITHER WAY", () => {
  it("WITH INSTAGRAM, IT NAMES THE HANDLE", () => {
    const note = placementNote({ id: "1", username: "candle_by_qaaf" });
    expect(note).toMatch(/Facebook and on Instagram/);
    expect(note).toMatch(/@candle_by_qaaf/);
  });

  it("WITHOUT ONE, IT SAYS SO AND SAYS HOW TO FIX IT", () => {
    // Silence is what leaves an owner unable to tell a missing feature
    // from a broken one.
    const note = placementNote(null);
    expect(note).toMatch(/Facebook only/);
    expect(note).toMatch(/connect an Instagram professional account/i);
  });

  it("A REFUSED ACCOUNT IS ITS OWN SENTENCE, and not an alarm", () => {
    // The ad ran perfectly well. It is not a problem report.
    const note = placementNote(null, "refused");
    expect(note).toMatch(/Facebook only/);
    expect(note).toMatch(/the ad itself is unaffected/i);
    expect(note).not.toBe(placementNote(null));
  });

  it("AND IT REACHES BOTH LAUNCH PATHS", () => {
    expect(code("src/app/api/ads/adlaunch/route.ts")).toMatch(/placement: launched\.placement/);
    expect(code("src/lib/publish/platforms/meta.ts")).toMatch(/placement: launched\.placement/);
  });
});

describe("4. PROVEN BEFORE IT IS USED, AND NEVER AT THE AD'S EXPENSE", () => {
  const src = () => code(LAUNCH);

  it("THE LOAD-BEARING ONE: the creative is dry-run BEFORE it is created", () => {
    // Commit 5 validated the campaign, ad set and ad. The creative was
    // created before all three and never validated — adding an untested
    // field to an unvalidated real POST is how this breaks for everyone
    // at once.
    const s = src();
    const check = s.indexOf('dryRun(`${adAccount}/adcreatives`');
    const create = s.indexOf("const creativeRes = await metaPost(");
    expect(check).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(check);
  });

  it("IT VALIDATES THE EXACT SPEC IT THEN SENDS", () => {
    // A dry run on a different body reports a pass for something never
    // checked — worse than no dry run at all.
    const s = src();
    expect(s).toMatch(/const creativeCheck = await dryRun\(`\$\{adAccount\}\/adcreatives`, creativeSpec, pageAccessToken/);
    expect(s).toMatch(/metaPost\(`\$\{adAccount\}\/adcreatives`, creativeSpec, pageAccessToken\)/);
  });

  it("A REFUSAL RETRIES WITHOUT INSTAGRAM, rather than guessing from the error text", () => {
    // The same spec minus one field is a clean experiment, and still
    // creates nothing.
    const s = src();
    const at = s.indexOf("const withoutIg = instagram");
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(at, at + 300)).toMatch(/dryRun\(`\$\{adAccount\}\/adcreatives`, baseCreative/);
  });

  it("AND IF THAT PASSES, THE AD GOES OUT FACEBOOK-ONLY", () => {
    const s = src();
    const at = s.indexOf("if (withoutIg.ok && instagram) {");
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at, at + 300);
    expect(block).toMatch(/creativeSpec = baseCreative/);
    expect(block).toMatch(/placementNote\(null, "refused"\)/);
    expect(block).toMatch(/launch\.instagram_dropped/);
  });

  it("A REFUSAL WITH NO INSTAGRAM ATTACHED IS A REAL REFUSAL", () => {
    // The fallback must not swallow a creative Meta rejected for its
    // own reasons — the launch would then proceed on a spec Meta said
    // no to.
    //
    // ASSERTED AS A COUNT, NOT A PRESENCE. The first version had two
    // throws for this one idea and this test matched either, so
    // deleting the no-Instagram branch passed. The code now has ONE
    // exit, and a second would mean a second path out of a refusal.
    const s = src();
    const throws = s.match(/throw new Error\(dryRunMessage\(creativeCheck, "ad creative"\)/g) ?? [];
    expect(throws).toHaveLength(1);
    // And the fallback is only reachable WITH an identity to drop.
    expect(s).toMatch(/if \(withoutIg\.ok && instagram\) \{/);
    expect(s).toMatch(/: \{ ok: false, inconclusive: false, reason: null \};/);
  });

  it("AN INCONCLUSIVE CHECK DOES NOT STOP THE LAUNCH", () => {
    expect(src()).toContain("if (!creativeCheck.ok && !creativeCheck.inconclusive) {");
  });
});

describe("5. NOTHING EXISTING IS TOUCHED", () => {
  it("THE CHANGE LIVES ONLY IN THE LAUNCH PATH", () => {
    // The founder's rule: his running campaign must not be edited. This
    // only ever builds a NEW creative, and nothing here updates, edits
    // or backfills an existing ad.
    const src = code("src/lib/ads/instagramIdentity.ts");
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/supabase/);
    // metaRead is a GET. The module makes no POST of its own.
    expect(src).not.toMatch(/metaPost|metaWriteIdempotent/);
  });

  it("AND IT NEEDS NO MIGRATION — the id is read from Meta each launch", () => {
    const src = code("src/lib/ads/instagramIdentity.ts");
    expect(src).toMatch(/readInstagramIdentity/);
    expect(src).not.toMatch(/instagram_user_id:\s*row|from\("dealerships"\)/);
  });
});
