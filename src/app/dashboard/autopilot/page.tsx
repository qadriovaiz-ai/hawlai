import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Zap } from "lucide-react";
import AutopilotCommandCenter from "@/components/autopilot/AutopilotCommandCenter";

export default async function AutopilotPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
          <Zap className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Autopilot</h1>
          <p className="text-sm text-slate-500">Every automation toggle in one place. Everything except money is switchable to full-auto here.</p>
        </div>
      </div>
      <AutopilotCommandCenter />
    </div>
  );
}
