import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DesignEditPanel from "@/components/design-edit/DesignEditPanel";
import { isCanvaConfigured } from "@/lib/canva/client";
import { isTokenCryptoConfigured } from "@/lib/canva/tokenCrypto";

// Design & Edit — photo and video editing through Canva.
//
// Replaces the Veo video panel and 3D Studio as the creative surface.
// Both of those are switched off rather than removed (see
// src/lib/featureFlags.ts), so nothing a customer previously made has
// gone anywhere.

export default async function DesignEditPage({
  searchParams,
}: {
  searchParams?: Promise<{ canva?: string; reason?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const params = (await searchParams) ?? {};

  // Existence of the row is the connection check, not validity — a
  // token could still be expired or revoked. Validity is settled on
  // first use, which avoids a Canva round-trip on every page load.
  const { data: connection } = await supabase
    .from("canva_connections")
    .select("connected_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: designs } = await supabase
    .from("canva_designs")
    .select("id, canva_design_id, title, asset_type, exported_asset_url, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Design &amp; Edit</h1>
        <p className="text-sm text-slate-500">
          Edit photos and video in Canva, then bring the finished file straight back into Hawlai.
        </p>
      </div>

      <DesignEditPanel
        initialConnected={Boolean(connection)}
        connectedAt={connection?.connected_at ?? null}
        initialDesigns={designs ?? []}
        serverReady={isCanvaConfigured() && isTokenCryptoConfigured()}
        callbackStatus={params.canva ?? null}
        callbackReason={params.reason ?? null}
      />
    </div>
  );
}
