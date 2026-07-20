import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { FolderOpen, Image as ImageIcon, Video, Palette } from "lucide-react";

export default async function AssetsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const [{ data: creatives }, { data: videos }] = await Promise.all([
    supabase
      .from("ad_creatives")
      .select("id, headline, generated_image_url, created_at")
      .eq("dealership_id", dealershipId)
      .not("generated_image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("video_generations")
      .select("id, prompt, video_url, created_at")
      .eq("dealership_id", dealershipId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Logos are saved to storage but never tracked in a table — list
  // the folder directly instead.
  let logos: { name: string; url: string }[] = [];
  try {
    const serviceClient = createServiceClient();
    const { data: files } = await serviceClient.storage.from("ad-creatives").list(`logos/${dealershipId}`, { sortBy: { column: "created_at", order: "desc" } });
    logos = (files ?? []).map((f) => ({
      name: f.name,
      url: serviceClient.storage.from("ad-creatives").getPublicUrl(`logos/${dealershipId}/${f.name}`).data.publicUrl,
    }));
  } catch {
    // No logos folder yet — fine, just show none.
  }

  const totalAssets = (creatives?.length ?? 0) + (videos?.length ?? 0) + logos.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
          <FolderOpen className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Assets</h1>
          <p className="text-sm text-slate-500">Everything Hawlai has generated for you, in one place</p>
        </div>
      </div>

      {totalAssets === 0 ? (
        <div className="card p-10 text-center">
          <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Nothing generated yet — ad images, videos, and logos will show up here.</p>
        </div>
      ) : (
        <>
          {creatives && creatives.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> Ad Creatives ({creatives.length})
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {creatives.map((c) => (
                  <a key={c.id} href={c.generated_image_url!} target="_blank" rel="noopener noreferrer" className="group">
                    <div className="aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                      <img src={c.generated_image_url!} alt={c.headline ?? ""} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-1">{c.headline}</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {videos && videos.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" /> Videos ({videos.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {videos.map((v) => (
                  <div key={v.id} className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                    <video src={v.video_url!} controls className="w-full aspect-video" />
                    <p className="text-xs text-slate-500 truncate p-2">{v.prompt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {logos.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" /> Logos ({logos.length})
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {logos.map((l) => (
                  <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-200 flex items-center justify-center p-2">
                    <img src={l.url} alt="Logo" className="max-w-full max-h-full object-contain" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
