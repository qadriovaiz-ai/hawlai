import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ThreeDStudioView from "@/components/three-d/ThreeDStudioView";

export default async function ThreeDStudioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">3D Studio</h1>
        <p className="text-sm text-slate-500">
          Real, interactive 3D — describe what you want, Claude writes the actual WebGL scene. Drag to rotate, scroll to zoom.
        </p>
      </div>
      <ThreeDStudioView />
    </div>
  );
}
