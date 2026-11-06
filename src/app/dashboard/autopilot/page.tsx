import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Zap } from "lucide-react";
import AutopilotCommandCenter from "@/components/autopilot/AutopilotCommandCenter";
import ContentQueueView from "@/components/autopilot/ContentQueueView";
import PersonaSettingsCard from "@/components/autopilot/PersonaSettingsCard";
import AutonomyLevelsCard from "@/components/autopilot/AutonomyLevelsCard";

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
      <PersonaSettingsCard />
      {/* S7/P6 — what Hawlai is allowed to do with nobody watching.
          HERE AND NOT ON A NEW PAGE: this file's own header calls
          /dashboard/autopilot "the one canonical automation control
          surface instead of one of several partial ones", and CLAUDE.md
          rule 5 is depth over breadth. */}
      <AutonomyLevelsCard />
      <AutopilotCommandCenter />
      <ContentQueueView />
    </div>
  );
}
