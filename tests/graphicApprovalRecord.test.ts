// G-3 step 1b: the image card's decision is the server's now.
//
// The card used to carry {endpoint, payload} for the browser to POST.
// That made it the BROWSER's decision: the price, the confirm sentence
// and the depiction note were all client strings, and a request sent
// straight to /api/graphic-design/generate with the same payload skipped
// every one of them. Nothing server-side recorded that the owner had
// agreed to spend anything.
//
// Threat model, from PLAN-G3 §2a: this closes T1 (replay the card's
// payload), T2 (press without reading — the words are now on record),
// T3 (no audit trail), T4 (a client loop presses N times) and T6 (the
// agreed rupee amount was unverifiable). It does NOT close U2: the
// Graphic Design page still calls the endpoint with no approval row, on
// purpose, because a press on that page IS the owner's decision.

import { describe, it, expect, vi, beforeEach } from "vitest";

const generateDesign = vi.fn(async (..._a: any[]) => ({ ok: true, url: "https://cdn.example/made.png", id: "g1" }));
vi.mock("@/lib/graphicDesign/generateDesign", () => ({
  generateDesign: (...a: any[]) => generateDesign(...a),
}));

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; op: string; values: Row }[];

function db(): any {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, in: () => api, is: () => api, not: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (v: Row) => ((op = "insert"), (values = v), writes.push({ table, op, values: v }), api),
      update: (v: Row) => ((op = "update"), (values = v), writes.push({ table, op, values: v }), api),
      single: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

// executeTool reaches the generation-usage recorder on its way to the
// tool case, and that writes with .upsert which this stub has no reason
// to grow. Mocked exactly as tests/graphicEndpointGuard.test.ts does.
vi.mock("@/lib/usage/generationLimits", () => ({
  checkAndRecordGenerationUsage: async () => ({ allowed: true }),
  generationLimitMessage: () => "over the cap",
}));

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));

import { requestApproval } from "@/lib/chat/requestApproval";
import { executeTool, extractArtifact } from "@/lib/agents/masterBrainV2";
import { isSimpleConfirmation } from "@/lib/chat/cardLayout";
import { getActionPolicy } from "@/lib/executionPolicy";
import { code } from "./helpers/source";

beforeEach(() => {
  generateDesign.mockClear();
  writes = [];
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "Test Business" }],
    pending_approvals: [],
    products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", images: [], inventory_count: 5, is_active: true, order_index: 0 }],
    brand_profiles: [{ tone_of_voice: "warm" }],
    brand_kits: [], websites: [], business_knowledge: [], graphic_designs: [],
    discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [],
    website_pages: [], team_members: [], business_memory: [], content_pieces: [],
  };
  process.env.NEXT_PUBLIC_GRAPHIC_DESIGN_ENABLED = "true";
});

describe("the action is classified, so the registry cannot be bypassed", () => {
  it("generate_graphic IS IN ACTION_POLICIES and requires approval", () => {
    // requestApproval refuses an action nobody has classified, so
    // without this entry the card could not be created at all.
    const policy = getActionPolicy("generate_graphic");
    expect(policy).toBeTruthy();
    expect(policy!.requiresApproval).toBe(true);
  });

  it("it is HIGH, not critical, and the reason is bounded cost", () => {
    // The plan cap runs inside generateDesign, so the worst case is the
    // month's image allowance — and nothing reaches a customer.
    expect(getActionPolicy("generate_graphic")!.riskLevel).toBe("high");
  });
});

describe("the row carries what was agreed to", () => {
  const ask = () =>
    requestApproval(db(), "d1", {
      actionType: "generate_graphic",
      details: { design_type: "poster", prompt: "A lavender candle", confirm: "This makes one AI image now. It costs about ₹3.39 and counts against your plan's monthly image allowance." },
      amount: 3.39,
      requestedBy: "graphic_design_agent",
      confirm: "This makes one AI image now. It costs about ₹3.39 and counts against your plan's monthly image allowance.",
    });

  it("A ROW IS WRITTEN, AND NOTHING IS GENERATED", async () => {
    const r = await ask();
    expect("error" in r).toBe(false);
    expect((r as any).approvalId).toBeTruthy();
    expect(generateDesign).not.toHaveBeenCalled();
  });

  it("THE RUPEE AMOUNT IS ON THE ROW, where the authority threshold can read it", async () => {
    // Until this commit the agreed price existed only as a string in a
    // browser label. That is threat T6.
    await ask();
    const row = writes.find((w) => w.table === "pending_approvals")!.values;
    expect(row.amount).toBe(3.39);
  });

  it("AND SO ARE THE WORDS THE OWNER WAS SHOWN", async () => {
    // "Who approved this and what did it say" has to be answerable from
    // the row, not from a client string that happened to resemble it.
    await ask();
    const row = writes.find((w) => w.table === "pending_approvals")!.values;
    expect(row.action_details.confirm).toMatch(/₹3\.39/);
    expect(row.action_details.confirm).toMatch(/monthly image allowance/);
    expect(row.action_details.design_type).toBe("poster");
    expect(row.action_details.prompt).toBe("A lavender candle");
  });

  it("the row says which part of the product asked", async () => {
    await ask();
    const row = writes.find((w) => w.table === "pending_approvals")!.values;
    expect(row.requested_by_agent).toBe("graphic_design_agent");
    expect(row.action_type).toBe("generate_graphic");
  });

  it("THE NOTE TELLS THE MODEL NOTHING HAS HAPPENED", async () => {
    // Finding F-X1: without this the model narrates a pending row as a
    // completed action.
    const r = await ask();
    expect((r as any).note).toMatch(/NOTHING HAS HAPPENED YET/);
  });
});

describe("the chat tool no longer hands the browser a spending endpoint", () => {
  const brain = () => code("src/lib/agents/masterBrainV2.ts");

  it("THE IMAGE CARD CARRIES NO publish DESCRIPTOR", () => {
    // Executed end-to-end in tests/chatPublish.test.ts, which asserts
    // quote.publish is undefined and quote.approval.id is set. This is
    // the cheap guard that the descriptor is not quietly reintroduced.
    // Sliced FORWARD from the card, because "case \"build_website\"" also
    // appears earlier in executeTool and slicing to it produced an empty
    // string that matched nothing — a test that passes on emptiness is
    // worse than no test.
    const src = brain();
    const at = src.indexOf('type: "image_quote"');
    expect(at).toBeGreaterThan(-1);
    const card = src.slice(at, at + 700);
    expect(card).not.toMatch(/imageGenerateAction/);
    expect(card).toMatch(/approval: \{ id: result\.approvalId \}/);
  });

  it("and it goes through requestApproval, not through a sender", () => {
    const src = brain();
    const tool = src.slice(src.indexOf('case "generate_graphic": {'), src.indexOf('case "get_customer_sentiment"'));
    expect(tool).toMatch(/requestApproval\(/);
    // The tool must not generate. It quotes and asks.
    expect(tool).not.toMatch(/generateDesign\(/);
    expect(tool).not.toMatch(/generateGraphic\(/);
  });

  it("THE HOLD IS STILL CHECKED BEFORE A ROW IS EVEN OFFERED", () => {
    const src = brain();
    const tool = src.slice(src.indexOf('case "generate_graphic": {'), src.indexOf('case "get_customer_sentiment"'));
    expect(tool.indexOf("isFeatureEnabled")).toBeLessThan(tool.indexOf("requestApproval("));
  });
});

describe("the approvals route is the only path to spending", () => {
  const route = () => code("src/app/api/approvals/[id]/route.ts");

  it("IT CALLS THE EXTRACTED FUNCTION, not this app over HTTP", () => {
    // A route fetching its own app gets a Vercel 508 after about four
    // hops, which this codebase already rebuilt away from once.
    const src = route();
    expect(src).toMatch(/generate_graphic/);
    expect(src).toMatch(/generateDesign\(/);
    const branch = src.slice(src.indexOf('action_type === "generate_graphic"'), src.indexOf('action_type === "create_discount_code"'));
    expect(branch).not.toMatch(/fetch\(/);
  });

  it("A FAILED GENERATION DOES NOT MARK THE APPROVAL APPROVED", () => {
    // The row stays pending so the owner can press again once the reason
    // is gone — rather than being told it worked. Same shape as every
    // other branch in that route.
    const src = route();
    const branch = src.slice(src.indexOf('action_type === "generate_graphic"'), src.indexOf('action_type === "create_discount_code"'));
    expect(branch).toMatch(/if \(!made\.ok\) return NextResponse\.json/);
    expect(branch).toMatch(/status: made\.status/);
  });

  it("the plan cap is re-checked at the press, not at the card", () => {
    // generateDesign runs checkAndRecordGenerationUsage itself, so an
    // owner who used up the allowance between the card and the press is
    // refused now. Proved by execution in
    // tests/graphicEndpointGuard.test.ts; named here so the reason is
    // beside the branch that relies on it.
    const design = code("src/lib/graphicDesign/generateDesign.ts");
    expect(design).toMatch(/checkAndRecordGenerationUsage\(dealershipId/);
  });
});

describe("what this deliberately does NOT close", () => {
  it("THE GRAPHIC DESIGN PAGE STILL CALLS THE ENDPOINT WITH NO ROW", () => {
    // U2 in the threat model, and it is a choice. A press on that page
    // IS the owner's decision, made on a page that shows them the thing.
    // Requiring a row would mean breaking that component or adding a
    // bypass flag, and a bypass flag in an authorisation check is how
    // authorisation checks die.
    const view = code("src/components/graphic-design/GraphicDesignView.tsx");
    expect(view).toMatch(/\/api\/graphic-design\/generate/);
    expect(view).not.toMatch(/approvals/);
  });

  it("and the endpoint itself still accepts a direct call", () => {
    // Stated rather than implied: T1 closes for the CHAT path. The
    // endpoint is as reachable as it was.
    const r = code("src/app/api/graphic-design/generate/route.ts");
    expect(r).toMatch(/export async function POST/);
    expect(r).not.toMatch(/pending_approvals/);
  });
});

describe("THE CHAT TOOL ITSELF, run for real", () => {
  // The tests above call requestApproval with hand-written arguments, so
  // four mutations inside the TOOL survived them: the rupee amount left
  // off the row, the agreed words left off, the hold moved after the
  // row, and the card not showing the cost. This block runs the tool.
  const CTX: any = { id: "d1", name: "Test Business", category: "Home fragrance", toneOfVoice: "warm", city: "Lucknow" };
  const run = () => executeTool(db(), CTX, "generate_graphic", { designType: "poster", prompt: "A lavender candle" }, "");

  it("THE RUPEE AMOUNT REACHES THE ROW", async () => {
    await run();
    const row = writes.find((w) => w.table === "pending_approvals")!.values;
    expect(typeof row.amount).toBe("number");
    expect(row.amount).toBeGreaterThan(0);
  });

  it("AND THE WORDS THE OWNER WILL SEE REACH IT TOO", async () => {
    await run();
    const row = writes.find((w) => w.table === "pending_approvals")!.values;
    expect(row.action_details.confirm).toMatch(/costs about ₹/);
    expect(row.action_details.confirm).toMatch(/monthly image allowance/);
  });

  it("the design type and the STRIPPED prompt are on the row", async () => {
    await run();
    const row = writes.find((w) => w.table === "pending_approvals")!.values;
    expect(row.action_details.design_type).toBe("poster");
    expect(row.action_details.prompt).toBe("A lavender candle");
  });

  it("an unbacked claim never makes it onto the row", async () => {
    const r = await executeTool(db(), CTX, "generate_graphic", { designType: "poster", prompt: "India's number 1 candle. A lavender candle." }, "");
    const row = writes.find((w) => w.table === "pending_approvals")!.values;
    expect(row.action_details.prompt).not.toMatch(/number 1/i);
    expect((r as any)._claimsNote).toBeTruthy();
  });

  it("NO ROW IS WRITTEN WHEN THE HOLD IS ON", async () => {
    // The hold must be checked BEFORE a row is offered, or the owner is
    // shown an Approve button for something the product has switched off.
    delete process.env.NEXT_PUBLIC_GRAPHIC_DESIGN_ENABLED;
    const r = await run();
    expect((r as any).unavailable).toBe(true);
    expect(writes.filter((w) => w.table === "pending_approvals")).toEqual([]);
  });

  it("THE CARD CARRIES THE CONFIRM, and reaches a layout that draws it", async () => {
    // The approval strip in MasterChatPage renders in the compact branch
    // too, which is what the cardLayout incident was about: a field
    // present in the file and unreachable from the card.
    const r: any = await run();
    const card = extractArtifact("generate_graphic", { designType: "poster" }, r)!;
    expect(card.approval?.id).toBeTruthy();
    expect(card.confirm).toMatch(/costs about ₹/);
    // And the strip that shows it is not gated on the non-compact layout.
    const page = code("src/components/chat/MasterChatPage.tsx");
    const strip = page.slice(page.indexOf("const approvalStrip ="), page.indexOf("const approvalStrip =") + 900);
    expect(strip).toMatch(/artifact\.confirm/);
    void isSimpleConfirmation;
  });
});
