import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TeamView from "@/components/team/TeamView";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Team</h1>
        <p className="text-sm text-slate-500">Invite people into scoped roles — Hawlai assigns them work automatically when it fits.</p>
      </div>
      <TeamView />
    </div>
  );
}
