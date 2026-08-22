import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import AdminInvoicesView from "@/components/admin/AdminInvoicesView";

export default async function AdminInvoicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  // Deliberately 404, same as /dashboard/admin/spend — this page
  // shouldn't hint at its own existence to a non-admin.
  if (!profile?.is_platform_admin) notFound();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Invoices</h1>
        <p className="text-sm text-slate-500">Billing records for every business on Hawlai — visible only to platform admins.</p>
      </div>
      <AdminInvoicesView />
    </div>
  );
}
