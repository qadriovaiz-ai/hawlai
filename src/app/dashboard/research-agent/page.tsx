import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BookOpenText } from "lucide-react";
import ResearchAgentView from "@/components/research/ResearchAgentView";

export default async function ResearchAgentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <BookOpenText className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Research Agent</h1>
          <p className="text-sm text-slate-500">Industry trends, market research, real customer sentiment from your own leads, new opportunities, and daily news monitoring.</p>
        </div>
      </div>
      <ResearchAgentView />
    </div>
  );
}
