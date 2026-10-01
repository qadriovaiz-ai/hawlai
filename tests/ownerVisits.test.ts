// The owner's own visits stop counting as customers.
//
// Site visits went 28 → 31 while the owner tested his own shop. At that
// volume his clicks are most of the signal, and Diagnosis reads these
// rows for the funnel and the conversion rate — so a number the owner
// made by refreshing his page came back to him as a conversion rate.
//
// MARKED, NOT DROPPED. Refusing to record the event would make "why
// didn't my visit count?" unanswerable and the exclusion impossible to
// audit afterwards.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";

const track = readFileSync("src/app/api/public/track/route.ts", "utf8");
const utils = readFileSync("src/lib/utils.ts", "utf8");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe("how an owner's visit is recognised", () => {
  it("the SESSION is the authority, read from their own cookie", () => {
    expect(track).toMatch(/async function isOwnerSession/);
    expect(track).toMatch(/\.from\("profiles"\)\.select\("dealership_id"\)/);
    // Scoped to THIS business, not "any business" — an agency teammate
    // is on several.
    expect(track).toMatch(/\.eq\("dealership_id", dealershipId\)\.eq\("status", "active"\)/);
    expect(track).toMatch(/const internal = \(await isOwnerSession\(dealershipId\)\) \|\| internalFlag === true;/);
  });

  it("never throws, because a visitor with no session is the normal case", () => {
    const fn = track.slice(track.indexOf("async function isOwnerSession"), track.indexOf("export async function POST"));
    expect(fn).toMatch(/try \{/);
    expect(fn).toMatch(/catch \{\s*return false;/);
  });

  it("the browser flag comes from the dashboard's own link and is remembered", () => {
    expect(utils).toMatch(/export function isOwnerVisit/);
    expect(utils).toMatch(/get\("hw"\) === "owner"/);
    expect(utils).toMatch(/hw_owner=1; max-age=31536000/);
    const builder = readFileSync("src/components/website-builder/WebsiteBuilderView.tsx", "utf8");
    expect(builder).toMatch(/\/site\/\$\{website\.slug\}\?hw=owner/);
  });

  it("trusting the client here is safe, and the reason is written down", () => {
    // The only thing the flag can do is leave the sender's own visit out
    // of the sender's own counts.
    expect(track).toMatch(/exclude the sender's own visit from the sender's own/);
  });

  it("the event is still recorded, with the mark on it", () => {
    expect(track).toMatch(/is_internal: internal,/);
    // Not a branch that skips the insert.
    expect(track).not.toMatch(/if \(internal\) return/);
  });
});

describe("EVERY COUNT LEAVES THEM OUT", () => {
  it("no reader of page_events counts internal events", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      const body = readFileSync(file, "utf8");
      if (!body.includes('from("page_events")')) continue;
      // Only the insert is exempt: it writes the column. Everything that
      // READS these rows is a count of customers, the A/B test included —
      // a variant comparison with 30 events can be decided by five of
      // the owner's own refreshes.
      if (file.endsWith("api/public/track/route.ts")) continue;
      if (!body.includes('.eq("is_internal", false)')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("including the two that decide what Hawlai says about the funnel", () => {
    expect(readFileSync("src/lib/strategy/diagnosis.ts", "utf8")).toMatch(/\.eq\("is_internal", false\)/);
    expect(readFileSync("src/lib/claims/businessFacts.ts", "utf8")).toMatch(/\.eq\("is_internal", false\)/);
  });

  it("the dashboard says what it cannot detect", () => {
    const card = readFileSync("src/components/dashboard/WebsiteAnalyticsCard.tsx", "utf8");
    expect(card).toMatch(/another device or a private\s*\n?\s*window can&apos;t be told apart/);
  });
});
