import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Clapperboard } from "lucide-react";
import VideoMarketingView from "@/components/video-marketing/VideoMarketingView";

export default async function VideoMarketingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Clapperboard className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Video Marketing</h1>
          <p className="text-sm text-slate-500">Ideas, Reels, Shorts, TikTok, captions, subtitles, editing notes, B-roll and animation concepts. AI video generation and voiceover live in Creative Studio.</p>
        </div>
      </div>
      <VideoMarketingView />
    </div>
  );
}
