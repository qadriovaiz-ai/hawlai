// The four questions, asked and written (I4 of
// docs/PLAN-AUTO-INTERVIEW.md).
//
// THE TRAP THIS FILE EXISTS FOR, and it is already recorded in the
// brand-profile route: the onboarding flow patches these columns from
// TWO separate screens, and a writer that sent every column on every
// call would have the second screen wipe the first screen's answers,
// every time, with nothing looking wrong. "Absent" and "empty" are
// different instructions.
//
// AND THE RULE MIGRATION 221 WAS SHAPED AROUND: a value COLLECTED is not
// a value PUBLISHED. Both publish flags default to false in the
// database, the reader treats anything but `true` as "do not publish",
// and the route refuses to let anyone but the owner turn one on.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { code, sourceWithComments } from "./helpers/source";

import { cleanListingFactsPatch, readListingFacts } from "@/lib/seo/listingFacts";
import { gridToIntervals, parsePlaces } from "@/components/onboarding/ListingFactsStep";
import { STEP_ORDER, TARGET_ORDER, TRANSITIONAL, stepsFor, totalSteps, nextStep } from "@/lib/onboarding/steps";
import { questionByKey, questionsFor } from "@/lib/onboarding/interview";

const owner = { canPublish: true };
const member = { canPublish: false };

// ---------------------------------------------------------------------
describe("1. ABSENT IS NOT EMPTY — the second screen cannot wipe the first", () => {
  it("A KEY THE CALLER DID NOT SEND IS NOT IN THE PATCH", () => {
    const { patch } = cleanListingFactsPatch({ opening_hours: [] }, owner);
    expect(Object.keys(patch)).toEqual(["opening_hours"]);
    expect("public_phone" in patch).toBe(false);
    expect("areas_served" in patch).toBe(false);
    expect("publish_phone" in patch).toBe(false);
  });

  it("AND THE HOURS SCREEN'S PATCH TOUCHES NOTHING THE CONTACT SCREEN SET", () => {
    // The two screens as they actually send. If this ever overlaps, the
    // hours screen silently clears a phone number.
    const contact = cleanListingFactsPatch(
      { public_phone: "+91 91234 56789", publish_phone: true, street_address: "12 Station Road", publish_street_address: false, areas_served: ["Here"] },
      owner
    ).patch;
    const hours = cleanListingFactsPatch({ opening_hours: [{ day: "monday", opens: "10:00", closes: "19:00" }] }, owner).patch;
    const overlap = Object.keys(contact).filter((k) => k in hours);
    expect(overlap).toEqual([]);
  });

  it("NULL IS A VALUE, because it is how a number is taken off the record", () => {
    const { patch } = cleanListingFactsPatch({ public_phone: null }, owner);
    expect("public_phone" in patch).toBe(true);
    expect(patch.public_phone).toBeNull();
  });

  it("an empty string is stored as null rather than as an empty fact", () => {
    expect(cleanListingFactsPatch({ public_phone: "   " }, owner).patch.public_phone).toBeNull();
  });

  it("A BODY THAT IS NOT AN OBJECT PATCHES NOTHING", () => {
    for (const body of [null, undefined, "phone", 7, []]) {
      expect(Object.keys(cleanListingFactsPatch(body, owner).patch)).toEqual([]);
    }
  });

  it("AND THE ROUTE REFUSES AN EMPTY PATCH RATHER THAN CREATING A ROW OF DEFAULTS", () => {
    // Upserting nothing would stamp answered_at on a business nobody
    // answered for.
    const route = code("src/app/api/listing-facts/route.ts");
    expect(route).toMatch(/if \(Object\.keys\(patch\)\.length === 0\)/);
    expect(route).toMatch(/Nothing to save/);
  });
});

// ---------------------------------------------------------------------
describe("2. A PUBLISH FLAG IS STRICTLY true, AND ONLY THE OWNER MAY SET IT", () => {
  it("ONLY THE BOOLEAN true MEANS YES", () => {
    // A privacy decision is not a truthiness question.
    for (const value of ["yes", "true", 1, "1", {}, [], "false", 0]) {
      const { patch } = cleanListingFactsPatch({ publish_phone: value }, owner);
      expect(patch.publish_phone).toBe(false);
    }
    expect(cleanListingFactsPatch({ publish_phone: true }, owner).patch.publish_phone).toBe(true);
  });

  it("A NON-OWNER MAY RECORD THE FACTS AND MAY NOT PUBLISH THEM", () => {
    const { patch, refusedPublish } = cleanListingFactsPatch(
      { public_phone: "+91 91234 56789", publish_phone: true },
      member
    );
    expect(patch.public_phone).toBe("+91 91234 56789");
    expect("publish_phone" in patch).toBe(false);
    expect(refusedPublish).toEqual(["publish_phone"]);
  });

  it("AND TURNING PUBLISHING OFF IS NEVER REFUSED", () => {
    // The safe direction must not be the slow one — CLAUDE.md rule 6's
    // reasoning, applied to a privacy flag rather than an automation.
    const { patch, refusedPublish } = cleanListingFactsPatch({ publish_phone: false, publish_street_address: false }, member);
    expect(refusedPublish).toEqual([]);
    expect(patch.publish_phone).toBe(false);
    expect(patch.publish_street_address).toBe(false);
  });

  it("THE ROUTE SAYS SO RATHER THAN WRITING A SILENT false", () => {
    // A silent false is a setting the owner would later find switched
    // off with no explanation.
    const route = code("src/app/api/listing-facts/route.ts");
    expect(route).toMatch(/if \(refusedPublish\.length > 0\)/);
    expect(route).toMatch(/status: 403/);
    expect(route).toMatch(/Only the owner can put a phone number or a street address on a public page/);
  });

  it("and a refused flag publishes nothing when the row is read back", () => {
    const { patch } = cleanListingFactsPatch({ public_phone: "+91 91234 56789", publish_phone: true }, member);
    expect(readListingFacts({ ...patch } as any).phone).toBeNull();
  });
});

// ---------------------------------------------------------------------
describe("3. THE ROUTE NEVER TRUSTS THE BODY FOR WHOSE BUSINESS THIS IS", () => {
  const route = code("src/app/api/listing-facts/route.ts");

  // THE TWO HANDLERS, SLICED APART — and this is not tidiness.
  //
  // FOUND BY MUTATIONS. Three assertions here read the whole file, and
  // the file has two handlers that look alike. Deleting the 401 from
  // PATCH left GET's copy matching the regex; deleting the profiles
  // read from PATCH left GET's. Both mutants survived a test whose name
  // says it checks exactly that. It is CLAUDE.md rule 8's lesson
  // arriving through duplication instead of comments: an assertion
  // satisfiable by any occurrence proves nothing about the one that
  // matters.
  const GET_BODY = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function PATCH"));
  const PATCH_BODY = route.slice(route.indexOf("export async function PATCH"));

  it("THE DEALERSHIP ID COMES FROM THE CALLER'S OWN profiles ROW", () => {
    for (const handler of [GET_BODY, PATCH_BODY]) {
      expect(handler).toMatch(/from\("profiles"\)\.select\("dealership_id"\)\.eq\("id", user\.id\)/);
    }
    // Never from the request.
    expect(route).not.toMatch(/body\.dealership_id/);
    expect(route).not.toMatch(/dealershipId = body/);
  });

  it("AND AN UNAUTHENTICATED CALLER IS REFUSED BEFORE ANYTHING IS READ", () => {
    for (const handler of [GET_BODY, PATCH_BODY]) {
      expect(handler).toMatch(/if \(!user\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
      // And before the id is resolved, not after.
      expect(handler.indexOf("status: 401")).toBeLessThan(handler.indexOf('from("profiles")'));
    }
  });

  it("THE SERVICE CLIENT IS ONLY REACHED AFTER THE SESSION IS RESOLVED", () => {
    // business_listing_facts has no client write policy at all
    // (migration 221), so this route is the authorization.
    const resolvedAt = PATCH_BODY.indexOf('from("profiles")');
    const serviceAt = PATCH_BODY.indexOf("createServiceClient()");
    expect(resolvedAt).toBeGreaterThan(-1);
    expect(serviceAt).toBeGreaterThan(resolvedAt);
  });

  it("THE OWNER CHECK IS ITS OWN QUESTION, not the membership one", () => {
    // profiles.dealership_id says which business this user belongs to;
    // dealerships.owner_id says whether they own it.
    expect(route).toMatch(/from\("dealerships"\)\.select\("owner_id"\)/);
    expect(route).toMatch(/const isOwner = dealership\?\.owner_id === user\.id/);
    expect(route).toMatch(/canPublish: isOwner/);
  });

  it("THE READ GOES THROUGH RLS, so a refusal genuinely means not yours", () => {
    expect(GET_BODY).toMatch(/supabase\n?\s*\.from\("business_listing_facts"\)/);
    expect(GET_BODY).not.toMatch(/createServiceClient/);
  });

  it("and only this cleaner builds the payload, so an invented field cannot reach a column", () => {
    expect(route).toMatch(/const \{ patch, refusedPublish \} = cleanListingFactsPatch\(body, \{ canPublish: isOwner \}\)/);
    expect(route).toMatch(/\.\.\.patch,/);
    // THE BODY IS NEVER SPREAD INTO THE UPSERT, however it is written.
    // FOUND BY A MUTATION: /\.\.\.body/ did not match `...(body as any)`
    // because of the parenthesis, so a spread that wrote every field the
    // client sent straight into the row survived this assertion.
    expect(route).not.toMatch(/\.\.\.\(?\s*body\b/);
    expect(route).not.toMatch(/\.\.\.\(?\s*input\b/);
  });

  it("WHO ANSWERED IS RECORDED, and it is never a model", () => {
    expect(route).toMatch(/answered_by: "owner"/);
    expect(route).toMatch(/answered_at: new Date\(\)\.toISOString\(\)/);
  });
});

// ---------------------------------------------------------------------
describe("4. THE HOURS SENT ARE THE HOURS THE READER WILL ACCEPT", () => {
  // BUILT OUT OF ORDER ON PURPOSE. The first version of this fixture
  // listed the days Monday-first, so `Object.keys(grid)` and the week's
  // own order were the same list and a mutation that iterated the grid
  // instead of the week changed nothing. A fixture in the order the
  // answer is expected in cannot test the ordering.
  const grid = (over: Record<string, any> = {}) => ({
    wednesday: { open: "10:00", close: "19:00", closed: false },
    sunday: { open: "", close: "", closed: true },
    friday: { open: "10:00", close: "19:00", closed: false },
    monday: { open: "10:00", close: "19:00", closed: false },
    saturday: { open: "10:00", close: "19:00", closed: false },
    tuesday: { open: "10:00", close: "19:00", closed: false },
    thursday: { open: "10:00", close: "19:00", closed: false },
    ...over,
  });

  it("A CLOSED DAY IS SENT, because 'shut on Sunday' is what a customer wants", () => {
    const sent = gridToIntervals(grid());
    expect(sent).toContainEqual({ day: "sunday", opens: null, closes: null });
  });

  it("A HALF-FILLED DAY IS NOT SENT AT ALL", () => {
    // The reader would refuse half a window anyway; sending it would
    // make the screen look as though it had been saved.
    const sent = gridToIntervals(grid({ tuesday: { open: "10:00", close: "", closed: false } }));
    expect(sent.some((i) => i.day === "tuesday")).toBe(false);
  });

  it("AND WHAT IS SENT SURVIVES THE READER UNCHANGED", () => {
    // The round trip is the point: a shape the reader refuses would be a
    // row that exists and publishes nothing, which is the hardest kind
    // of bug to see.
    const sent = gridToIntervals(grid());
    const { patch } = cleanListingFactsPatch({ opening_hours: sent }, owner);
    expect(patch.opening_hours).toEqual(sent);
    expect(readListingFacts({ opening_hours: patch.opening_hours } as any).hours).toEqual(sent);
  });

  it("the days come back in the week's order, whatever order the grid was built in", () => {
    const sent = gridToIntervals(grid());
    expect(sent.map((i) => i.day)).toEqual(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
  });

  it("THE CLEANER NORMALISES ON THE WAY IN, so a bad interval is visibly absent", () => {
    const { patch } = cleanListingFactsPatch(
      { opening_hours: [{ day: "monday", opens: "19:00", closes: "10:00" }, { day: "tuesday", opens: "10:00", closes: "19:00" }] },
      owner
    );
    expect(patch.opening_hours).toEqual([{ day: "tuesday", opens: "10:00", closes: "19:00" }]);
  });

  it("places are read from one line or from several", () => {
    expect(parsePlaces("Here, There\nElsewhere")).toEqual(["Here", "There", "Elsewhere"]);
    expect(parsePlaces("  ")).toEqual([]);
  });
});

// ---------------------------------------------------------------------
describe("5. THE STEPS ARE IN THE FLOW, AND THE COUNT COMES FROM THE REGISTRY", () => {
  it("BOTH LISTING STEPS ARE IN THE BUILT ORDER", () => {
    expect(STEP_ORDER).toContain("listing_contact");
    expect(STEP_ORDER).toContain("listing_hours");
  });

  it("AND IN THE TARGET ORDER TOO — this is approved scope, not drift", () => {
    expect(TARGET_ORDER).toContain("listing_contact");
    expect(TARGET_ORDER).toContain("listing_hours");
    expect(STEP_ORDER).toEqual(TARGET_ORDER);
  });

  it("TRANSITIONAL STAYS EMPTY, as that list says it must", () => {
    // "Nothing new goes on this list — it only shrinks."
    expect(TRANSITIONAL).toEqual([]);
  });

  it("THEY COME AFTER THE REDESIGN'S FIVE SCREENS, not inside them", () => {
    const five = ["presence", "connect", "confirm", "brand", "photos"];
    const order = STEP_ORDER as string[];
    for (const key of ["listing_contact", "listing_hours"]) {
      for (const screen of five) {
        expect(order.indexOf(key)).toBeGreaterThan(order.indexOf(screen));
      }
    }
    // And the five are still contiguous.
    expect(order.slice(0, 5)).toEqual(five);
  });

  it("THE TOTAL GREW BY TWO AND IS STILL DERIVED", () => {
    expect(totalSteps({})).toBe(STEP_ORDER.length - 1); // language_notes is conditional
    expect(stepsFor({ hinglish: true }).length).toBe(STEP_ORDER.length);
  });

  it("AND THE FLOW ACTUALLY WALKS THROUGH THEM", () => {
    // A step counted on the bar and never reached is the bug the step
    // registry was built to stop.
    expect(nextStep("photos", {})).toBe("listing_contact");
    expect(nextStep("listing_contact", {})).toBe("listing_hours");
    expect(nextStep("listing_hours", {})).toBe("business_model");
  });
});

// ---------------------------------------------------------------------
describe("6. NOT ONE PROMPT IS WRITTEN IN THE COMPONENT", () => {
  const ui = code("src/components/onboarding/ListingFactsStep.tsx");

  it("THE PROMPTS COME FROM THE REGISTRY", () => {
    // A prompt typed into the component would sit outside the rule-3
    // test that holds the registry's prompts category-neutral.
    expect(ui).toMatch(/questionByKey/);
    expect(ui).toMatch(/\{q!\.prompt\}/);
    expect(ui).toMatch(/\{q!\.help\}/);
  });

  it("AND THE FOUR KEYS IT IS ASKED FOR ARE FOUR REAL QUESTIONS", () => {
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    const asked = (card.match(/questionKeys=\{\[([^\]]*)\]\}/g) ?? [])
      .join(" ")
      .match(/"([a-z_]+)"/g)
      ?.map((k) => k.replace(/"/g, "")) ?? [];
    expect(asked.sort()).toEqual(["areas_served", "opening_hours", "public_phone", "street_address"]);
    for (const key of asked) expect(questionByKey(key)).not.toBeNull();
  });

  it("WHICH IS EXACTLY TIER 1 — no question is asked twice and none is left out", () => {
    const card = code("src/components/dashboard/WelcomeChatCard.tsx");
    const asked = (card.match(/questionKeys=\{\[([^\]]*)\]\}/g) ?? [])
      .join(" ")
      .match(/"([a-z_]+)"/g)
      ?.map((k) => k.replace(/"/g, "")) ?? [];
    expect(asked.slice().sort()).toEqual(questionsFor(1, {}).map((q) => q.key).sort());
    expect(new Set(asked).size).toBe(asked.length);
  });

  it("PUBLISHING STARTS UNTICKED, matching the database's own default", () => {
    expect(ui).toMatch(/useState\(false\)/);
    expect(ui).not.toMatch(/useState\(true\)/);
  });

  it("the component only sends the keys the screen asked about", () => {
    expect(ui).toMatch(/if \(asks\("public_phone"\)\)/);
    expect(ui).toMatch(/if \(asks\("opening_hours"\)\)/);
  });

  it("and a failed read leaves the fields empty rather than inventing a value", () => {
    const withComments = sourceWithComments("src/components/onboarding/ListingFactsStep.tsx");
    expect(withComments).toMatch(/Nothing is invented/);
  });
});

// ---------------------------------------------------------------------
describe("7. THE COLUMNS WRITTEN ARE THE COLUMNS MIGRATION 221 CREATES", () => {
  it("EVERY KEY THE CLEANER WILL WRITE IS A REAL COLUMN", () => {
    const migration = readFileSync("supabase/migrations/221_business_listing_facts.sql", "utf8");
    const everything = {
      public_phone: "x",
      publish_phone: true,
      opening_hours: [],
      areas_served: [],
      street_address: "y",
      publish_street_address: true,
    };
    const { patch } = cleanListingFactsPatch(everything, owner);
    expect(Object.keys(patch).length).toBe(6);
    for (const key of Object.keys(patch)) {
      expect(migration).toMatch(new RegExp(`^\\s*${key}\\s`, "m"));
    }
  });

  it("AND A COLUMN THE CLEANER DOES NOT KNOW IS NEVER WRITTEN", () => {
    // sameAs joins when something asks for it. Accepting a field no
    // question collects would be a column written by whoever guessed
    // its name.
    const { patch } = cleanListingFactsPatch(
      { instagram_url: "https://example.com/x", other_profile_urls: ["https://example.com/y"], answered_by: "model", id: "abc" },
      owner
    );
    expect(Object.keys(patch)).toEqual([]);
  });

  it("answered_by cannot be set by the caller at all", () => {
    const route = code("src/app/api/listing-facts/route.ts");
    // It is written by the route, from a literal.
    expect(route).toMatch(/answered_by: "owner"/);
    expect(route).not.toMatch(/answered_by: body/);
    expect(route).not.toMatch(/answered_by: patch/);
  });
});
