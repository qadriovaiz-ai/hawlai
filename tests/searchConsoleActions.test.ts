// The Search Console card can be reconnected and disconnected
// (2026-09-28).
//
// THE REPORT: once connected, the card showed a green tick and nothing
// else — no way to reconnect, no way to disconnect. The Meta card at
// least offers "Manage connection". That matters most in exactly the
// case an owner can't diagnose: a scope or permission problem, where the
// account is connected but reads nothing. Reconnect is the fix for all
// of those, because the connect route asks Google for consent every
// time and re-issues a refresh token.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";

import SearchConsoleActions from "@/components/settings/SearchConsoleActions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const render = (props: { connected: boolean; email: string | null; property: string | null }) =>
  renderToStaticMarkup(createElement(SearchConsoleActions, props));

describe("what the card offers once connected", () => {
  const html = render({ connected: true, email: "owner@example.com", property: "sc-domain:hawlai.online" });

  it("BOTH ACTIONS ARE THERE — this is what was missing", () => {
    expect(html).toContain("Reconnect");
    expect(html).toContain("Disconnect");
  });

  it("Reconnect goes back through consent, which is what fixes a scope error", () => {
    expect(html).toContain('href="/api/auth/search-console/connect"');
    const connectRoute = readFileSync("src/app/api/auth/search-console/connect/route.ts", "utf8");
    // Without prompt=consent, pressing Reconnect would silently reuse the
    // old grant and fix nothing.
    expect(connectRoute).toContain('"prompt", "consent"');
    expect(connectRoute).toContain('"access_type", "offline"');
  });

  it("still says whose account it is and what it reads", () => {
    expect(html).toContain("owner@example.com");
    expect(html).toContain("sc-domain:hawlai.online");
  });
});

describe("connected but reading nothing", () => {
  it("says so, and points at Reconnect as the way out", () => {
    const html = render({ connected: true, email: "owner@example.com", property: null });
    expect(html).toContain("No verified property matched");
    expect(html).toContain("then press Reconnect");
    // Both actions are still available in this state — it is the state
    // they are most needed in.
    expect(html).toContain("Reconnect");
    expect(html).toContain("Disconnect");
  });
});

describe("before connecting", () => {
  const html = render({ connected: false, email: null, property: null });

  it("offers Connect and nothing to disconnect", () => {
    expect(html).toContain("Connect");
    expect(html).not.toContain("Disconnect");
    expect(html).not.toContain("Reconnect");
  });
});

// ---- disconnecting ---------------------------------------------------------
describe("disconnecting asks first", () => {
  it("DOES NOT DISCONNECT ON ONE CLICK — it asks, and says what is lost", () => {
    const src = readFileSync("src/components/settings/SearchConsoleActions.tsx", "utf8");
    // The button sets a confirming state; only the confirm calls the route.
    expect(src).toContain("setConfirming(true)");
    expect(src).toMatch(/onClick=\{disconnect\}/);
    expect(src).toContain("Yes, disconnect");
    expect(src).toContain("Keep it");
    expect(src).toContain("goes back to being guesswork");
  });

  it("calls the real disconnect route, by POST", () => {
    const src = readFileSync("src/components/settings/SearchConsoleActions.tsx", "utf8");
    expect(src).toContain('fetch("/api/auth/search-console/disconnect", { method: "POST" })');
  });

  it("the route clears both halves of the token and the property", () => {
    const route = readFileSync("src/app/api/auth/search-console/disconnect/route.ts", "utf8");
    expect(route).toContain('tokenClear("search_console")');
    expect(route).toContain("search_console_site_url: null");
    expect(route).toContain("search_console_email: null");
    // And it is scoped to the caller's own business.
    expect(route).toContain('.eq("id", dealershipId)');
  });

  it("PASSES ON THE ROUTE'S OWN NOTE — access still exists at Google until they remove it there", () => {
    const src = readFileSync("src/components/settings/SearchConsoleActions.tsx", "utf8");
    expect(src).toContain("data?.note");
    const route = readFileSync("src/app/api/auth/search-console/disconnect/route.ts", "utf8");
    expect(route).toContain("myaccount.google.com/permissions");
  });

  it("a failed disconnect is said, not swallowed", () => {
    const src = readFileSync("src/components/settings/SearchConsoleActions.tsx", "utf8");
    expect(src).toContain("Couldn't disconnect");
    expect(src).toContain("Couldn't reach Hawlai");
  });
});

describe("the card on the page", () => {
  const page = readFileSync("src/app/dashboard/settings/integrations/page.tsx", "utf8");

  it("renders the actions component rather than a bare tick", () => {
    expect(page).toContain("<SearchConsoleActions");
    expect(page).toContain("connected={isSearchConsoleConnected}");
  });

  it("navigation is untouched — this adds buttons to a card, nothing else", () => {
    // The card still sits in the same integrations grid it always did.
    expect(page).toContain("Google Search Console");
    expect(page).toContain("The searches people really used to find you");
  });
});
