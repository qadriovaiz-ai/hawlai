"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Suspense } from "react";
import NavTree from "./NavTree";
import { getNavTree } from "@/lib/navTree";
import type { ProductMode } from "@/lib/onboarding/intentRouter";
import DealershipSwitcher from "@/components/agency/DealershipSwitcher";

export default function Sidebar({ dealershipName, productMode, isAgency }: { dealershipName: string; productMode?: ProductMode | null; isAgency?: boolean }) {
  const pathname = usePathname();
  // useSearchParams inside NavTree needs a Suspense boundary in the
  // app router; the tree itself is plain data.
  const sections = getNavTree({ mode: productMode, isAgency });

  return (
    <div className="hidden md:flex w-64 bg-slate-100 border-r border-slate-200 flex-col h-full shrink-0">
      <div className="p-5 border-b border-slate-100 space-y-3">
        <Link href="/chat" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 shadow-sm shadow-brand-600/30">
            <Image src="/logo-icon.png" alt="Hawlai" width={36} height={36} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">Hawlai</p>
            <p className="text-xs text-slate-500 truncate">{dealershipName}</p>
          </div>
        </Link>
        <DealershipSwitcher />
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {/* The accordion. Sections with children expand in place; a
            leaf navigates, carrying ?tab= where the destination is a
            hub tab rather than a page of its own. */}
        <Suspense fallback={<div className="h-8" />}>
          <NavTree sections={sections} />
        </Suspense>
      </nav>

      <div className="p-3 border-t border-slate-100">
        <div className="bg-brand-900/40 border border-brand-700/40 rounded-lg p-3">
          <p className="text-xs font-semibold text-brand-300 mb-0.5">AI Engine Active</p>
          <p className="text-xs text-brand-400">Scoring leads automatically</p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="relative flex w-2 h-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full w-2 h-2 bg-green-500"></span>
            </span>
            <span className="text-xs text-green-400 font-medium">Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}
