// INSTAGRAM STORE — S1–S5 of docs/PLAN-INSTAGRAM-STORE-AND-PRODUCT-EDITS.md,
// 28 November 2026. One dashboard page, four tabs, nothing public; every
// tab reuses what exists.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { code } from "./helpers/source";
import { STORE_POLICIES, policiesFrom, policySaveRequest } from "@/lib/instagramStore/policies";
import { productFromCaption } from "@/lib/dm/postContext";
import { NAV_TREE } from "@/lib/navTree";

describe("S4 — POLICIES ARE THE ROWS THAT ALREADY EXIST (decision C)", () => {
  it("THE SAME TITLES AND CATEGORY THE ONBOARDING INTERVIEW WRITES — the rows the DM reply already reads", () => {
    const interview = code("src/lib/onboarding/interview.ts");
    for (const p of STORE_POLICIES) {
      expect(interview, p.title).toContain(`writesTo: { table: "business_knowledge", category: "policy", title: "${p.title}" }`);
    }
  });

  it("FOUND BY CATEGORY AND TITLE; A MISSING ONE IS null, never another business's or another category's", () => {
    const rows = policiesFrom([
      { id: "1", title: "Returns and refunds", content: "7 days", category: "policy" },
      { id: "2", title: "Delivery time", content: "x", category: "faq" },
    ]);
    expect(rows["Returns and refunds"]).toMatchObject({ id: "1" });
    expect(rows["Delivery time"]).toBeNull();
    expect(rows["Damaged on arrival"]).toBeNull();
  });

  it("AN EXISTING ROW IS UPDATED IN PLACE; A MISSING ONE IS CREATED WITH THE INTERVIEW'S OWN TITLE AND CATEGORY", () => {
    expect(policySaveRequest("Returns and refunds", " 7 days, unused ", { id: "1", title: "Returns and refunds", content: "", category: "policy" })).toEqual({
      ok: true,
      method: "PATCH",
      body: { id: "1", content: "7 days, unused" },
    });
    expect(policySaveRequest("Delivery time", "3-5 days", null)).toEqual({ ok: true, method: "POST", body: { category: "policy", title: "Delivery time", content: "3-5 days" } });
  });

  it("EMPTY, TOO LONG, OR A TITLE THAT ISN'T A STORE POLICY IS REFUSED", () => {
    expect(policySaveRequest("Delivery time", "  ", null)).toMatchObject({ ok: false });
    expect(policySaveRequest("Delivery time", "x".repeat(2001), null)).toMatchObject({ ok: false });
    expect(policySaveRequest("Anything", "x", null)).toMatchObject({ ok: false });
  });

  it("SAVED THROUGH THE ROUTE THE BUSINESS KNOWLEDGE PAGE USES — no new write path", () => {
    expect(code("src/components/instagram-store/PoliciesEditor.tsx")).toMatch(/fetch\("\/api\/business-knowledge", \{ method: req\.method/);
  });
});

describe("S2 — EACH PRODUCT'S TAG LINE IS ONE T1 READS", () => {
  it("THE LINE A SELLER COPIES NAMES THE PRODUCT WHEN IT IS IN A CAPTION — the round trip", () => {
    const tagFor = (n: string) => `#HawlaiTag: ${n.replace(/\s+/g, " ").trim()}`;
    const src = code("src/components/instagram-store/HawlaiTagList.tsx");
    expect(src).toMatch(/return `#HawlaiTag: \$\{String\(name \?\? ""\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\)\}`;/);
    const catalog = [{ name: "Kurta – Red – M" }, { name: "Clay Mug" }];
    for (const p of catalog) expect(productFromCaption(`New in!\n${tagFor(p.name)}\n#handmade`, catalog)).toBe(p.name);
  });
});

describe("S1 — ONE PAGE, FOUR TABS, BEHIND LOGIN", () => {
  it("THE NAVIGATION'S FOUR LEAVES ARE THE PAGE'S FOUR TABS", () => {
    const store: any = (NAV_TREE as any[]).find((n) => n.label === "Store");
    const node = store.children.find((c: any) => c.label === "Instagram Store");
    expect(node.href).toBe("/dashboard/instagram-store");
    const view = code("src/components/instagram-store/InstagramStoreView.tsx");
    const tabs = node.children.map((c: any) => c.tab);
    expect(tabs).toEqual(["products", "shipping", "policies", "settings"]);
    for (const t of tabs) expect(view).toContain(`{ key: "${t}", label:`);
  });

  it("THE PAGE REDIRECTS ANYONE NOT LOGGED IN — it is a dashboard page, never public", () => {
    const page = code("src/app/dashboard/instagram-store/page.tsx");
    expect(page).toMatch(/if \(!user\) redirect\("\/auth\/login"\);/);
  });

  it("EACH TAB IS WHAT EXISTS: the one catalog, the fee, the policy rows, Seller Mode", () => {
    const view = code("src/components/instagram-store/InstagramStoreView.tsx");
    expect(view).toMatch(/tab === "products" && \([\s\S]*?<ProductManager \/>/);
    expect(view).toMatch(/tab === "shipping" && <DeliveryFeeSettings \/>/);
    expect(view).toMatch(/tab === "policies" && <PoliciesEditor \/>/);
    expect(view).toMatch(/tab === "settings" && <SellerModeSettings \/>/);
  });

  it("SELLER MODE AND THE FEE SAVE THROUGH THE SAME ROUTE AND RULES AS BEFORE", () => {
    expect(readFileSync("src/components/instagram-store/useSellerSettings.ts", "utf8")).toContain('fetch("/api/social/auto-reply-settings", {');
  });
});
