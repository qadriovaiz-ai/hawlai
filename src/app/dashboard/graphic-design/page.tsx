import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Palette } from "lucide-react";
import GraphicDesignView from "@/components/graphic-design/GraphicDesignView";

export default async function GraphicDesignPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <Palette className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Graphic Design</h1>
          <p className="text-sm text-slate-500">Ad creatives, posts, stories, thumbnails, banners, posters, flyers, brochures, pitch decks, mockups, AI images, product photos and social graphics.</p>
        </div>
      </div>
      <GraphicDesignView />
    </div>
  );
}
