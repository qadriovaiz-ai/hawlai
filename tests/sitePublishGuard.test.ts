// Publishing the whole site, and the check that stops it going out broken.
//
// WHY THIS FILE EXISTS: the publish route had NO test. Its placeholder
// guard — "refuse to publish while any page still holds fallback
// content" — was written as the last line of defence before a site goes
// public, and nothing verified it. So when G-3 step 2a moved that guard
// out of the route into src/lib/website/setSitePublished.ts, "no
// behaviour change" would have been an assertion rather than a fact.
//
// These run the real route and the real function.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; values: Row }[];
let updateError: string | null;
let signedIn: Row | null;

function db(): any {
  const from = (table: string) => {
    let op = "select";
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      update: (v: Row) => {
        op = "update";
        writes.push({ table, values: v });
        return { eq: async () => ({ error: updateError ? { message: updateError } : null }) };
      },
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: signedIn } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));

import { PATCH } from "@/app/api/website-builder/publish/route";
import { setSitePublished } from "@/lib/website/setSitePublished";
import { code } from "./helpers/source";

const call = (body: any) =>
  PATCH(new Request("https://hawlai.online/api/website-builder/publish", { method: "PATCH", body: JSON.stringify(body) }));

beforeEach(() => {
  writes = [];
  updateError = null;
  signedIn = { id: "u1" };
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    websites: [{ id: "w1", dealership_id: "d1", published: false }],
    website_pages: [
      { website_id: "w1", title: "Home", is_fallback: false },
      { website_id: "w1", title: "About", is_fallback: false },
    ],
  };
});

describe("a placeholder page stops the whole site going public", () => {
  it("REFUSED, AND THE FLAG IS NOT TOUCHED", async () => {
    tables.website_pages = [{ website_id: "w1", title: "Home", is_fallback: true }];
    const res = await call({ published: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Can't publish — Home still has placeholder content/);
    expect(writes).toEqual([]);
  });

  it("the message NAMES the pages, and agrees with itself on plurals", async () => {
    // The owner has to know which page to fix. "Something is wrong" is
    // not a message.
    tables.website_pages = [
      { website_id: "w1", title: "Home", is_fallback: true },
      { website_id: "w1", title: "Contact", is_fallback: true },
    ];
    const error = (await (await call({ published: true })).json()).error;
    expect(error).toMatch(/Home, Contact/);
    expect(error).toMatch(/still have placeholder content/);
    expect(error).toMatch(/Regenerate Website/);
  });

  it("a clean site publishes", async () => {
    const res = await call({ published: true });
    expect(res.status).toBe(200);
    expect(writes).toEqual([{ table: "websites", values: { published: true } }]);
  });
});

describe("UNPUBLISHING IS NEVER BLOCKED", () => {
  it("a site with placeholder pages can still be taken down", async () => {
    // The safe direction must not be the blocked one. A site that is
    // already public with broken pages is exactly when the owner most
    // needs this switch to work — and docs/PRINCIPLES.md P4 says
    // switching something OFF is never gated.
    tables.website_pages = [{ website_id: "w1", title: "Home", is_fallback: true }];
    const res = await call({ published: false });
    expect(res.status).toBe(200);
    expect(writes).toEqual([{ table: "websites", values: { published: false } }]);
  });

  it("and the placeholder check is not even run", async () => {
    // Not merely "allowed anyway": a read that throws must not be able
    // to block an unpublish.
    tables.website_pages = [{ website_id: "w1", title: "Home", is_fallback: true }];
    const broken = {
      ...db(),
      from: (t: string) => (t === "website_pages" ? { select: () => { throw new Error("db down"); } } : db().from(t)),
    };
    const r = await setSitePublished(broken, "d1", false);
    expect(r.ok).toBe(true);
  });
});

describe("the edges", () => {
  it("a business with no website row publishes nothing and errors nothing", async () => {
    // maybeSingle returns null; the guard must not throw on it.
    tables.websites = [];
    const res = await call({ published: true });
    expect(res.status).toBe(200);
  });

  it("a write failure is reported as 500, not as success", async () => {
    updateError = "connection reset";
    const res = await call({ published: true });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("connection reset");
  });

  it("A SIGNED-OUT REQUEST IS REFUSED, and writes nothing", async () => {
    // The first version of this asserted 200 and grepped the source for
    // the word "Unauthorized", because the stub always returned a user.
    // That proved nothing about the route.
    signedIn = null;
    const res = await call({ published: true });
    expect(res.status).toBe(401);
    expect(writes).toEqual([]);
  });
});

describe("G-3 step 2a: the guard moved WITH the work", () => {
  it("THE SAME REFUSAL ON THE DIRECT CALL, so the approvals path cannot skip it", async () => {
    tables.website_pages = [{ website_id: "w1", title: "Home", is_fallback: true }];
    const r = await setSitePublished(db(), "d1", true);
    expect(r.ok).toBe(false);
    expect((r as any).status).toBe(400);
    expect((r as any).error).toMatch(/placeholder content/);
    expect(writes).toEqual([]);
  });

  it("and the same success", async () => {
    const r = await setSitePublished(db(), "d1", true);
    expect(r.ok).toBe(true);
    expect(writes).toEqual([{ table: "websites", values: { published: true } }]);
  });

  it("THE ROUTE DOES NOT RE-IMPLEMENT THE CHECK", () => {
    // If it gets copied back, the route becomes the only place it runs
    // and the approvals path loses it.
    const route = code("src/app/api/website-builder/publish/route.ts");
    expect(route).toMatch(/setSitePublished\(/);
    expect(route).not.toMatch(/is_fallback/);
    expect(route).not.toMatch(/website_pages/);
  });
});

describe("G-3 step 2b: the approval record", () => {
  it("publish_site IS CLASSIFIED and requires approval", async () => {
    const { getActionPolicy } = await import("@/lib/executionPolicy");
    const policy = getActionPolicy("publish_site");
    expect(policy).toBeTruthy();
    expect(policy!.requiresApproval).toBe(true);
    // Reversible with the same flag, from Website Builder — no
    // notification fires and no third party is told.
    expect(policy!.riskLevel).toBe("high");
  });

  it("THERE IS NO ACTION FOR TAKING THE SITE DOWN", async () => {
    // P4: the safe direction is never gated. An "unpublish_site"
    // approval would make the fix slower than the mistake.
    const { getActionPolicy } = await import("@/lib/executionPolicy");
    expect(getActionPolicy("unpublish_site")).toBeFalsy();
  });

  it("THE PLACEHOLDER CHECK RUNS AT THE PRESS, not at the card", () => {
    // That re-read is the point of the record: a page that fell back to
    // placeholder content between the card and the press still stops the
    // publish.
    const route = code("src/app/api/approvals/[id]/route.ts");
    const branch = route.slice(route.indexOf('action_type === "publish_site"'), route.indexOf('action_type === "generate_graphic"'));
    expect(branch).toMatch(/setSitePublished\(service, approval\.dealership_id, true\)/);
    expect(branch).toMatch(/if \(!done\.ok\) return NextResponse\.json/);
    // Not by calling this app over HTTP.
    expect(branch).not.toMatch(/fetch\(/);
  });

  it("the chat tool offers it only for a site that is NOT already live", () => {
    // Approving "publish" for something already published is a button
    // that does nothing.
    const brain = code("src/lib/agents/masterBrainV2.ts");
    const at = brain.indexOf('actionType: "publish_site"');
    expect(at).toBeGreaterThan(-1);
    expect(brain.slice(at - 600, at)).toMatch(/if \(!saveResult\.published\)/);
  });

  it("A FAILED APPROVAL ROW DOES NOT THROW THE DRAFT AWAY", () => {
    // Unlike the image card, where no row means nothing should be
    // offered: here the website was built and saved, and losing it
    // because an insert failed would discard real work.
    const brain = code("src/lib/agents/masterBrainV2.ts");
    const at = brain.indexOf('actionType: "publish_site"');
    const after = brain.slice(at, at + 900);
    expect(after).toMatch(/if \(!\("error" in asked\)\)/);
    expect(after).not.toMatch(/return \{ error: asked\.error \}/);
  });
});

describe("EVERY approval card stores the words it showed", () => {
  // A mutation deleting `confirm` from the website row's action_details
  // survived, because nothing asserted it. Rather than grep that one
  // call site, this is the invariant: the sentence the owner reads has
  // to be on the row, for every card that has one.
  //
  // Why it matters: the row is the record of what was agreed to. A card
  // that shows words it did not store leaves "who approved this and what
  // did it say" answerable only from a client string.
  it("every requestApproval call puts its confirm in action_details", () => {
    const brain = code("src/lib/agents/masterBrainV2.ts");
    const calls = brain.split("requestApproval(supabase").slice(1);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const missing: string[] = [];
    for (const chunk of calls) {
      const body = chunk.slice(0, 1200);
      const action = body.match(/actionType:\s*"([a-z_]+)"/)?.[1] ?? "(unnamed)";
      // The details OBJECT, found by its braces rather than by assuming
      // it comes before requestedBy. It does not always: the toggle call
      // orders them the other way round, and slicing between the two
      // keys gave an empty string that reported a false failure.
      // One level of nesting allowed: generate_graphic spreads a
      // conditional `{ depiction_note }` inside its details, and a
      // brace-free pattern could not find the object at all.
      const details = body.match(/details:\s*\{(?:[^{}]|\{[^{}]*\})*\}/)?.[0] ?? "";
      // It must be passed as the confirm AND stored in the details.
      if (!/confirm:/.test(body)) missing.push(`${action}: no confirm passed at all`);
      else if (!details) missing.push(`${action}: could not find its details object`);
      else if (!/confirm/.test(details)) missing.push(`${action}: confirm shown but not stored on the row`);
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("and the card renders the stored words rather than its own copy", () => {
    // The artifact carries `confirm` straight from requestApproval's
    // return, which is the same string written to the row.
    const brain = code("src/lib/agents/masterBrainV2.ts");
    expect(brain).toMatch(/confirm: result\.confirm/);
    expect(brain).toMatch(/confirm: asked\.confirm/);
  });
});
