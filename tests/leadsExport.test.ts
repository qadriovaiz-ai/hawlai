// Leads out as a CSV, from chat or the Leads page — safely.
//
// THE GAP (2026-09-16): asked to "export leads as CSV", chat told the owner
// to use the dashboard, where no leads export existed. Approved rules:
// owner and admins only; a signed-in download, never a stored or public
// file; do-not-contact and unsubscribed leads included and flagged. These
// run the real route, chat tool and CSV builder; only the database is
// faked.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let signedIn: string | null;
let failing: Set<string>;
let queries: { table: string; filters: string[]; range?: [number, number] }[];

function db() {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const described: string[] = [];
    let range: [number, number] | undefined;
    let orderBy: { key: string; asc: boolean } | null = null;
    const rows = () => {
      const matched = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (orderBy) matched.sort((a, b) => (String(a[orderBy!.key]) < String(b[orderBy!.key]) ? -1 : 1) * (orderBy!.asc ? 1 : -1));
      return range ? matched.slice(range[0], range[1] + 1) : matched;
    };
    const result = () => {
      queries.push({ table, filters: described, range });
      return failing.has(table) ? { data: null, error: { message: `${table} unavailable` } } : { data: rows(), error: null };
    };
    const api: any = {
      select: () => api, limit: () => api,
      order: (k: string, o?: { ascending?: boolean }) => ((orderBy = { key: k, asc: o?.ascending !== false }), api),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), described.push(`${k}=${v}`), api),
      gte: (k: string, v: any) => (filters.push((r) => new Date(r[k]) >= new Date(v)), described.push(`${k}>=${v}`), api),
      lte: (k: string, v: any) => (filters.push((r) => new Date(r[k]) <= new Date(v)), described.push(`${k}<=${v}`), api),
      not: (k: string, _op: string, _v: any) => (filters.push((r) => r[k] != null), described.push(`${k} not null`), api),
      range: (a: number, b: number) => ((range = [a, b]), api),
      maybeSingle: async () => {
        const r = result();
        return r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null };
      },
      single: async () => {
        const r = result();
        return r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null };
      },
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: signedIn ? { id: signedIn } : null } }) } };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));

import { csvCell, leadsToCsv, cleanFilters, fetchLeadsForExport, exportRole, exportFilename, CSV_HEADERS, NOT_ALLOWED } from "@/lib/leads/exportLeads";
import { GET as download } from "@/app/api/leads/export/route";
import { executeTool, extractArtifact } from "@/lib/agents/masterBrainV2";

const lead = (over: Row = {}): Row => ({
  dealership_id: "d1", name: "Asha", phone: "+91 98765 43210", email: "asha@example.com", source: "website", status: "new",
  lead_temperature: "hot", ai_score: 82, created_at: "2026-09-10T04:30:00Z", consent_status: "granted", consent_source: "csv_upload:purchase", dnd_opt_out: false, ...over,
});

const STORE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", owner_id: "owner-1" }],
  profiles: [
    { id: "owner-1", dealership_id: "d1" },
    { id: "admin-1", dealership_id: "d1" },
    { id: "mm-1", dealership_id: "d1" },
  ],
  team_members: [
    { dealership_id: "d1", user_id: "admin-1", role: "admin", status: "active" },
    { dealership_id: "d1", user_id: "mm-1", role: "marketing_manager", status: "active" },
    { dealership_id: "d1", user_id: "old-admin", role: "admin", status: "removed" },
  ],
  leads: [
    lead(),
    lead({ name: "Ravi", email: "RAVI@example.com", lead_temperature: "cold", dnd_opt_out: true, created_at: "2026-08-01T10:00:00Z" }),
    lead({ name: "मीरा", email: null, phone: "9876543210", source: "csv_upload", created_at: "2026-09-12T19:00:00Z" }),
    lead({ dealership_id: "d2", name: "Someone else's lead" }),
  ],
  email_suppressions: [{ dealership_id: "d1", email: "ravi@example.com" }],
});

const CTX: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [] };
const get = (query = "") => download(new Request(`https://hawlai.online/api/leads/export${query}`));

beforeEach(() => {
  tables = STORE();
  signedIn = "owner-1";
  failing = new Set();
  queries = [];
});
afterEach(() => vi.restoreAllMocks());

describe("the CSV itself", () => {
  it("has a header, every lead, the flags, India-time dates, CRLF lines and a BOM so Excel reads Hindi names", () => {
    const leads = STORE().leads.filter((l) => l.dealership_id === "d1") as any[];
    const csv = leadsToCsv(leads, new Set(["ravi@example.com"]));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      CSV_HEADERS.join(","),
      "Asha,+91 98765 43210,asha@example.com,website,new,hot,82,2026-09-10 10:00,granted,csv_upload:purchase,No,No",
      "Ravi,+91 98765 43210,RAVI@example.com,website,new,cold,82,2026-08-01 15:30,granted,csv_upload:purchase,Yes,Yes",
      "मीरा,9876543210,,csv_upload,new,hot,82,2026-09-13 00:30,granted,csv_upload:purchase,No,No",
      "",
    ]);
  });

  it.each([
    ['=HYPERLINK("http://evil.example","click")', `"'=HYPERLINK(""http://evil.example"",""click"")"`],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["+cmd|' /C calc'!A0", "'+cmd|' /C calc'!A0"],
    ["-2+3", "'-2+3"],
  ])("a cell a spreadsheet would run as a formula opens as text: %j", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it.each([
    ["+91 98765 43210", "+91 98765 43210"],
    ["-5", "-5"],
    ["Asha, Lucknow", '"Asha, Lucknow"'],
    ['Said "hi"', '"Said ""hi"""'],
    ["line one\nline two", '"line one\nline two"'],
    [null, ""],
    [82, "82"],
  ])("ordinary values are kept and quoted only when needed: %j", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it("the filename is the business, 'leads' and the date", () => {
    expect(exportFilename("candle_by_qaaf", "2026-09-16")).toBe("candle-by-qaaf-leads-2026-09-16.csv");
    expect(exportFilename(null, "2026-09-16")).toBe("hawlai-leads-2026-09-16.csv");
  });
});

describe("filters", () => {
  it("keeps valid ones and drops anything malformed, so nothing odd reaches a query", () => {
    expect(cleanFilters({ temperature: "HOT", status: "converted", source: "meta_lead_ad", from: "2026-09-01", to: "2026-09-15", hasEmail: true })).toEqual({
      temperature: "hot", status: "converted", source: "meta_lead_ad", from: "2026-09-01", to: "2026-09-15", hasEmail: true,
    });
    expect(cleanFilters({ temperature: "boiling", status: "new' or 1=1 --", source: "all", from: "2026-13", to: "yesterday", hasEmail: "maybe" })).toEqual({});
  });

  it("dates are India days: a lead at 00:30 IST on 13 Sep is on the 13th, not the 12th", async () => {
    const leads = await fetchLeadsForExport(db(), "d1", { from: "2026-09-13", to: "2026-09-13" });
    expect(leads.map((l) => l.name)).toEqual(["मीरा"]);
  });

  it("temperature, source and has-email narrow the rows; another business's leads never appear", async () => {
    expect((await fetchLeadsForExport(db(), "d1", {})).map((l) => l.name)).toEqual(["Ravi", "Asha", "मीरा"]);
    expect((await fetchLeadsForExport(db(), "d1", { temperature: "cold" })).map((l) => l.name)).toEqual(["Ravi"]);
    expect((await fetchLeadsForExport(db(), "d1", { source: "csv_upload" })).map((l) => l.name)).toEqual(["मीरा"]);
    expect((await fetchLeadsForExport(db(), "d1", { hasEmail: true })).map((l) => l.name)).toEqual(["Ravi", "Asha"]);
  });

  it("reads past Supabase's 1,000-row limit, a page at a time", async () => {
    tables.leads = Array.from({ length: 2345 }, (_, i) => lead({ name: `Lead ${i}`, created_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString() }));
    const leads = await fetchLeadsForExport(db(), "d1", {});
    expect(leads).toHaveLength(2345);
    expect(queries.filter((q) => q.table === "leads").map((q) => q.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
});

describe("who can export", () => {
  it.each([
    ["owner-1", "owner"],
    ["admin-1", "admin"],
    ["mm-1", null],
    ["old-admin", null],
    ["stranger", null],
    [null, null],
  ])("%s → %s", async (user, role) => {
    expect(await exportRole("d1", user)).toBe(role);
  });

  it("a failed check is an error, not a yes", async () => {
    failing.add("team_members");
    await expect(exportRole("d1", "admin-1")).rejects.toThrow("couldn't check team access");
  });
});

describe("the download", () => {
  it("an owner gets the file — as a download, never cached", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="candle-by-qaaf-leads-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("Ravi,+91 98765 43210,RAVI@example.com,website,new,cold,82,2026-08-01 15:30,granted,csv_upload:purchase,Yes,Yes");
    expect(body).not.toContain("Someone else's lead");
  });

  it("an admin can download; a marketing manager can't", async () => {
    signedIn = "admin-1";
    expect((await get()).status).toBe(200);
    signedIn = "mm-1";
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: NOT_ALLOWED });
  });

  it("nobody signed in gets nothing", async () => {
    signedIn = null;
    expect((await get()).status).toBe(401);
  });

  it("filters in the link narrow the file", async () => {
    const body = await (await get("?temperature=cold")).text();
    expect(body.trim().split("\r\n")).toHaveLength(2);
  });

  it("if the unsubscribe list can't be read, the export fails rather than flagging nobody", async () => {
    failing.add("email_suppressions");
    const res = await get();
    expect(res.status).toBe(500);
  });
});

describe("from chat", () => {
  it("the owner gets a download link on the card, with the count and filters", async () => {
    const r = await executeTool(db(), CTX, "export_leads", { temperature: "hot" }, "");
    expect(r).toMatchObject({ rowCount: 2, url: "/api/leads/export?temperature=hot", description: "hot leads" });
    expect(extractArtifact("export_leads", { temperature: "hot" }, r)).toEqual({
      kind: "link",
      label: "Download leads CSV — 2 leads",
      url: "/api/leads/export?temperature=hot",
      summary: "Hot leads. Do-not-contact and unsubscribed leads are included and flagged.",
      departmentHref: "/dashboard/leads",
    });
  });

  it("a marketing manager is told who can export — no link", async () => {
    signedIn = "mm-1";
    const r = await executeTool(db(), CTX, "export_leads", {}, "");
    expect(r).toEqual({ error: NOT_ALLOWED });
    expect(extractArtifact("export_leads", {}, r)).toBeNull();
  });

  it("no matching leads says so instead of offering an empty file", async () => {
    const r = await executeTool(db(), CTX, "export_leads", { source: "instagram_dm" }, "");
    expect(r.rowCount).toBe(0);
    expect(extractArtifact("export_leads", {}, r)).toMatchObject({ kind: "record", label: "Nothing to export" });
  });

  it("without a signed-in person (e.g. WhatsApp chat), it points to the app rather than guessing who's asking", async () => {
    signedIn = null;
    expect(await executeTool(db(), CTX, "export_leads", {}, "")).toEqual({ error: "Leads can be exported from the Hawlai app — open chat there and ask again." });
  });
});
