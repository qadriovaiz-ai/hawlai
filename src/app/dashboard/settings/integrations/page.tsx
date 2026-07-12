import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plug, Facebook, Mail, MessageSquare, ShoppingBag, Store, CheckCircle, Clock, ArrowRight } from "lucide-react";
import SlackConnect from "@/components/settings/SlackConnect";
import ShopifyConnect from "@/components/settings/ShopifyConnect";
import WooCommerceConnect from "@/components/settings/WooCommerceConnect";

const PENDING_APPROVAL = [
  { name: "Google Ads", note: "Requires Google Ads API developer approval" },
  { name: "LinkedIn Ads", note: "Requires LinkedIn Marketing API partner approval" },
  { name: "TikTok Ads", note: "Requires TikTok Marketing API approval" },
  { name: "Pinterest Ads", note: "Requires Pinterest Ads API approval" },
];

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_id, gmail_email")
    .eq("id", dealershipId)
    .single();

  const isMetaConnected = !!dealership?.fb_page_id;
  const isGmailConnected = !!dealership?.gmail_email;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Plug className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Integrations</h1>
          <p className="text-sm text-slate-500">Every connected account, in one place</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Meta */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Facebook className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Meta (Facebook/Instagram)</p>
              <p className="text-xs text-slate-400">Ads, leads, organic posts</p>
            </div>
          </div>
          {isMetaConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Connected</span>
          ) : (
            <Link href="/dashboard/settings/connect-facebook" className="btn-secondary text-xs w-full justify-center">
              Connect <ArrowRight className="w-3 h-3" />
            </Link>
          )}
          {isMetaConnected && (
            <Link href="/dashboard/settings/connect-facebook" className="text-xs text-brand-400 hover:underline">
              Manage connection →
            </Link>
          )}
        </div>

        {/* Gmail */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-red-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Gmail</p>
              <p className="text-xs text-slate-400">Send real emails to leads</p>
            </div>
          </div>
          {isGmailConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Connected</span>
          ) : (
            <Link href="/dashboard/settings/connect-facebook" className="btn-secondary text-xs w-full justify-center">
              Connect <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>

        {/* Slack */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-purple-500/20 rounded-lg flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Slack</p>
              <p className="text-xs text-slate-400">Get notified for hot leads</p>
            </div>
          </div>
          <SlackConnect />
        </div>

        {/* Shopify */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-green-500/20 rounded-lg flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Shopify</p>
              <p className="text-xs text-slate-400">Pull in your products</p>
            </div>
          </div>
          <ShopifyConnect />
        </div>

        {/* WooCommerce */}
        <div className="card p-5 space-y-3 sm:col-span-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Store className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">WooCommerce</p>
              <p className="text-xs text-slate-400">Pull in your products</p>
            </div>
          </div>
          <WooCommerceConnect />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pending Platform Approval</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {PENDING_APPROVAL.map((p) => (
            <div key={p.name} className="card p-4 opacity-60">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <p className="text-sm font-medium text-slate-600">{p.name}</p>
              </div>
              <p className="text-xs text-slate-400 mt-1">{p.note}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          These require the ad platform's own developer approval process (can take days to weeks) — not something Hawlai or any tool can skip. Applications are in progress.
        </p>
      </div>
    </div>
  );
}
