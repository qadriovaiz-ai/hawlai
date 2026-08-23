import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import TestAndGoLive from "@/components/calling/TestAndGoLive";

// UX Transformation, piece 5c — test and go live.
export default async function CallingTestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("auto_call_new_leads")
    .eq("id", dealershipId)
    .single();

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link href="/dashboard/calling" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
        <ArrowLeft className="w-3.5 h-3.5" /> Calling
      </Link>

      <div>
        <h1 className="text-xl font-bold text-slate-900">Test and go live</h1>
        <p className="text-sm text-slate-500">Hear your AI employee work before it starts calling real customers.</p>
      </div>

      <TestAndGoLive initialLive={!!dealership?.auto_call_new_leads} />
    </div>
  );
}
