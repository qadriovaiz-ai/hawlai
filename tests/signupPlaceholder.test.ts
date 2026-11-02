// SIGNUP Q1 — three fields, and a stand-in name that must not escape.
//
// Signup stopped asking for the business name on 2 November: onboarding
// step 3 collects it, shows the owner what the analysis worked out, and
// lets him correct it. Asking twice made the first answer the one
// nobody checked.
//
// But `dealerships.dealership_name` is `not null` (001_schema.sql:15),
// so the row created at signup carries a placeholder until step 3
// replaces it. dealership_name is read in 94 files, 224 times, and some
// of those reach a CUSTOMER — the sender name on an email, the business
// name written into marketing copy.
//
// THE RULE, AND THE ONLY THING THESE TESTS ARE ABOUT: the placeholder
// may be visible inside the dashboard for the few minutes before step
// 3, and it may NEVER leave the product. Three chokepoints enforce it,
// one per path, and they are checked here as behaviour where they can
// be and as source where they cannot.

import { describe, it, expect } from "vitest";
import {
  PLACEHOLDER_BUSINESS_NAME,
  isPlaceholderBusinessName,
  realBusinessName,
} from "@/lib/onboarding/signup";
import { businessDisplayName } from "@/lib/business/displayName";
import { provenanceLabel, resolveField, sourceOf } from "@/lib/onboarding/provenance";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { code } from "./helpers/source";

describe("1. the stand-in, and what counts as one", () => {
  it("IS THE SAME WORDS AS THE EXISTING no-name FALLBACKS", () => {
    // The founder's call, and the right one: a leak then reads as a
    // blank rather than as a wrong name. dailyGrowth already says this
    // when it cannot read the record at all.
    expect(PLACEHOLDER_BUSINESS_NAME).toBe("Your business");
  });

  it("IS RECOGNISED WHATEVER THE OWNER TYPES BACK", () => {
    // He can edit this field on step 3, and "your business " retyped is
    // still not a name.
    for (const variant of ["Your business", "your business", "YOUR BUSINESS", "  Your   business  "]) {
      expect(isPlaceholderBusinessName(variant), variant).toBe(true);
    }
  });

  it("AND AN EMPTY VALUE IS NOT THE PLACEHOLDER — it is nothing", () => {
    // Callers already handle nothing; conflating the two would hide
    // which of the two a given row is in.
    for (const empty of ["", "   ", null, undefined]) {
      expect(isPlaceholderBusinessName(empty as any), JSON.stringify(empty)).toBe(false);
    }
  });

  it("a real name is not mistaken for it", () => {
    for (const real of ["Your Business Partners Ltd", "Business", "Yourbusiness"]) {
      expect(isPlaceholderBusinessName(real), real).toBe(false);
    }
  });

  it("realBusinessName gives null for both, and the trimmed name otherwise", () => {
    expect(realBusinessName(PLACEHOLDER_BUSINESS_NAME)).toBeNull();
    expect(realBusinessName("")).toBeNull();
    expect(realBusinessName(null)).toBeNull();
    expect(realBusinessName("  A Real Name  ")).toBe("A Real Name");
  });
});

describe("2. THE PLACEHOLDER NEVER LEAVES THE PRODUCT", () => {
  it("NO GENERATOR CAN WRITE IT INTO COPY", () => {
    // businessDisplayName is the chokepoint businessFacts reads
    // through, so one guard here keeps it out of every generator at
    // once rather than at 94 call sites.
    expect(businessDisplayName(PLACEHOLDER_BUSINESS_NAME)).toBe("the business");
    expect(businessDisplayName("  your business  ")).toBe("the business");
    expect(businessDisplayName(PLACEHOLDER_BUSINESS_NAME, "this business")).toBe("this business");
    // And a real name still comes through untouched, handle-casing and all.
    expect(businessDisplayName("A Real Name")).toBe("A Real Name");
    expect(businessDisplayName("a_real_handle")).toBe("A Real Handle");
  });

  it("AND THE CLAIMS LAYER READS THROUGH THAT CHOKEPOINT", () => {
    // If businessFacts stopped using it, the guard above would be
    // guarding nothing.
    const facts = code("src/lib/claims/businessFacts.ts");
    expect(facts).toMatch(/businessName: businessDisplayName\(/);
  });

  it("IT IS NEVER THE NAME ON AN ENVELOPE", () => {
    // A customer receiving mail "from: Your business" is the product
    // stating something nobody said.
    const src = code("src/lib/email/sendDealerEmail.ts");
    expect(src).toMatch(/realBusinessName\(dealership\?\.dealership_name\) \?\? "Hawlai"/);
    expect(src).not.toMatch(/dealership\?\.dealership_name \?\? "Hawlai"/);
  });

  it("AND IT IS NEVER WRITTEN INTO A MARKETING EMAIL", () => {
    const src = code("src/lib/email/sendApprovedEmail.ts");
    expect(src).toMatch(/businessName: realBusinessName\(dealership\?\.dealership_name\) \?\? ""/);
  });

  it("AND NOBODY HAS HARDCODED IT SOMEWHERE NEW", () => {
    // WALKED FROM DISK, NOT FROM git grep. The first version used git
    // grep and passed while missing signup.ts itself, because git grep
    // only searches TRACKED files and the new file was not staged yet —
    // an instrument that answers about the index when it was asked
    // about the working tree.
    //
    // THROUGH code(), so a comment explaining the rule is not mistaken
    // for a breach of it: both files below discuss these words.
    //
    // Two places legitimately say them for their own reason, and both
    // mean "the record could not be read" rather than "this is the
    // name". They are listed so a third is a decision somebody makes on
    // purpose rather than a copy-paste.
    const allowed = [
      "src/lib/onboarding/signup.ts",
      "src/lib/growth/dailyGrowth.ts",
      "src/app/chat/layout.tsx",
    ];
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name).split("\\").join("/");
        if (entry.isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
      });

    const files = walk("src");
    // A path mistake that walked nothing would make this pass on an
    // empty list, which is the failure the whole file is about.
    expect(files.length).toBeGreaterThan(300);

    const hits = files.filter((f) => code(f).includes(PLACEHOLDER_BUSINESS_NAME));
    expect(hits.sort()).toEqual(allowed.sort());
  });
});

describe("3. STEP 3 DOES NOT TELL HIM HE TYPED IT", () => {
  it("THE PLACEHOLDER COUNTS AS NOBODY HAVING SAID THE NAME", () => {
    // Labelling it "you entered this when you signed up" would be the
    // confirm screen telling the owner he typed something he never
    // typed — on the one screen whose whole job is to be checked.
    expect(sourceOf("", PLACEHOLDER_BUSINESS_NAME)).toBe("none");
    expect(provenanceLabel(sourceOf("", PLACEHOLDER_BUSINESS_NAME), "url")).toBeNull();
    const field = resolveField("", PLACEHOLDER_BUSINESS_NAME, "url");
    expect(field).toEqual({ value: "", source: "none", label: null });
  });

  it("AND AN ANALYSED NAME STILL WINS OVER IT", () => {
    const field = resolveField("A Real Name", PLACEHOLDER_BUSINESS_NAME, "url");
    expect(field.value).toBe("A Real Name");
    expect(field.source).toBe("analysis");
    expect(field.label).toBe("from your website");
  });

  it("and a name the owner really did type at signup is still credited to him", () => {
    // Everyone who signed up before Q1 has one.
    const field = resolveField("", "Typed At Signup", "url");
    expect(field.source).toBe("signup");
    expect(field.label).toMatch(/signed up/);
  });
});

describe("4. the form asks for three things", () => {
  const src = code("src/app/auth/signup/page.tsx");

  it("FULL NAME, EMAIL, PASSWORD — AND NOT THE BUSINESS NAME OR THE CITY", () => {
    expect(src).toMatch(/name="fullName"/);
    expect(src).toMatch(/name="email"/);
    expect(src).toMatch(/name="password"/);
    expect(src).not.toMatch(/name="dealershipName"/);
    expect(src).not.toMatch(/name="city"/);
  });

  it("AND IT WRITES THE STAND-IN RATHER THAN AN EMPTY STRING", () => {
    // An empty string would violate nothing in the database and would
    // be indistinguishable from a name the owner cleared.
    expect(src).toMatch(/dealership_name: PLACEHOLDER_BUSINESS_NAME/);
    expect(src).not.toMatch(/dealership_name: ""/);
  });

  it("AND SENDS NO CITY AT ALL, because the column is nullable", () => {
    expect(src).not.toMatch(/city:/);
  });

  it("and no longer says it is registering a business", () => {
    // The form stopped doing that; the sentence had to stop saying it.
    expect(src).not.toMatch(/Register your business/);
  });
});
