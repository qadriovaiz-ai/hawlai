import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TasksView from "@/components/tasks/TasksView";
import GoalsSection from "@/components/tasks/GoalsSection";
import WorkView from "@/components/work/WorkView";

// UX Transformation, Piece 2 — "Work".
//
// Route deliberately kept as /dashboard/tasks rather than moved to
// /dashboard/work: every existing deep link (Master Chat's
// DEPARTMENT_HREF for assign_task and set_goal, the Business hub, task
// notifications) points here, and breaking those to gain a prettier
// path would trade real working links for cosmetics.
//
// WorkView adds the half that was missing — what Hawlai itself is
// doing. GoalsSection and TasksView are unchanged below it: human
// tasks still need their own actions (mark done, cancel, reassign),
// which a read-only activity timeline can't provide.
export default async function WorkPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Work</h1>
        <p className="text-sm text-slate-500">What Hawlai is doing, what needs you, and what&apos;s already done.</p>
      </div>

      <WorkView />

      <div className="pt-2 space-y-6">
        <GoalsSection />
        <TasksView />
      </div>
    </div>
  );
}
