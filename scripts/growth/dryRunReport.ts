// THE DAILY REPORT, BUILT FROM REAL DATA, SENT NOWHERE — S4/P4.
//
// The founder asked to see the content before anything is wired to
// send. This machine has no Supabase credentials, so the data comes
// from one SQL query he runs and pastes into a file, and the REAL audit,
// tracking, maturity, strategy and report code runs over it here.
//
//   npx tsx scripts/growth/dryRunReport.ts <path-to.json>
//
// IT IS THE REAL CODE, NOT A REIMPLEMENTATION. auditSite,
// auditCatalogue and checkTracking take a Supabase client, so they get
// one backed by the pasted JSON. If the audit has a bug, this shows the
// bug rather than hiding it behind a second description — which is the
// mistake this project has paid for four times.
//
// NOTHING IS WRITTEN AND NOTHING IS SENT. recordFindings, pickToday and
// sendDealerEmail are not called. The findings stay in memory, so the
// `opportunities` table is untouched and no cooldown is started. M9 is
// not here either: its free layer needs the page bodies, which would
// make the paste large, and its paid layer costs money.

import { readFileSync } from "node:fs";
import { auditCatalogue, auditSite } from "../../src/lib/growth/audit";
import { checkTracking } from "../../src/lib/growth/tracking";
import { maturityOf, setupGoalsFrom } from "../../src/lib/growth/strategy";
import { buildDailyReport, everyNumberIsCounted, renderText } from "../../src/lib/growth/report";
import { indiaToday } from "../../src/lib/expertise/seasonalCalendar";

type DryRunInput = {
  business: { id: string; name: string; sc_access: boolean; sc_refresh: boolean; sc_site_url: string | null } | null;
  site: { id: string; slug: string; published: boolean } | null;
  pages: any[];
  products: any[];
  events: { visitor_30d: number; first_at: string | null; last_at: string | null };
  campaigns: number;
  paid_orders_30d: number;
  goals: { id: string; title: string; status: string }[];
};

/** A read-only client over the pasted JSON, in the shapes the real code uses. */
function clientFor(input: DryRunInput) {
  const dealershipId = input.business?.id ?? "unknown";
  // page_events rows are synthesised from the counts, because the query
  // returns counts rather than thousands of rows. The earliest and the
  // latest are real; the ones between only need to exist to be counted.
  const events: { created_at: string }[] = [];
  if (input.events.visitor_30d > 0) {
    events.push({ created_at: input.events.first_at ?? input.events.last_at ?? new Date().toISOString() });
    for (let i = 1; i < input.events.visitor_30d; i += 1) {
      events.push({ created_at: input.events.last_at ?? new Date().toISOString() });
    }
  }
  const connected = Boolean(input.business?.sc_access && input.business?.sc_refresh);

  const tables: Record<string, any[]> = {
    websites: input.site ? [{ ...input.site, dealership_id: dealershipId }] : [],
    website_pages: input.pages.map((p) => ({ ...p, website_id: input.site?.id })),
    products: input.products.map((p) => ({ ...p, dealership_id: dealershipId })),
    page_events: events.map((e) => ({ ...e, dealership_id: dealershipId, is_internal: false })),
    ad_creatives: Array.from({ length: input.campaigns }, (_, i) => ({ id: `c${i}`, dealership_id: dealershipId })),
    orders: Array.from({ length: input.paid_orders_30d }, (_, i) => ({
      id: `o${i}`,
      dealership_id: dealershipId,
      payment_status: "paid",
      created_at: input.events.last_at ?? new Date().toISOString(),
    })),
    dealerships: [
      {
        id: dealershipId,
        // The booleans from SQL, turned back into what readToken reads.
        // No real token is ever pasted or printed.
        search_console_access_token: connected ? "present" : null,
        search_console_refresh_token: connected ? "present" : null,
        search_console_access_token_encrypted: null,
        search_console_refresh_token_encrypted: null,
        search_console_site_url: input.business?.sc_site_url ?? null,
        search_console_token_expiry: null,
        search_console_email: null,
      },
    ],
    goals: input.goals,
  };

  return {
    from(table: string) {
      const filters: Record<string, any> = {};
      let asc: boolean | null = null;
      const rows = () => {
        let out = (tables[table] ?? []).filter((r) =>
          Object.entries(filters).every(([k, v]) => (k in r ? r[k] === v : true))
        );
        if (asc !== null) {
          out = [...out].sort((a, b) =>
            asc ? String(a.created_at).localeCompare(String(b.created_at)) : String(b.created_at).localeCompare(String(a.created_at))
          );
        }
        return out;
      };
      const chain: any = {
        select: () => chain,
        eq(c: string, v: any) { filters[c] = v; return chain; },
        gte: () => chain,
        in: () => chain,
        is: () => chain,
        order(_c: string, o?: { ascending?: boolean }) { asc = o?.ascending !== false; return chain; },
        limit: () => Promise.resolve({ data: rows(), error: null }),
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (resolve: any) => resolve({ data: rows(), error: null }),
        insert() { throw new Error("DRY RUN: nothing may be written"); },
        update() { throw new Error("DRY RUN: nothing may be written"); },
        upsert() { throw new Error("DRY RUN: nothing may be written"); },
        delete() { throw new Error("DRY RUN: nothing may be written"); },
      };
      return chain;
    },
  };
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: npx tsx scripts/growth/dryRunReport.ts <input.json>");
  const input = JSON.parse(readFileSync(path, "utf8")) as DryRunInput;

  if (!input.business || !input.site) {
    console.log("The query returned no business or no website. Check the slug in the SQL and run it again.");
    return;
  }

  const now = new Date();
  const client = clientFor(input) as any;

  console.log("=".repeat(70));
  console.log(`DRY RUN — ${input.business.name}   (site: /site/${input.site.slug})`);
  console.log("Nothing was written. Nothing was sent. No model was called.");
  console.log("=".repeat(70));

  const site = await auditSite(client, input.business.id);
  const catalogue = await auditCatalogue(client, input.business.id);
  const tracking = await checkTracking(client, input.business.id, now);
  const maturity = maturityOf({ firstAt: tracking.siteEvents.firstAt, events: tracking.siteEvents.visitorEvents30d }, now);

  const findings = [...site.findings, ...catalogue.findings];
  const counted = [...site.counted, ...catalogue.counted];
  const setupGoals = setupGoalsFrom(findings, counted);

  const report = buildDailyReport({
    dealershipId: input.business.id,
    day: indiaToday(now),
    businessName: input.business.name,
    tracking,
    maturity,
    counted,
    // Nothing is surfaced: that needs the Strategist, which writes.
    suggestions: [],
    setupGoals,
  });

  console.log();
  console.log(renderText(report));
  console.log();
  console.log("=".repeat(70));
  const check = everyNumberIsCounted(report);
  console.log(`EVERY NUMBER COUNTED?   ${check.ok ? "YES" : `NO — ${JSON.stringify(check.offenders)}`}`);
  console.log(`findings the audit made ${findings.length}   (${findings.map((f) => f.type).join(", ") || "none"})`);
  console.log(`setup goals drafted     ${setupGoals.length}`);
  console.log(`active goals on record  ${input.goals.length}   (a suggestion needs one, so 0 means setup steps only)`);
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
