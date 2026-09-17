// Leads for any kind of business — industry-agnostic overhaul, Phase 1.
//
// APPROVED 2026-09-17: leads were built for a car dealership. Meta lead
// forms were read for vehicle_type / car_model only, every lead was scored
// on vehicle age, and every screen said Vehicle / Purchase Year / Ready to
// Call / Appointment Set. Now:
//  - what the lead wants is `interest`, everything else they told us is
//    `details` — nothing a form asked is dropped;
//  - one generic score plus one signal for the business model;
//  - stage NAMES come from a preset per business model, the stored stage
//    values (and what they mean) don't change.

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { mapLeadAnswers, scoreNewLead } from "@/lib/leads/leadIntake";
import { LEAD_PROFILES, STAGES, describeLeadDetails, leadProfileFor, stageLabel, leadInterest, detailsForPrompt } from "@/lib/leads/leadProfile";

// ---- a small in-memory Supabase ----------------------------------------
type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let inserts: { table: string; row: Row }[];
let updates: { table: string; values: Row }[];

function fakeSupabase() {
  const from = (table: string) => {
    let op: "select" | "insert" | "update" = "select";
    let payload: any = null;
    let head = false;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r: Row, i: number) => ({ id: `${table}-new-${i}`, ...r }));
        for (const r of list) {
          inserts.push({ table, row: r });
          (tables[table] ??= []).push(r);
        }
        return { data: single ? list[0] : list, error: null };
      }
      if (op === "update") {
        updates.push({ table, values: payload });
        for (const r of rows()) Object.assign(r, payload);
        return { data: null, error: null };
      }
      const found = rows();
      if (head) return { data: null, count: found.length, error: null };
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (opts?.head) head = true;
        return api;
      },
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      update: (v: any) => ((op = "update"), (payload = v), api),
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      gte: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] >= v), api),
      in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), api),
      order: () => api,
      limit: () => api,
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (resolve: any, reject: any) => Promise.resolve(run(false)).then(resolve, reject),
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => fakeSupabase() }));
vi.mock("@/lib/agents/slackAgent", () => ({ sendSlackNotification: vi.fn() }));
vi.mock("@/lib/webhooks/autoReplyHandler", () => ({ handleAutoReplyEntry: vi.fn() }));
vi.mock("@/lib/agents/vapiCallAgent", () => ({ triggerVapiCall: vi.fn(async () => ({})) }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: vi.fn() }));
vi.mock("@/lib/agents/touchpointAgent", () => ({ recordFirstTouchpoint: vi.fn(), bridgeVisitorTouchpoints: vi.fn() }));
vi.mock("@/lib/audit/logAuditEvent", () => ({ logAuditEvent: vi.fn() }));

beforeEach(() => {
  tables = {};
  inserts = [];
  updates = [];
});

// ---- form answers → lead -----------------------------------------------
describe("mapLeadAnswers: nothing a form asked is dropped", () => {
  it("still reads an existing car form (vehicle_type → interest)", () => {
    const a = mapLeadAnswers({ full_name: "Ravi K", phone_number: "+919812345678", vehicle_type: "Scooter", budget: "₹80,000" });
    expect(a).toMatchObject({ name: "Ravi K", phone: "+919812345678", interest: "Scooter", budget: 80000 });
  });

  it("reads a clinic's treatment question and keeps its other questions as details", () => {
    const a = mapLeadAnswers({ "Full Name": "Asha", Email: "asha@example.com", "Which treatment?": "Laser hair removal", "Preferred date": "2 Oct", city: "Pune" });
    expect(a.interest).toBe("Laser hair removal");
    expect(a.email).toBe("asha@example.com");
    expect(a.details).toEqual({ preferred_date: "2 Oct", city: "Pune" });
  });

  it("reads a B2B form's company, size and job title", () => {
    const a = mapLeadAnswers({ first_name: "Neha", last_name: "Rao", requirement: "500 branded mugs", company_name: "Acme Pvt Ltd", number_of_employees: "51-200", designation: "HR Manager" });
    expect(a.name).toBe("Neha Rao");
    expect(a.interest).toBe("500 branded mugs");
    expect(a.details).toEqual({ company: "Acme Pvt Ltd", company_size: "51-200", job_title: "HR Manager" });
  });

  it("matches interest on whole words, so a timing question isn't mistaken for a plan", () => {
    const a = mapLeadAnswers({ when_are_you_planning_to_start: "Next month", which_plan: "Annual" });
    expect(a.interest).toBe("Annual");
    expect(a.details).toEqual({ when_are_you_planning_to_start: "Next month" });
  });

  it("keeps a second interest-like answer as a detail instead of overwriting the first", () => {
    const a = mapLeadAnswers({ service: "Deep cleaning", package: "Gold" });
    expect(a.interest).toBe("Deep cleaning");
    expect(a.details).toEqual({ package: "Gold" });
  });

  it("ignores blank answers and a budget with no number in it", () => {
    const a = mapLeadAnswers({ name: "X", interest: "  ", budget: "not sure", company: "" });
    expect(a.interest).toBeNull();
    expect(a.budget).toBeNull();
    expect(a.details).toEqual({});
  });
});

// ---- scoring --------------------------------------------------------------
describe("scoreNewLead: generic core + one business-model signal", () => {
  const base = { phone: null, email: null, interest: null, budget: null, details: {} as Record<string, string> };

  it("scores reachability, a stated interest, intent of the source and a budget", () => {
    const s = scoreNewLead({ ...base, phone: "+919812345678", email: "a@b.co", interest: "Facial", budget: 3000, source: "website" }, []);
    expect(s.score).toBe(25 + 15 + 20 + 15 + 10);
    expect(s.temperature).toBe("hot");
    expect(s.reason).toMatch(/^Reachable by phone and email/);
    expect(s.reason).toMatch(/Facial/);
  });

  it("gives an uploaded list less for source than an inbound enquiry", () => {
    const csv = scoreNewLead({ ...base, phone: "9812345678", source: "csv_upload" }, []);
    const inbound = scoreNewLead({ ...base, phone: "9812345678", source: "meta_ads_paid" }, []);
    const other = scoreNewLead({ ...base, phone: "9812345678", source: "referral" }, []);
    expect([csv.score, other.score, inbound.score]).toEqual([30, 35, 40]);
  });

  it("never scores on a vehicle's age — a purchase year adds nothing", () => {
    const withYear = scoreNewLead({ ...base, phone: "9812345678", details: { purchase_year: "2012" }, source: "website" }, ["products"]);
    const without = scoreNewLead({ ...base, phone: "9812345678", source: "website" }, ["products"]);
    expect(withYear.score).toBe(without.score);
  });

  it("adds the B2B signal only for a B2B business", () => {
    const lead = { ...base, phone: "9812345678", details: { company: "Acme" }, source: "website" };
    expect(scoreNewLead(lead, ["b2b"]).score - scoreNewLead(lead, ["products"]).score).toBe(15);
  });

  it("adds the services signal for a preferred date, and the subscription signal for a current solution", () => {
    const dated = { ...base, phone: "9812345678", details: { preferred_date: "Fri" }, source: "website" };
    expect(scoreNewLead(dated, ["services"]).score - scoreNewLead(dated, []).score).toBe(10);
    const switching = { ...base, phone: "9812345678", details: { current_solution: "Rival app" }, source: "website" };
    expect(scoreNewLead(switching, ["subscription"]).score - scoreNewLead(switching, []).score).toBe(10);
  });

  it("uses the 70 / 45 temperature bands", () => {
    // phone 25 + interest 20 + inbound 15 = 60 → warm; + budget 10 = 70 → hot; phone + other source = 35 → cold
    expect(scoreNewLead({ ...base, phone: "9812345678", interest: "X", source: "website" }, []).temperature).toBe("warm");
    expect(scoreNewLead({ ...base, phone: "9812345678", interest: "X", budget: 1, source: "website" }, []).temperature).toBe("hot");
    expect(scoreNewLead({ ...base, phone: "9812345678", source: "referral" }, []).temperature).toBe("cold");
    expect(scoreNewLead({ ...base, phone: "9812345678", interest: "X", source: "csv_upload" }, []).score).toBe(50);
  });
});

// ---- presets --------------------------------------------------------------
describe("lead profiles: each business sees its own names, stored values stay", () => {
  it("every preset names all six stored stages", () => {
    for (const p of Object.values(LEAD_PROFILES)) expect(Object.keys(p.stages).sort()).toEqual([...STAGES].sort());
  });

  it("has no dealership wording in any preset", () => {
    const text = JSON.stringify(LEAD_PROFILES);
    expect(text).not.toMatch(/vehicle|test ride|test drive|showroom|ready to call|appointment set/i);
  });

  it("an unset business gets the general profile", () => {
    const p = leadProfileFor([]);
    expect(p.key).toBe("general");
    expect(p.interestLabel).toBe("Interest");
    expect(p.stages.converted).toBe("Converted");
  });

  it("the most specific model names the stages; every model's details are asked for", () => {
    const p = leadProfileFor(["products", "services", "b2b"]);
    expect(p.key).toBe("b2b");
    expect(p.stages.converted).toBe("Deal won");
    expect(p.fields.map((f) => f.key)).toEqual(["company", "job_title", "company_size", "budget", "preferred_date"]);
    expect(p.models).toEqual(["products", "services", "b2b"]);
  });

  it("services beats products; subscription beats services", () => {
    expect(leadProfileFor(["products", "services"]).stages.converted).toBe("Became a client");
    expect(leadProfileFor(["services", "subscription"]).stages.appointment_set).toBe("Trial or demo booked");
    expect(leadProfileFor(["products"]).stages.appointment_set).toBe("Visit booked");
  });

  it("stageLabel shows an unknown stored value readably", () => {
    expect(stageLabel(LEAD_PROFILES.b2b, "not_interested")).toBe("Lost");
    expect(stageLabel(LEAD_PROFILES.b2b, "on_hold")).toBe("On hold");
  });

  it("describeLeadDetails lists the profile's fields first, then whatever else the lead said", () => {
    const out = describeLeadDetails({ budget: 250000, details: { city: "Pune", company: "Acme", purchase_year: 2019 } }, leadProfileFor(["b2b"]));
    expect(out).toEqual([
      { label: "Company", value: "Acme" },
      { label: "Budget", value: "₹2,50,000" },
      { label: "City", value: "Pune" },
      { label: "Purchase year", value: "2019" },
    ]);
  });

  it("reads an older record's vehicle as its interest", () => {
    expect(leadInterest({ interest: null, vehicle: "Honda City" })).toBe("Honda City");
    expect(leadInterest({ interest: "Mugs", vehicle: "Honda City" })).toBe("Mugs");
    expect(leadInterest({ interest: " ", vehicle: null })).toBeNull();
    expect(detailsForPrompt({ company: "Acme", blank: "", preferred_date: "Fri" })).toBe("Company: Acme; Preferred date: Fri");
  });
});

// ---- Meta lead webhook, end to end -----------------------------------------
describe("Meta lead webhook keeps every answer and scores for the business", () => {
  const SECRET = "test-app-secret";
  function signed(body: string) {
    return new Request("https://example.test/api/webhooks/meta-leads", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": "sha256=" + crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex") },
    });
  }
  const delivery = JSON.stringify({ entry: [{ id: "page-1", changes: [{ value: { leadgen_id: "lg-1", campaign_id: "c-1", ad_id: "a-1" } }] }] });

  beforeEach(() => {
    process.env.FACEBOOK_APP_SECRET = SECRET;
    tables.dealerships = [{ id: "biz-1", fb_page_id: "page-1", fb_page_access_token: "tok", business_models: ["b2b"] }];
    tables.products = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      field_data: [
        { name: "full_name", values: ["Neha Rao"] },
        { name: "phone_number", values: ["+919812345678"] },
        { name: "what_do_you_need", values: ["ignored-by-name"] },
        { name: "requirement", values: ["500 branded mugs"] },
        { name: "company_name", values: ["Acme Pvt Ltd"] },
      ],
    }), { status: 200 })));
  });

  it("inserts the lead with interest, details and a B2B-aware score", async () => {
    vi.doMock("@/lib/crypto/oauthSecrets", () => ({ readMetaPageToken: () => "tok" }));
    const { POST } = await import("@/app/api/webhooks/meta-leads/route");
    const res = await POST(signed(delivery));
    expect(res.status).toBeLessThan(300);
    const lead = inserts.find((i) => i.table === "leads")?.row;
    expect(lead).toMatchObject({
      dealership_id: "biz-1",
      name: "Neha Rao",
      interest: "500 branded mugs",
      details: { what_do_you_need: "ignored-by-name", company: "Acme Pvt Ltd" },
      source: "meta_ads_paid",
    });
    expect(lead).not.toHaveProperty("vehicle");
    // phone 25 + interest 20 + inbound 15 + company (b2b) 15
    expect(lead!.ai_score).toBe(75);
    expect(lead!.qualification_reason).toMatch(/named their company/);
  });

  it("a repeat submission merges details and doesn't blank out an earlier answer", async () => {
    tables.leads = [{ id: "lead-old", dealership_id: "biz-1", phone: "+919812345678", interest: "Old ask", email: "old@x.co", budget: 9000, details: { city: "Pune" }, created_at: new Date().toISOString() }];
    const { POST } = await import("@/app/api/webhooks/meta-leads/route");
    await POST(signed(delivery));
    expect(inserts.filter((i) => i.table === "leads")).toHaveLength(0);
    const merged = tables.leads[0];
    expect(merged.details).toEqual({ city: "Pune", what_do_you_need: "ignored-by-name", company: "Acme Pvt Ltd" });
    expect(merged.interest).toBe("500 branded mugs");
    expect(merged.email).toBe("old@x.co");
    expect(merged.budget).toBe(9000);
  });
});

// ---- public website form --------------------------------------------------
describe("website lead form saves what the visitor wants", () => {
  beforeEach(() => {
    tables.landing_pages = [{ slug: "glow", dealership_id: "biz-2", published: true }];
    tables.dealerships = [{ id: "biz-2", business_models: ["services"], auto_call_new_leads: false }];
    tables.products = [];
    tables.leads = [];
  });
  const post = (body: Row) => new Request("https://example.test/api/public/leads", { method: "POST", body: JSON.stringify(body) });

  it("stores interest (never vehicle) and scores it", async () => {
    const { POST } = await import("@/app/api/public/leads/route");
    await POST(post({ slug: "glow", name: "Asha", phone: "+919800000001", interest: "Bridal makeup" }));
    const lead = inserts.find((i) => i.table === "leads")!.row;
    expect(lead.interest).toBe("Bridal makeup");
    expect(lead).not.toHaveProperty("vehicle");
    expect(lead.ai_score).toBe(25 + 20 + 15);
  });

  it("still accepts the old `vehicle` field from pages rendered before the change", async () => {
    const { POST } = await import("@/app/api/public/leads/route");
    await POST(post({ slug: "glow", name: "Asha", phone: "+919800000002", vehicle: "Hair spa" }));
    expect(inserts.find((i) => i.table === "leads")!.row.interest).toBe("Hair spa");
  });
});

// ---- live-call update_lead tool ---------------------------------------------
describe("update_lead call tool writes the generic fields", () => {
  async function callTool(args: Row) {
    const { handleVapiToolCalls } = await import("@/lib/businessBrain/toolDispatcher");
    return handleVapiToolCalls(
      { toolCallList: [{ id: "t1", function: { name: "update_lead", arguments: JSON.stringify(args) } }] },
      { supabase: fakeSupabase(), dealershipId: "biz-1", leadId: "lead-1" }
    );
  }

  beforeEach(() => {
    tables.leads = [{ id: "lead-1", dealership_id: "biz-1", details: { city: "Pune" } }];
  });

  it("saves interest and merges company / preferred date into details", async () => {
    await callTool({ interest: "Annual contract", company: "Acme", preferredDate: "next Monday" });
    expect(tables.leads[0]).toMatchObject({ interest: "Annual contract", details: { city: "Pune", company: "Acme", preferred_date: "next Monday" } });
    expect(tables.leads[0]).not.toHaveProperty("vehicle");
  });

  it("maps the old vehicle / purchaseYear arguments onto interest and details", async () => {
    await callTool({ vehicle: "Scooter", purchaseYear: 2018 });
    expect(tables.leads[0]).toMatchObject({ interest: "Scooter", details: { city: "Pune", purchase_year: 2018 } });
    expect(tables.leads[0]).not.toHaveProperty("purchase_year");
  });

  it("the tool offered to the AI no longer asks about vehicles", async () => {
    const { BUSINESS_BRAIN_TOOLS } = await import("@/lib/businessBrain/toolRegistry");
    const tool = BUSINESS_BRAIN_TOOLS.find((t) => t.name === "update_lead")!;
    expect(Object.keys(tool.parameters)).toEqual(expect.arrayContaining(["interest", "company", "preferredDate", "currentSolution"]));
    expect(JSON.stringify(tool)).not.toMatch(/vehicle|purchase/i);
  });
});

// ---- demo data ----------------------------------------------------------------
describe("sample data fits the business", () => {
  it("has no vehicles, and B2B samples carry companies", async () => {
    const { generateSeedLeads, generateSeedCalls, generateSeedAppointments } = await import("@/lib/seed-data");
    const leads = generateSeedLeads("biz-1", ["b2b"]);
    // Values only — every row's dealership_id key would match otherwise.
    const text = JSON.stringify([leads, generateSeedCalls(["l1", "l2", "l3"], "biz-1"), generateSeedAppointments(["l1"], "biz-1")], (k, v) => (k === "dealership_id" ? undefined : v));
    expect(text).not.toMatch(/vehicle|test ride|test drive|showroom|dealership|RC book/i);
    expect(leads.some((l) => l.details.company)).toBe(true);
    expect(leads.every((l) => typeof l.interest === "string" && l.ai_score > 0)).toBe(true);
  });
});

// ---- screens --------------------------------------------------------------------
describe("no screen hard-codes dealership lead wording", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(tsx?)$/.test(f) ? [p] : [];
    });
  }
  const screens = [
    "src/components/leads",
    "src/components/team/SalesLeadsView.tsx",
    "src/components/dashboard/RecentActivity.tsx",
    "src/app/dashboard/leads",
    "src/app/dashboard/pipeline",
    "src/app/dashboard/queue",
    "src/app/dashboard/retention",
    "src/app/dashboard/calls",
  ].flatMap((p) => (statSync(p).isDirectory() ? files(p) : [p]));

  it.each(screens)("%s", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/"Ready to Call"|"Appointment Set"|>Vehicle<|"Vehicle"|Purchase Year|Unknown vehicle|replacement probability/);
  });

  it("the migration keeps the old columns and copies them across", () => {
    const sql = readFileSync("supabase/migrations/187_lead_interest_details.sql", "utf8");
    expect(sql).toMatch(/add column if not exists interest text/);
    expect(sql).toMatch(/add column if not exists details jsonb not null default '\{\}'::jsonb/);
    expect(sql).toMatch(/set interest = vehicle/);
    expect(sql).not.toMatch(/drop column/i);
  });
});
