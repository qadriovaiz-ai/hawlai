import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Layout } from "lucide-react";
import WebsiteBuilderView from "@/components/website-builder/WebsiteBuilderView";

export default async function WebsiteBuilderPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Layout className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Website Builder</h1>
          <p className="text-sm text-slate-500">A real multi-page website — Home, About, Services/Products, Contact and more, chosen by business type.</p>
        </div>
      </div>
      <WebsiteBuilderView />
    </div>
  );
}
