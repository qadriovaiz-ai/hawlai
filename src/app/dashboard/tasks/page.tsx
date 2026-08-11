import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TasksView from "@/components/tasks/TasksView";

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tasks</h1>
        <p className="text-sm text-slate-500">Everything Hawlai created or delegated — mark it done, cancel it, or see who's on it.</p>
      </div>
      <TasksView />
    </div>
  );
}
