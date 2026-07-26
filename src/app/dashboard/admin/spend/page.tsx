import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import AdminSpendView from "@/components/admin/AdminSpendView";

export default async function AdminSpendPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  // Deliberately 404, not a "not authorized" message — this page
  // shouldn't even hint at its own existence to a non-admin business
  // owner.
  if (!profile?.is_platform_admin) notFound();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Platform Spend</h1>
        <p className="text-sm text-slate-500">Usage and estimated operating cost across every business on Hawlai — visible only to platform admins.</p>
      </div>
      <AdminSpendView />
    </div>
  );
}
