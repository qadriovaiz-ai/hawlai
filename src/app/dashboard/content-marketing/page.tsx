import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import ContentMarketingView from "@/components/content/ContentMarketingView";

export default async function ContentMarketingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <FileText className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Content Marketing</h1>
          <p className="text-sm text-slate-500">Posts, carousels, blogs, scripts, hooks, CTAs and a content calendar — all in one place.</p>
        </div>
      </div>
      <ContentMarketingView />
    </div>
  );
}
