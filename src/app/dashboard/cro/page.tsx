import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CroView from "@/components/cro/CroView";

export default async function CroPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Conversion Rate Optimization</h1>
        <p className="text-slate-500 text-sm mt-0.5">Real suggestions from your actual page data, plus live A/B testing on your landing page.</p>
      </div>
      <CroView />
    </div>
  );
}
