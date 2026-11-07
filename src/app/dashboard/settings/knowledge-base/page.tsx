import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import KnowledgeBaseView from "@/components/settings/KnowledgeBaseView";
import InterviewCard from "@/components/settings/InterviewCard";

export default async function KnowledgeBasePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Business Knowledge</h1>
          <p className="text-sm text-slate-500">Real hours, pricing notes, policies, and FAQs the AI can use on calls.</p>
        </div>
      </div>
      {/* The resumable interview (I5), above the list it fills. */}
      <InterviewCard />
      <KnowledgeBaseView />
    </div>
  );
}
