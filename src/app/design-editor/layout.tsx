import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// The Canvas Editor needs full-screen real estate, same reasoning as
// /team-tasks living outside the /dashboard tree — a persistent left
// sidebar app-shell would eat into the canvas area, same as no real
// design tool (Canva included) keeps one up while editing.
export default async function DesignEditorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  return <>{children}</>;
}
