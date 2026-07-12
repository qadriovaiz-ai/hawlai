import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LeadsTable from "@/components/leads/LeadsTable";
import LeadsHeader from "@/components/leads/LeadsHeader";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; temp?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("dealership_id")
    .eq("id", user.id)
    .single();

  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const page = parseInt(params.page ?? "1");
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params.q) query = query.ilike("name", `%${params.q}%`);
  if (params.temp && params.temp !== "all") query = query.eq("lead_temperature", params.temp);
  if (params.status && params.status !== "all") query = query.eq("status", params.status);

  const { data: leads, count } = await query;

  // Map each lead's meta_campaign_id to the actual ad's headline, so
  // the table can show "came from: [Diwali Swift Offer]" instead of
  // just a raw ID — this is what actually answers "which ad brought
  // this lead in", not just "was it from Meta at all".
  const campaignIds = Array.from(new Set((leads ?? []).map((l) => l.meta_campaign_id).filter(Boolean)));
  let campaignMap: Record<string, string> = {};
  if (campaignIds.length > 0) {
    const { data: campaigns } = await supabase
      .from("ad_creatives")
      .select("meta_campaign_id, headline")
      .eq("dealership_id", dealershipId)
      .in("meta_campaign_id", campaignIds as string[]);
    campaignMap = Object.fromEntries((campaigns ?? []).map((c) => [c.meta_campaign_id, c.headline]));
  }

  return (
    <div className="space-y-5 max-w-7xl">
      <LeadsHeader dealershipId={dealershipId} />
      <LeadsTable
        leads={leads ?? []}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        campaignMap={campaignMap}
        filters={{ q: params.q, temp: params.temp, status: params.status }}
      />
    </div>
  );
}
