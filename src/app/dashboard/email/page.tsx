import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Mail, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";
import EmailMarketingTools from "@/components/email/EmailMarketingTools";

export default async function EmailPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: dealership } = await supabase.from("dealerships").select("gmail_email").eq("id", dealershipId).single();
  const isConnected = !!dealership?.gmail_email;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
          <Mail className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Email</h1>
          <p className="text-sm text-slate-500">Real emails, sent from your own Gmail</p>
        </div>
      </div>

      <div className="card p-5 flex items-center gap-3">
        {isConnected ? (
          <>
            <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-800">Connected — sending as {dealership?.gmail_email}</p>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">Not connected yet</p>
              <Link href="/dashboard/settings/integrations" className="text-xs text-brand-400 hover:underline">
                Connect Gmail in Integrations →
              </Link>
            </div>
          </>
        )}
      </div>

      <div className="card p-5 space-y-2">
        <p className="text-sm font-semibold text-slate-700">How email works in Hawlai</p>
        <p className="text-xs text-slate-400">
          There's no separate email campaign builder — emails are generated and sent per lead, in context, from their own page. This keeps every email specific to that person instead of a generic blast.
        </p>
        <Link href="/dashboard/leads" className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:underline mt-2">
          Go to a lead to draft and send an email <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <EmailMarketingTools />
    </div>
  );
}
