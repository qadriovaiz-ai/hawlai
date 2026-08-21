import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import TwoFactorCard from "@/components/settings/TwoFactorCard";

// P3 piece 9 — account security. 2FA is live; SSO is built but stays
// inactive until Supabase SSO is enabled on a paid plan (see the note
// rendered below — stated plainly rather than showing a control that
// silently does nothing).
export default async function SecuritySettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-brand-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Security</h1>
          <p className="text-sm text-slate-500">Protect the account that controls your ad spend</p>
        </div>
      </div>

      <TwoFactorCard />

      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-800">Single sign-on (SSO)</p>
        <p className="text-xs text-slate-400">
          Sign-in through a company identity provider (Okta, Azure AD, Google Workspace) is built and available on the login screen, but needs SSO enabled on the Supabase plan plus your provider registered before it will work. Until then it returns a &quot;provider not found&quot; error rather than failing silently.
        </p>
      </div>

      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-800">Customer data requests</p>
        <p className="text-xs text-slate-400">
          If a customer asks for a copy of their data, or asks to be forgotten, open that person in Leads &amp; CRM — export and erase live on their own page, since it&apos;s an action about one specific person. Every export and erasure is recorded in the Audit Log.
        </p>
      </div>
    </div>
  );
}
