"use client";

// Instagram Store — S1 of docs/PLAN-INSTAGRAM-STORE-AND-PRODUCT-EDITS.md,
// 28 November 2026. One dashboard page (the founder's decision A), four
// tabs, nothing public. Every tab reuses what exists: the one product
// catalog, the Seller Mode settings route, the business's own policy rows.

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import ProductManager from "@/components/website-builder/ProductManager";
import HawlaiTagList from "./HawlaiTagList";
import DeliveryFeeSettings from "./DeliveryFeeSettings";
import PoliciesEditor from "./PoliciesEditor";
import SellerModeSettings from "./SellerModeSettings";

export const STORE_TABS = [
  { key: "products", label: "Products" },
  { key: "shipping", label: "Shipping" },
  { key: "policies", label: "Policies" },
  { key: "settings", label: "Settings" },
] as const;

type TabKey = (typeof STORE_TABS)[number]["key"];

export default function InstagramStoreView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("tab");
  const tab: TabKey = (STORE_TABS.some((t) => t.key === requested) ? requested : "products") as TabKey;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {STORE_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => router.replace(`${pathname}?tab=${t.key}`, { scroll: false })}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === t.key ? "border-purple-500 text-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "products" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            The same products as your website — one catalog. What you change here changes everywhere.
          </p>
          <HawlaiTagList />
          <ProductManager />
        </div>
      )}
      {tab === "shipping" && <DeliveryFeeSettings />}
      {tab === "policies" && <PoliciesEditor />}
      {tab === "settings" && <SellerModeSettings />}
    </div>
  );
}
