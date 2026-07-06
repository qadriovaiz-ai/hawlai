import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Facebook, CheckCircle, AlertCircle } from "lucide-react";
import ConnectFacebookForm from "@/components/settings/ConnectFacebookForm";

export default async function ConnectFacebookPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_id, fb_page_name, fb_ad_account_id, fb_lead_form_name, fb_connect_pending")
    .eq("id", dealershipId)
    .single();

  const isConnected = !!dealership?.fb_page_id;
  const hasPending = !!dealership?.fb_connect_pending;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <Facebook className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Facebook Connect Karo</h1>
          <p className="text-sm text-slate-500">Apna khud ka Page aur Ad Account jodo</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">Connect karte waqt error aaya: {error}</p>
        </div>
      )}

      {hasPending ? (
        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Apna Page, Ad Account aur Lead Form choose karo</p>
          <ConnectFacebookForm pending={dealership.fb_connect_pending} />
        </div>
      ) : isConnected ? (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-sm font-semibold text-green-700">Connected Hai</p>
          </div>
          <div className="text-sm space-y-1.5 text-slate-600">
            <p><span className="text-slate-400">Page:</span> {dealership.fb_page_name}</p>
            <p><span className="text-slate-400">Ad Account:</span> {dealership.fb_ad_account_id}</p>
            <p><span className="text-slate-400">Lead Form:</span> {dealership.fb_lead_form_name ?? "Koi nahi"}</p>
          </div>
          <a href="/api/auth/facebook/connect" className="btn-secondary inline-flex mt-2">
            Reconnect / Change Page
          </a>
        </div>
      ) : (
        <div className="card p-8 text-center space-y-4">
          <p className="text-sm text-slate-500">
            Apna Facebook Page connect karo taaki ads tumhare apne account se launch hon, na ki kisi shared account se.
          </p>
          
            href="/api/auth/facebook/connect"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            <Facebook className="w-4 h-4" /> Connect Facebook Page
          </a>
        </div>
      )}
    </div>
  );
}
