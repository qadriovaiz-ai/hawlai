import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Facebook, CheckCircle, AlertCircle, Mail } from "lucide-react";
import ConnectFacebookForm from "@/components/settings/ConnectFacebookForm";

export default async function ConnectFacebookPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; gmail?: string; gmail_error?: string }>;
}) {
  const { error, gmail, gmail_error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_id, fb_page_name, fb_ad_account_id, fb_lead_form_name, fb_connect_pending, gmail_email")
    .eq("id", dealershipId)
    .single();

  const isConnected = !!dealership?.fb_page_id;
  const hasPending = !!dealership?.fb_connect_pending;
  const isGmailConnected = !!dealership?.gmail_email;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <Facebook className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Connect Facebook</h1>
          <p className="text-sm text-slate-500">Connect your own Page and Ad Account</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">An error occurred while connecting: {error}</p>
        </div>
      )}

      {hasPending ? (
        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Choose your Page, Ad Account and Lead Form</p>
          <ConnectFacebookForm pending={dealership.fb_connect_pending} />
        </div>
      ) : isConnected ? (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-sm font-semibold text-green-700">Connected</p>
          </div>
          <div className="text-sm space-y-1.5 text-slate-600">
            <p><span className="text-slate-400">Page:</span> {dealership.fb_page_name}</p>
            <p><span className="text-slate-400">Ad Account:</span> {dealership.fb_ad_account_id}</p>
            <p><span className="text-slate-400">Lead Form:</span> {dealership.fb_lead_form_name ?? "None"}</p>
          </div>
          <a href="/api/auth/facebook/connect" className="btn-secondary inline-flex mt-2">
            Reconnect / Change Page
          </a>
        </div>
      ) : (
        <div className="card p-8 text-center space-y-4">
          <p className="text-sm text-slate-500">
            Connect your Facebook Page so ads launch from your own account, not a shared one.
          </p>
          
            <a href="/api/auth/facebook/connect"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            <Facebook className="w-4 h-4" /> Connect Facebook Page
          </a>
        </div>
      )}

      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <Mail className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Connect Gmail</h2>
            <p className="text-sm text-slate-500">Send real emails from your own Gmail — free, no paid service</p>
          </div>
        </div>

        {gmail === "connected" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3 text-sm text-green-700">Gmail connected!</div>
        )}
        {gmail_error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700">{gmail_error}</div>
        )}

        {isGmailConnected ? (
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <p className="text-sm font-semibold text-green-700">Connected</p>
            </div>
            <p className="text-sm text-slate-600">Sending as: {dealership?.gmail_email}</p>
            <a href="/api/auth/gmail/connect" className="btn-secondary inline-flex mt-2">
              Reconnect
            </a>
          </div>
        ) : (
          <div className="card p-8 text-center space-y-4">
            <p className="text-sm text-slate-500">
              Connect your Gmail so follow-up emails send for real, straight from your own inbox.
            </p>
            <a
              href="/api/auth/gmail/connect"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              <Mail className="w-4 h-4" /> Connect Gmail
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
