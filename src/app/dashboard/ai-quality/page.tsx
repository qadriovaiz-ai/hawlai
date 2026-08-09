import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import AiQualityView from "@/components/admin/AiQualityView";

export default async function AiQualityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("is_platform_admin").eq("id", user.id).single();
  if (!profile?.is_platform_admin) redirect("/dashboard");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Quality</h1>
          <p className="text-sm text-slate-500">Real feedback from every business using Master Chat — last 30 days.</p>
        </div>
      </div>
      <AiQualityView />
    </div>
  );
}
