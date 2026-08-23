import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import EmployeeSetup from "@/components/calling/EmployeeSetup";

// UX Transformation, piece 5b — the AI employee onboarding journey.
export default async function CallingSetupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const [{ data: dealership }, { data: knowledge }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single(),
    supabase.from("business_knowledge").select("id").eq("dealership_id", dealershipId).eq("is_active", true),
  ]);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link href="/dashboard/calling" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
        <ArrowLeft className="w-3.5 h-3.5" /> Calling
      </Link>

      <div>
        <h1 className="text-xl font-bold text-slate-900">Set up your AI Calling Employee</h1>
        <p className="text-sm text-slate-500">Six quick steps — like briefing someone on their first day.</p>
      </div>

      <EmployeeSetup
        business={{
          name: dealership?.dealership_name ?? "your business",
          category: dealership?.business_category ?? "business",
          knowledgeCount: (knowledge ?? []).length,
        }}
      />
    </div>
  );
}
