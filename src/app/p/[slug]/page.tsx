import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { Car, Phone, ShieldCheck } from "lucide-react";
import LandingLeadForm from "@/components/website/LandingLeadForm";

export default async function PublicLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: page } = await supabase
    .from("landing_pages")
    .select("*, dealerships(dealership_name, city)")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!page) notFound();

  const dealershipName = (page as any).dealerships?.dealership_name ?? "Our Dealership";
  const city = (page as any).dealerships?.city;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-6 py-10 sm:py-16">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center">
            <Car className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-slate-900">{dealershipName}</span>
        </div>

        {page.hero_image_url && (
          <img src={page.hero_image_url} alt="" className="w-full rounded-2xl mb-8 object-cover max-h-96" />
        )}

        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3 leading-tight">
          {page.headline ?? `Welcome to ${dealershipName}`}
        </h1>
        <p className="text-lg text-slate-500 mb-8">
          {page.subheadline ?? (city ? `Serving ${city} with trust and transparency.` : "Your trusted car partner.")}
        </p>

        <div className="grid sm:grid-cols-2 gap-8 items-start">
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
              <p className="font-semibold text-indigo-900">{page.offer_text ?? "Book a free test drive today."}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <ShieldCheck className="w-4 h-4 text-green-500" /> Trusted dealership{city ? ` in ${city}` : ""}
            </div>
          </div>

          <LandingLeadForm slug={slug} />
        </div>
      </div>
    </div>
  );
}
