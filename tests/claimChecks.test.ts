// THE RECORD OF WHAT WENT OUT — S7/P1.
//
// Measured on 5 November 2026 before a line of this was written:
// generateCopy computes `removed`, `substantiation` and `publishable`
// and throws all three away; src/lib/claims was nine files of reads with
// no writes; email_sends keeps the subject and not the body. So the
// question "how often did a sentence we could not support reach a
// customer this month?" had no answer at all — and S7's demotion rule
// is supposed to fire on exactly that.
//
// WHAT THESE TESTS HOLD DOWN, in the order the mistakes would cost:
//
//   1. `published` MEANS WENT OUT. Caught-and-removed is the system
//      working; published is the system failing. A recorder that
//      confused them would make the demotion rule fire on its own
//      successes.
//   2. THE OWNER'S OWN WORDING IS COUNTED APART. The page tools keep an
//      unsupported claim the owner typed himself and tell him he is
//      standing behind it. That IS a claim reaching the public, and
//      demoting for it would take away a permission he never misused.
//   3. AN UNKNOWN SURFACE RECORDS NOTHING AND SAYS SO. Guessing would
//      file a page edit as an email and quietly mis-shape every number
//      the monitor later reports.
//   4. A FAILED WRITE IS LOUD. If this table is not being written, the
//      monitor sees an empty month and reports a clean one.
//   5. AND IT NEVER BREAKS A SEND. The merchant's page edit is the real
//      work; this row is bookkeeping.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  claimCheckField,
  isClaimCheckField,
  knownSurfaces,
  recordClaimCheck,
  recordExecutedPublish,
  surfaceFor,
} from "@/lib/claims/claimChecks";
import { ACTION_POLICIES } from "@/lib/executionPolicy";
import { code, sourceWithComments } from "./helpers/source";

afterEach(() => vi.restoreAllMocks());

/** A claim_checks table that takes a row, or refuses to. */
function table(opts: { error?: string; throws?: boolean } = {}) {
  const rows: any[] = [];
  const client = {
    from(name: string) {
      return {
        insert(values: any) {
          if (opts.throws) throw new Error("connection reset");
          if (opts.error) return Promise.resolve({ data: null, error: { message: opts.error } });
          rows.push({ table: name, ...values });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { client, rows };
}

const FIELD = claimCheckField({ text: "Hand-poured soy candles, made in Srinagar.", removed: ["burns 40% longer"] });

describe("1. THE FIELD A TOOL HANDS FORWARD", () => {
  it("COUNTS WHAT THE GUARD TOOK OUT, from the guard's own list", () => {
    const f = claimCheckField({ text: "x", removed: ["a", "b", "c"] });
    expect(f.removed).toBe(3);
    expect(f.keptUnsupported).toBe(0);
  });

  it("THE OWNER'S WORDS FLAG MEANS NOTHING WITH NOTHING KEPT", () => {
    // THE DANGEROUS DIRECTION. A clean row marked as the owner's
    // responsibility would excuse a LATER escape that was ours — the
    // monitor would see owner_words and leave the level alone.
    const f = claimCheckField({ text: "x", removed: [], keptUnsupported: 0, ownerWords: true });
    expect(f.ownerWords).toBe(false);
    const kept = claimCheckField({ text: "x", removed: [], keptUnsupported: 2, ownerWords: true });
    expect(kept.ownerWords).toBe(true);
    expect(kept.keptUnsupported).toBe(2);
  });

  it("and a nonsense count is floored rather than stored", () => {
    expect(claimCheckField({ text: "x", removed: [], keptUnsupported: -4 }).keptUnsupported).toBe(0);
    expect(claimCheckField({ text: "x", removed: [], keptUnsupported: 1.7 }).keptUnsupported).toBe(1);
    expect(claimCheckField({ text: "x", removed: null as any }).removed).toBe(0);
  });

  it("A FIELD WITH NO TEXT IS NOT A FIELD, because the monitor reads text", () => {
    // A row the monitor cannot read back counts as unchecked for ever,
    // and unchecked for long enough is what suspends promotion. So an
    // empty one is refused at the door rather than written.
    expect(isClaimCheckField(FIELD)).toBe(true);
    expect(isClaimCheckField({ ...FIELD, text: "" })).toBe(false);
    expect(isClaimCheckField({ ...FIELD, text: "   " })).toBe(false);
    expect(isClaimCheckField({ text: "x" })).toBe(false);
    expect(isClaimCheckField(null)).toBe(false);
    expect(isClaimCheckField("a string")).toBe(false);
  });
});

describe("2. THE ROW SAYS WHETHER IT WENT OUT", () => {
  it("published TRUE CARRIES A TIME, AND published FALSE CARRIES NONE", async () => {
    // The load-bearing column, and the one thing the demotion rule
    // reads. A time on an unpublished row would make a draft look like
    // something that reached a customer.
    const t = table();
    await recordClaimCheck(t.client, { dealershipId: "d1", surface: "page_meta", field: FIELD, published: true });
    expect(t.rows[0].table).toBe("claim_checks");
    expect(t.rows[0].published).toBe(true);
    expect(typeof t.rows[0].published_at).toBe("string");

    const u = table();
    await recordClaimCheck(u.client, { dealershipId: "d1", surface: "page_meta", field: FIELD, published: false });
    expect(u.rows[0].published).toBe(false);
    expect(u.rows[0].published_at).toBeNull();
  });

  it("AND IT CARRIES THE TEXT, because a hash cannot be re-read", async () => {
    // The monitor's whole job is to ask the extractor about these
    // sentences again from scratch — "THE RUN CANNOT BE THE JUDGE OF
    // THE RUN". The plan originally said text_hash; a hash makes the
    // monitor impossible.
    const t = table();
    await recordClaimCheck(t.client, { dealershipId: "d1", surface: "page_meta", field: FIELD, published: true });
    expect(t.rows[0].text).toBe("Hand-poured soy candles, made in Srinagar.");
    expect(t.rows[0].claims_removed).toBe(1);
    expect(t.rows[0].claims_unsupported).toBe(0);
    expect(t.rows[0].owner_words).toBe(false);
    expect(t.rows[0].dealership_id).toBe("d1");
    expect(t.rows[0].surface).toBe("page_meta");
  });

  it("AND THE OWNER'S KEPT CLAIMS REACH THE ROW, in their own column", async () => {
    // A MUTATION SURVIVED WITHOUT THIS. Every fixture above has
    // keptUnsupported 0, so replacing `claims_unsupported:
    // input.field.keptUnsupported` with a hard 0 changed nothing any
    // test could see — and that column is what stops S7 demoting for
    // the owner's own sentences. Asserted with a non-zero value, which
    // is the only way the assignment is observable.
    const t = table();
    const his = claimCheckField({ text: "Our candles burn longer.", removed: [], keptUnsupported: 2, ownerWords: true });
    await recordClaimCheck(t.client, { dealershipId: "d1", surface: "page_meta", field: his, published: true });
    expect(t.rows[0].claims_unsupported).toBe(2);
    expect(t.rows[0].owner_words).toBe(true);
    expect(t.rows[0].claims_removed).toBe(0);
  });

  it("WRITES NOTHING WHEN THERE IS NO TEXT, and says why", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const t = table();
    const r = await recordClaimCheck(t.client, { dealershipId: "d1", surface: "page_meta", field: { text: "", removed: 0, keptUnsupported: 0, ownerWords: false }, published: true });
    expect(r.recorded).toBe(false);
    expect(t.rows).toEqual([]);
    expect(errors.join("\n")).toMatch(/nothing a monitor could read back/);
  });
});

describe("3. A FAILED WRITE IS LOUD, because a silent one reads as a clean month", () => {
  it("REPORTS A REFUSED INSERT, WITH ITS REASON AND THE MIGRATION", async () => {
    // Repo migrations drift from production — prod was a migration
    // behind for weeks in September — so the message names the one that
    // has to be run rather than leaving somebody to guess.
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const t = table({ error: 'relation "claim_checks" does not exist' });
    const r = await recordClaimCheck(t.client, { dealershipId: "d1", surface: "page_meta", field: FIELD, published: true });
    expect(r.recorded).toBe(false);
    expect(String(r.why)).toMatch(/does not exist/);
    expect(errors.join("\n")).toMatch(/migration 217/);
  });

  it("AND NEVER THROWS, whatever the client does", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = table({ throws: true });
    await expect(
      recordClaimCheck(t.client, { dealershipId: "d1", surface: "page_meta", field: FIELD, published: true })
    ).resolves.toEqual({ recorded: false, why: "connection reset" });
  });
});

describe("4. WHICH SURFACE AN ACTION WRITES TO — guessed never", () => {
  it("AN UNKNOWN ACTION KEY RECORDS NOTHING AND SAYS SO", async () => {
    // Migration 217 left `surface` unconstrained in SQL on the
    // understanding that a mismatch is caught here instead. So this is
    // that catch, and it has to be loud: the consequence of silence is
    // that the monitor never sees a surface at all and reports the
    // months it was live as clean.
    expect(surfaceFor("update_page_meta")).toBe("page_meta");
    expect(surfaceFor("update_page_text")).toBe("page_text");
    expect(surfaceFor("something_new_nobody_mapped")).toBeNull();
    expect(surfaceFor("")).toBeNull();

    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const t = table();
    // A REAL KEY THE REGISTRY KNOWS AND NOBODY MAPPED. My first version
    // used an invented key, which is refused one branch EARLIER — so it
    // passed without ever reaching the surface check it was named
    // after. This one is in ACTION_POLICIES and not in SURFACE_OF.
    expect(ACTION_POLICIES["update_product_name"], "fixture key left the registry").toBeTruthy();
    expect(surfaceFor("update_product_name")).toBeNull();
    const r = await recordExecutedPublish(t.client, {
      id: "act-1",
      dealershipId: "d1",
      actionKey: "update_product_name",
      requestedChanges: { claimCheck: FIELD },
    });
    expect(r.recorded).toBe(false);
    expect(t.rows).toEqual([]);
    expect(errors.join("\n")).toMatch(/has no surface in claimChecks\.ts/);
  });

  it("AND A KEY THE REGISTRY DOES NOT KNOW IS REFUSED TOO", async () => {
    // ACTION_POLICIES' own header: an action's absence there is not
    // "safe by default". The surface map agreeing about a key the
    // registry has never heard of proves nothing.
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const t = table();
    const r = await recordExecutedPublish(t.client, {
      id: "act-1",
      dealershipId: "d1",
      actionKey: "something_nobody_wrote_down",
      requestedChanges: { claimCheck: FIELD },
    });
    expect(r.recorded).toBe(false);
    expect(t.rows).toEqual([]);
    expect(errors.join("\n")).toMatch(/is not in ACTION_POLICIES/);
  });

  it("EVERY MAPPED KEY IS A REAL ACTION, so the map cannot drift from the registry", () => {
    // The test migration 217 says it is relying on. A key here that
    // the registry does not have is a surface nothing can ever record.
    const src = code("src/lib/claims/claimChecks.ts");
    const block = src.slice(src.indexOf("const SURFACE_OF"), src.indexOf("};", src.indexOf("const SURFACE_OF")));
    const keys = (block.match(/^\s{2}(\w+):/gm) ?? []).map((m) => m.trim().replace(":", ""));
    expect(keys.length, "the surface map is empty").toBeGreaterThan(4);
    for (const key of keys) {
      expect(ACTION_POLICIES[key], `${key} is mapped to a surface but is not in ACTION_POLICIES`).toBeTruthy();
    }
  });

  it("and every surface the map produces is one the type allows", () => {
    expect(knownSurfaces().length).toBeGreaterThan(3);
    expect(knownSurfaces()).toContain("page_meta");
    expect(new Set(knownSurfaces()).size).toBe(knownSurfaces().length);
  });
});

describe("5. AN EXECUTED ACTION, RECORDED AS PUBLISHED", () => {
  it("THE ROW IS WRITTEN WITH THE ACTION ON IT AND published TRUE", async () => {
    const t = table();
    const r = await recordExecutedPublish(t.client, {
      id: "act-9",
      dealershipId: "d1",
      actionKey: "update_page_meta",
      requestedChanges: { seoTitle: "x", claimCheck: FIELD },
    });
    expect(r.recorded).toBe(true);
    expect(t.rows[0].action_id).toBe("act-9");
    expect(t.rows[0].published).toBe(true);
    expect(t.rows[0].surface).toBe("page_meta");
  });

  it("AN ACTION WITH NO COPY IN IT IS NOT AN ERROR", async () => {
    // A price change has no sentences. Writing a row with no text would
    // create something the monitor can never check — counted as
    // unchecked for ever, which is what suspends promotion.
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const t = table();
    const r = await recordExecutedPublish(t.client, {
      id: "act-9",
      dealershipId: "d1",
      actionKey: "update_product_price",
      requestedChanges: { price: "999" },
    });
    expect(r.recorded).toBe(false);
    expect(r.why).toBe("this action carries no copy to check");
    expect(t.rows).toEqual([]);
    // AND IT IS NOT SHOUTED ABOUT. Every price change would log an
    // error, and a log full of expected errors is a log nobody reads.
    expect(errors).toEqual([]);
  });
});

describe("6. the migration says what the code says", () => {
  const sql = sourceWithComments("supabase/migrations/217_claim_checks.sql");

  it("THE TWO COUNTS ARE SEPARATE COLUMNS, and so is whose words they were", () => {
    expect(sql).toMatch(/claims_removed integer/);
    expect(sql).toMatch(/claims_unsupported integer/);
    expect(sql).toMatch(/owner_words boolean/);
  });

  it("A VERDICT AND ITS TIME TRAVEL TOGETHER OR NOT AT ALL", () => {
    // "How long since anything was checked" is the question that
    // suspends promotion, and a verdict with no time on it cannot be
    // aged out.
    expect(sql).toMatch(/check \(\(monitor_verdict is null\) = \(checked_at is null\)\)/);
  });

  it("NULL IS NOT A VERDICT, and 'could_not_check' is a real one", () => {
    expect(sql).toMatch(/monitor_verdict in \('clean', 'unsupported', 'could_not_check'\)/);
    expect(sql).toMatch(/never to be read as clean/i);
  });

  it("ONE ROW PER PUBLISH ACTION, so a retry is not a second escape", () => {
    expect(sql).toMatch(/create unique index[\s\S]{0,120}claim_checks\(action_id\) where action_id is not null/);
  });

  it("HAS ROW LEVEL SECURITY and no client write policy, like audit_log", () => {
    expect(sql).toMatch(/alter table claim_checks enable row level security/);
    expect(sql).toMatch(/for select using/);
    expect(sql).not.toMatch(/for (insert|all|update) /);
  });

  it("and it says out loud that the text is personal data once P1b widens it", () => {
    // The founder should know this is a question rather than an
    // oversight: page copy is the business's own words, but an email or
    // a WhatsApp reply carries a customer's name.
    expect(sql).toMatch(/DPDP/);
  });
});
