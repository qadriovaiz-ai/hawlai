// Instagram Store — S1, 28 November 2026. A dashboard page: behind login,
// nothing public (the founder's decisions A and B). Rule 5's written
// reason is the founder's own request, recorded in docs/DECISIONS.md.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { Suspense } from "react";
import InstagramStoreView from "@/components/instagram-store/InstagramStoreView";

export default async function InstagramStorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center">
          <ShoppingBag className="w-5 h-5 text-pink-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Instagram Store</h1>
          <p className="text-sm text-slate-500">Sell in your Instagram DMs — your products, delivery fee, policies and Seller Mode, in one place.</p>
        </div>
      </div>
      <Suspense fallback={null}><InstagramStoreView /></Suspense>
    </div>
  );
}
