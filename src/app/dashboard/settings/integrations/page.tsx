import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plug, Facebook, Mail, MessageSquare, ShoppingBag, Store, CheckCircle, ArrowRight, Globe, FileText, Radio, Star } from "lucide-react";
import SlackConnect from "@/components/settings/SlackConnect";
import InstagramBusinessLoginConnect from "@/components/settings/InstagramBusinessLoginConnect";
import ShopifyConnect from "@/components/settings/ShopifyConnect";
import WooCommerceConnect from "@/components/settings/WooCommerceConnect";
import WebsiteConnect from "@/components/settings/WebsiteConnect";
import WordPressConnect from "@/components/settings/WordPressConnect";
import ConnectWhatsAppCard from "@/components/settings/ConnectWhatsAppCard";
import GoogleReviewsConnect from "@/components/settings/GoogleReviewsConnect";
import TrackingSettingsCard from "@/components/settings/TrackingSettingsCard";
import ProductFeedCard from "@/components/settings/ProductFeedCard";
import { getDealershipPlanLimits, hasFeature } from "@/lib/plans";
import { buttonClasses } from "@/components/ui";
import { hasToken } from "@/lib/crypto/oauthSecrets";

// All four ad platforms (Meta, Google, Pinterest, Snapchat, LinkedIn)
// now have real connect cards above — the old "Pending Platform
// Approval" list is gone. TikTok was deliberately dropped rather than
// built: banned in India since 2020, so no value for this customer base.

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_id, gmail_email, google_ads_email, google_ads_customer_id, youtube_channel_title, owner_whatsapp_number, owner_whatsapp_verified, pinterest_access_token, pinterest_access_token_encrypted, snapchat_access_token, snapchat_access_token_encrypted, linkedin_access_token, linkedin_access_token_encrypted")
    .eq("id", dealershipId)
    .single();

  const isMetaConnected = !!dealership?.fb_page_id;
  const isGmailConnected = !!dealership?.gmail_email;
  const isGoogleAdsConnected = !!dealership?.google_ads_email;
  const isYoutubeConnected = !!dealership?.youtube_channel_title;
  // hasToken(), not readToken(): whether a connection exists is
  // answerable without decrypting one, and a settings page has no
  // business holding a plaintext token in memory to render a tick.
  const isPinterestConnected = hasToken(dealership, "pinterest");
  const isSnapchatConnected = hasToken(dealership, "snapchat");
  const isLinkedinConnected = hasToken(dealership, "linkedin");

  const limits = await getDealershipPlanLimits(supabase, dealershipId);
  const whatsappAutomationAllowed = hasFeature(limits, "whatsappAutomation");

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

      {params.google_ads_error && (
        <div className="bg-red-500/10 border border-red-700/40 rounded-lg p-3 text-sm text-red-400">
          Google Ads connection failed: {decodeURIComponent(params.google_ads_error)}
        </div>
      )}
      {params.google_ads === "connected" && (
        <div className="bg-green-500/10 border border-green-700/40 rounded-lg p-3 text-sm text-green-400">
          Google Ads connected successfully.
        </div>
      )}

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
            <Link href="/dashboard/settings/connect-facebook" className={buttonClasses("secondary", "sm", "w-full justify-center")}>
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
            <Link href="/dashboard/settings/connect-facebook" className={buttonClasses("secondary", "sm", "w-full justify-center")}>
              Connect <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>

        {/* Google Ads */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-yellow-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Google Ads</p>
              <p className="text-xs text-slate-400">Basic Access pending Google review</p>
            </div>
          </div>
          {isGoogleAdsConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Connected ({dealership?.google_ads_email})</span>
          ) : (
            <a href="/api/auth/google-ads/connect" className={buttonClasses("secondary", "sm", "w-full justify-center")}>
              Connect <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Pinterest Ads */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-rose-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4 text-rose-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Pinterest Ads</p>
              <p className="text-xs text-slate-400">Launch image campaigns from your creatives</p>
            </div>
          </div>
          {isPinterestConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Connected</span>
          ) : (
            <a href="/api/auth/pinterest/start" className={buttonClasses("secondary", "sm", "w-full justify-center")}>
              Connect <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Snapchat Ads */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-amber-400/20 rounded-lg flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Snapchat Ads</p>
              <p className="text-xs text-slate-400">Launch Snap Ads from your creatives</p>
            </div>
          </div>
          {isSnapchatConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Connected</span>
          ) : (
            <a href="/api/auth/snapchat/start" className={buttonClasses("secondary", "sm", "w-full justify-center")}>
              Connect <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* LinkedIn Ads */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-sky-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">LinkedIn Ads</p>
              <p className="text-xs text-slate-400">Needs a LinkedIn company page you administer</p>
            </div>
          </div>
          {isLinkedinConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Connected</span>
          ) : (
            <a href="/api/auth/linkedin/start" className={buttonClasses("secondary", "sm", "w-full justify-center")}>
              Connect <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* YouTube */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-red-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">YouTube</p>
              <p className="text-xs text-slate-400">Publish generated videos to your channel</p>
            </div>
          </div>
          {isYoutubeConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Connected ({dealership?.youtube_channel_title})</span>
          ) : (
            <a href="/api/auth/youtube/connect" className={buttonClasses("secondary", "sm", "w-full justify-center")}>
              Connect <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>

        <ConnectWhatsAppCard initiallyConnected={!!dealership?.owner_whatsapp_verified} connectedNumber={dealership?.owner_whatsapp_number} allowed={whatsappAutomationAllowed} />

        {/* Website (any platform) */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-brand-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Globe className="w-4 h-4 text-brand-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Website</p>
              <p className="text-xs text-slate-400">Any platform — just the link</p>
            </div>
          </div>
          <WebsiteConnect />
        </div>

        {/* WordPress */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">WordPress</p>
              <p className="text-xs text-slate-400">Publish blog posts directly</p>
            </div>
          </div>
          <WordPressConnect />
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
          <InstagramBusinessLoginConnect />
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

        {/* Google Reviews */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-amber-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Star className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Google Reviews</p>
              <p className="text-xs text-slate-400">Surface your public rating in CRO</p>
            </div>
          </div>
          <GoogleReviewsConnect />
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

      <TrackingSettingsCard />

      <ProductFeedCard />

      <p className="text-xs text-slate-400">
        Each ad platform still requires its own developer-app approval before it works with real accounts (can take days to weeks) — not something Hawlai or any tool can skip. Connecting above will report a clear error until that's granted.
      </p>
    </div>
  );
}
