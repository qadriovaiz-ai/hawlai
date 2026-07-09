import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Heart, Car, Phone } from "lucide-react";
import RetentionMessageButton from "@/components/leads/RetentionMessageButton";

export default async function RetentionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) redirect("/dashboard");

  const { data: customers } = await supabase
    .from("leads")
    .select("*")
    .eq("dealership_id", dealershipId)
    .eq("status", "converted")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <Heart className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Customer Retention</h1>
          <p className="text-sm text-slate-500">Re-engage customers who already bought — service reminders, referrals, upsells</p>
        </div>
      </div>

      {!customers || customers.length === 0 ? (
        <div className="card p-12 text-center">
          <Heart className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">No converted customers yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Move a lead to "Converted" on the Pipeline page once they buy — they'll show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{customers.length} customer{customers.length > 1 ? "s" : ""}</p>
          {customers.map((c) => (
            <div key={c.id} className="card p-4 space-y-3">
              <div>
                <p className="font-semibold text-slate-900">{c.name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-400">
                  {c.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {c.phone}
                    </span>
                  )}
                  {c.vehicle && (
                    <span className="inline-flex items-center gap-1">
                      <Car className="w-3 h-3" /> {c.vehicle}
                    </span>
                  )}
                </div>
              </div>
              <RetentionMessageButton leadId={c.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
