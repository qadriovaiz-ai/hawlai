// Every gate in the auto-reply path names itself.
//
// THE BUG. The DM and comment auto-reply toggles were ON in production
// and `auto_reply_log` had ZERO rows, ever. Eight days passed between
// noticing and diagnosing, because all five gates in the path are
// silent: a rejected signature writes a console line, and the handler's
// four early returns write nothing at all.
//
// Worse, `auto_reply_log` CANNOT record the first two gates: its
// `dealership_id` is NOT NULL (migration 033) and those gates fire
// exactly when no business matched. So "did Meta ever call us" was
// unanswerable from the database.
//
// These tests fail if any gate goes quiet again.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { sql, code, sourceWithComments } from "./helpers/source";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let deliveries: Row[];
let autoReplyRows: Row[];

function db() {
  const from = (table: string) => {
    const api: any = {
      select: () => api,
      eq: () => api,
      gte: () => api,
      order: () => api,
      limit: () => api,
      not: () => api,
      in: () => api,
      insert: async (row: any) => {
        if (table === "webhook_deliveries") deliveries.push(row);
        if (table === "auto_reply_log") autoReplyRows.push(row);
        (tables[table] ??= []).push(row);
        return { error: null };
      },
      single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from } as any;
}

// Past the gates the handler reaches the model and the catalogue. None
// of that is what this file tests, so it is stubbed — the gates
// themselves return before any of it.
vi.mock("@/lib/businessBrain", () => ({
  getBusinessContext: async () => ({ toneOfVoice: null, facts: { brand: { language: null } }, knowledgeFacts: null }),
}));
vi.mock("@/lib/agents/personas", () => ({ resolvePersona: async () => ({ goals: [] }) }));
vi.mock("@/lib/claims/businessFacts", () => ({
  fetchCatalog: async () => [],
  siteBase: () => "https://example.test",
}));
vi.mock("@/lib/email/consent", () => ({ siteUrl: () => "https://example.test" }));
vi.mock("@/lib/leads/dmLeadLinking", () => ({ resolveDmLead: async () => "lead-1" }));
vi.mock("@/lib/businessMemory/getLeadMemory", () => ({ getLeadMemory: async () => [] }));
vi.mock("@/lib/crypto/oauthSecrets", () => ({ readMetaPageToken: (d: any) => d?.fb_page_access_token ?? null }));
vi.mock("@/lib/agents/socialManagementAgent", () => ({
  generateAutoReply: async () => ({ reply: "Yes, we are open." }),
}));

import { handleAutoReplyEntry } from "@/lib/webhooks/autoReplyHandler";
import { recordDelivery, DETAIL_CHARS } from "@/lib/webhooks/deliveryLog";

/** A business matched on its Facebook page, with both toggles on. */
function connected(over: Row = {}) {
  tables.dealerships = [{
    id: "d1",
    dealership_name: "A Business",
    business_category: "a category",
    // A value that cannot appear in prose: the first version was "tok",
    // and the detail "has no usable access token" matched it.
    fb_page_access_token: "zzq-page-secret-7741",
    dm_auto_reply_enabled: true,
    comment_auto_reply_enabled: true,
    ...over,
  }];
}

function outcomes() {
  return deliveries.map((d) => d.outcome);
}

beforeEach(() => {
  tables = {};
  deliveries = [];
  autoReplyRows = [];
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});

describe("1. THE TWO GATES auto_reply_log COULD NEVER RECORD", () => {
  it("AN ENTRY WITH NO ID IS RECORDED, not silently dropped", async () => {
    await handleAutoReplyEntry({}, db(), "meta-leads");
    expect(outcomes()).toEqual(["no_entry_id"]);
  });

  it("A DELIVERY MATCHING NO BUSINESS IS RECORDED, WITH THE ID META SENT", async () => {
    // THE MOST DIAGNOSTIC ROW IN THE TABLE. Without the id there is no
    // way to compare what Meta called about against what
    // dealerships.fb_page_id actually holds.
    tables.dealerships = [];
    await handleAutoReplyEntry({ id: "page-999" }, db(), "meta-leads");
    expect(outcomes()).toEqual(["no_business_matched"]);
    expect(deliveries[0].entry_id).toBe("page-999");
    expect(deliveries[0].dealership_id).toBeNull();
    // AND IT SAYS WHY IN WORDS. The outcome is for counting; the detail
    // is what a human reads at 2am. Mutation M2 deleted it and nothing
    // noticed.
    expect(deliveries[0].detail).toMatch(/no business/i);
    expect(deliveries[0].detail).toMatch(/Facebook page|Instagram/i);
  });

  it("AND THAT ROW HAS NO BUSINESS TO ATTRIBUTE, which is why this table exists", async () => {
    // auto_reply_log.dealership_id is NOT NULL (migration 033), so this
    // row could not have gone there at all.
    const migration033 = sql("supabase/migrations/033_auto_reply.sql");
    expect(migration033).toMatch(/dealership_id uuid references dealerships\(id\) on delete cascade not null/);
    const migration226 = sql("supabase/migrations/226_webhook_deliveries.sql");
    expect(migration226).toMatch(/dealership_id uuid references dealerships\(id\) on delete cascade,/);
    expect(migration226).not.toMatch(/dealership_id uuid references dealerships\(id\) on delete cascade not null/);
  });
});

describe("2. THE OTHER THREE HANDLER GATES", () => {
  it("NO REPLY TOKEN IS RECORDED, with the channel it matched on", async () => {
    connected({ fb_page_access_token: null });
    await handleAutoReplyEntry({ id: "page-1" }, db(), "meta-leads");
    expect(outcomes()).toEqual(["no_reply_token"]);
    expect(deliveries[0].dealership_id).toBe("d1");
    expect(deliveries[0].detail).toMatch(/facebook/i);
  });

  it("BOTH TOGGLES OFF IS RECORDED — so 'the switches are on' can be checked", async () => {
    connected({ dm_auto_reply_enabled: false, comment_auto_reply_enabled: false });
    await handleAutoReplyEntry({ id: "page-1" }, db(), "meta-leads");
    expect(outcomes()).toEqual(["both_toggles_off"]);
    expect(deliveries[0].dealership_id).toBe("d1");
  });

  it("MATCHED AND ENABLED BUT NOTHING TO ANSWER IS ITS OWN OUTCOME", async () => {
    // A feed change that is not a comment, an echo of the business's
    // own message, a delivery receipt. "The plumbing works, this
    // payload just had nothing in it" must be distinguishable from a
    // fault, or every quiet day looks like a bug.
    connected();
    await handleAutoReplyEntry({ id: "page-1", messaging: [] }, db(), "meta-leads");
    expect(outcomes()).toEqual(["nothing_to_reply_to"]);
  });

  it("AN ECHO OF THE BUSINESS'S OWN MESSAGE IS NOT 'handled'", async () => {
    connected();
    await handleAutoReplyEntry(
      { id: "page-1", messaging: [{ sender: { id: "s1" }, message: { text: "hi", is_echo: true } }] },
      db(),
      "meta-leads"
    );
    expect(outcomes()).toEqual(["nothing_to_reply_to"]);
    expect(autoReplyRows).toHaveLength(0);
  });

  it("A REAL DM IS RECORDED AS handled, AND STILL WRITES auto_reply_log", async () => {
    // The new table explains the plumbing; it does not replace the log
    // the owner reads.
    connected();
    await handleAutoReplyEntry(
      { id: "page-1", messaging: [{ sender: { id: "s1" }, message: { text: "are you open?" } }] },
      db(),
      "meta-leads"
    );
    expect(outcomes()).toEqual(["handled"]);
    expect(deliveries[0].detail).toBeNull();
    expect(autoReplyRows).toHaveLength(1);
    expect(autoReplyRows[0].incoming_text).toBe("are you open?");
  });

  it("EXACTLY ONE DELIVERY ROW PER ENTRY, never two", async () => {
    // A gate that recorded and then fell through would double-count,
    // and the diagnosis query groups by outcome.
    connected();
    await handleAutoReplyEntry(
      { id: "page-1", messaging: [{ sender: { id: "s1" }, message: { text: "hello" } }] },
      db(),
      "meta-leads"
    );
    expect(deliveries).toHaveLength(1);
  });
});

describe("3. THE FIFTH GATE: A REJECTED SIGNATURE", () => {
  it("THE ROUTES RECORD THE REJECTION, not only a console line", () => {
    // An unset FACEBOOK_APP_SECRET rejects every delivery, and from
    // outside that is indistinguishable from Meta never calling.
    for (const route of [
      "src/app/api/webhooks/meta-leads/route.ts",
      "src/app/api/webhooks/meta-messaging/route.ts",
    ]) {
      const src = code(route);
      expect(src, route).toMatch(/recordDeliveryStandalone\(/);
      expect(src, route).toMatch(/outcome: "signature_rejected"/);
    }
  });

  it("AND IT DOES NOT BUILD A DATABASE CLIENT TO DO IT", () => {
    // A BUG I SHIPPED AND tests/leadIngestion.test.ts CAUGHT. The first
    // version called createServiceClient() at the call site, and that
    // function THROWS when the Supabase env vars are absent — so the
    // route threw instead of returning its 401. A webhook rejection
    // must not depend on the database being reachable: it is the one
    // response the route must always be able to give.
    for (const route of [
      "src/app/api/webhooks/meta-leads/route.ts",
      "src/app/api/webhooks/meta-messaging/route.ts",
    ]) {
      const src = code(route);
      const rejection = src.slice(src.indexOf("if (!signature.valid)"), src.indexOf("status: 401"));
      expect(rejection.length, route).toBeGreaterThan(20);
      expect(rejection, `${route} builds a client on the rejection path`).not.toMatch(/createServiceClient\(\)/);
    }
  });

  it("and the standalone recorder swallows an unreachable database", async () => {
    const { recordDeliveryStandalone } = await import("@/lib/webhooks/deliveryLog");
    // No Supabase env in this process: the import inside it throws, and
    // the caller must not notice.
    await expect(
      recordDeliveryStandalone({ source: "meta-leads", outcome: "signature_rejected", detail: "x" })
    ).resolves.toBeUndefined();
  });

  it("a missing client is refused rather than dereferenced", async () => {
    await expect(recordDelivery(null, { source: "meta-leads", outcome: "handled" })).resolves.toBeUndefined();
  });

  it("AND THE 401 STILL SAYS NOTHING, so it is not an oracle", () => {
    // The reason goes to the table, which only the owner and the
    // service role can read. The response body must stay bare.
    for (const route of [
      "src/app/api/webhooks/meta-leads/route.ts",
      "src/app/api/webhooks/meta-messaging/route.ts",
    ]) {
      const src = code(route);
      expect(src, route).toMatch(/\{ error: "Unauthorized" \}, \{ status: 401 \}/);
      expect(src, route).not.toMatch(/status: 401 \}[\s\S]{0,40}describeRejection/);
    }
  });

  it("the source is recorded, so the two routes are distinguishable", () => {
    expect(code("src/app/api/webhooks/meta-leads/route.ts")).toMatch(/source: "meta-leads"/);
    expect(code("src/app/api/webhooks/meta-messaging/route.ts")).toMatch(/source: "meta-messaging"/);
  });
});

describe("4. METADATA ONLY — no message, no sender, no token", () => {
  it("NO DETAIL EVER CARRIES THE CUSTOMER'S WORDS", async () => {
    connected();
    await handleAutoReplyEntry(
      { id: "page-1", messaging: [{ sender: { id: "psid-secret" }, message: { text: "my phone is 9000000000" } }] },
      db(),
      "meta-leads"
    );
    const text = JSON.stringify(deliveries);
    expect(text).not.toContain("9000000000");
    expect(text).not.toContain("psid-secret");
    expect(text).not.toContain("zzq-page-secret-7741");
  });

  it("ON EVERY GATE, not just the one that replies", async () => {
    // Mutation M15 put the incoming payload into the detail of the
    // NO-TOKEN path, and the test above never reached it — it drives a
    // fully connected business. Every gate now gets the same
    // incriminating payload.
    const secret = "9000000000";
    const payload = {
      id: "page-1",
      messaging: [{ sender: { id: "psid-secret" }, message: { text: `my phone is ${secret}` } }],
    };
    const gates: [string, Row | null][] = [
      ["no business matched", null],
      ["no reply token", { fb_page_access_token: null }],
      ["both toggles off", { dm_auto_reply_enabled: false, comment_auto_reply_enabled: false }],
      ["handled", {}],
    ];
    for (const [label, over] of gates) {
      deliveries = [];
      autoReplyRows = [];
      tables = {};
      if (over === null) tables.dealerships = [];
      else connected(over);
      await handleAutoReplyEntry(payload, db(), "meta-leads");
      expect(deliveries.length, `${label} recorded nothing`).toBe(1);
      const text = JSON.stringify(deliveries);
      expect(text, `${label} leaked the message`).not.toContain(secret);
      expect(text, `${label} leaked the sender`).not.toContain("psid-secret");
      expect(text, `${label} leaked the token`).not.toContain("zzq-page-secret-7741");
    }
  });

  it("AND THE TABLE HAS NO COLUMN THAT COULD HOLD THEM", () => {
    // Enforced by the schema, not by discipline at the call site: a
    // row here can be about a page belonging to nobody on this
    // platform, and storing a stranger's words against no owner is
    // collection with no purpose and no retention answer.
    // THE COLUMN LIST, NOT THE WORD. `comment on column ... is '...'`
    // is a SQL STATEMENT, not a comment, so sql() does not strip its
    // prose — and the prose here says "never message text", which made
    // a word-grep match the very sentence promising the opposite. Rule
    // 8 in practice: assert the declaration.
    const migration = sql("supabase/migrations/226_webhook_deliveries.sql");
    const createBlock = migration.slice(
      migration.indexOf("create table if not exists webhook_deliveries"),
      migration.indexOf("create index")
    );
    expect(createBlock.length).toBeGreaterThan(100);
    for (const column of ["incoming_text", "reply_text", "message", "sender", "body", "token"]) {
      expect(
        new RegExp(String.raw`^\s*` + column + String.raw`\s`, "m").test(createBlock),
        `"${column}" must not be a column here`
      ).toBe(false);
    }
    // And the columns it DOES have are the five that were intended.
    for (const column of ["source", "entry_id", "dealership_id", "outcome", "detail"]) {
      expect(new RegExp(String.raw`^\s*` + column + String.raw`\s`, "m").test(createBlock), `${column} is missing`).toBe(true);
    }
  });

  it("a long detail is cut to a sentence", async () => {
    await recordDelivery(db(), {
      source: "meta-leads",
      outcome: "no_business_matched",
      detail: "x".repeat(DETAIL_CHARS + 500),
    });
    expect(deliveries[0].detail.length).toBe(DETAIL_CHARS);
  });

  it("whitespace is collapsed and an empty detail is null, not an empty string", async () => {
    await recordDelivery(db(), { source: "meta-leads", outcome: "handled", detail: "  two   words  " });
    expect(deliveries[0].detail).toBe("two words");
    await recordDelivery(db(), { source: "meta-leads", outcome: "handled", detail: "   " });
    expect(deliveries[1].detail).toBeNull();
  });
});

describe("5. RECORDING MUST NEVER BREAK THE REPLY", () => {
  it("A FAILING INSERT DOES NOT THROW", async () => {
    const broken = {
      from: () => ({
        insert: async () => {
          throw new Error("table missing");
        },
      }),
    } as any;
    await expect(recordDelivery(broken, { source: "meta-leads", outcome: "handled" })).resolves.toBeUndefined();
  });

  it("AND A FAILING DELIVERY LOG DOES NOT STOP A DM BEING ANSWERED", async () => {
    // The log exists to explain the product, not to become a new way
    // for it to break.
    connected();
    const client = db();
    const realFrom = client.from;
    client.from = (table: string) =>
      table === "webhook_deliveries"
        ? { insert: async () => { throw new Error("nope"); } }
        : realFrom(table);
    await handleAutoReplyEntry(
      { id: "page-1", messaging: [{ sender: { id: "s1" }, message: { text: "hi" } }] },
      client,
      "meta-leads"
    );
    expect(autoReplyRows).toHaveLength(1);
  });

  it("the one place a swallowed error is correct says that it is", () => {
    const src = sourceWithComments("src/lib/webhooks/deliveryLog.ts");
    expect(src).toMatch(/NEVER THROWS/);
    expect(src).toMatch(/only place in this file where/i);
  });
});

describe("6. THE MIGRATION", () => {
  const migration = () => sql("supabase/migrations/226_webhook_deliveries.sql");

  it("dealership_id IS NULLABLE — the whole point of the table", () => {
    expect(migration()).toMatch(/dealership_id uuid references dealerships\(id\) on delete cascade,\n/);
  });

  it("THE OUTCOME IS CONSTRAINED, so it can be counted", () => {
    const m = migration();
    expect(m).toMatch(/check \(outcome in \(/);
    for (const outcome of [
      "signature_rejected", "no_entry_id", "no_business_matched",
      "no_reply_token", "both_toggles_off", "nothing_to_reply_to", "handled",
    ]) {
      expect(m, `${outcome} must be an allowed outcome`).toContain(`'${outcome}'`);
    }
  });

  it("EVERY OUTCOME THE CODE WRITES IS ALLOWED BY THE CONSTRAINT", () => {
    // The failure this prevents is a check constraint rejecting a row
    // the code tries to write — which would make the diagnosis table
    // itself the thing that silently records nothing.
    const allowed = (migration().match(/'([a-z_]+)'/g) ?? []).map((s) => s.replace(/'/g, ""));
    const written = code("src/lib/webhooks/deliveryLog.ts");
    const declared = (written.match(/\| "([a-z_]+)"/g) ?? []).map((s) => s.replace(/\| "|"/g, ""));
    expect(declared.length).toBeGreaterThan(5);
    for (const outcome of declared) {
      expect(allowed, `the code can write "${outcome}" but the constraint forbids it`).toContain(outcome);
    }
  });

  it("RLS IS ON AND NOTHING CLIENT-SIDE MAY WRITE", () => {
    const m = migration();
    expect(m).toMatch(/enable row level security/);
    expect(m).toMatch(/for select using/);
    expect(m).not.toMatch(/for insert|for update|for delete/);
  });

  it("and it ships the query that answers the actual bug", () => {
    // The owner runs SQL by hand. A diagnosis table with no diagnosis
    // query is a table nobody reads.
    const withComments = sourceWithComments("supabase/migrations/226_webhook_deliveries.sql");
    expect(withComments).toMatch(/group by outcome/);
    expect(withComments).toMatch(/NO ROWS AT ALL means Meta never called/);
  });
});
