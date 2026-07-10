import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { Oswald } from "next/font/google";
import { ShieldCheck, Phone, MapPin } from "lucide-react";
import LandingLeadForm from "@/components/website/LandingLeadForm";

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });

export default async function PublicLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: page } = await supabase
    .from("landing_pages")
    .select("*, dealerships(id, dealership_name, city)")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!page) notFound();

  const dealership = (page as any).dealerships;
  const dealershipName = dealership?.dealership_name ?? "Our Dealership";
  const city = dealership?.city;

  const { data: brandProfile } = dealership?.id
    ? await supabase.from("brand_profiles").select("messaging_pillars").eq("dealership_id", dealership.id).maybeSingle()
    : { data: null };

  const pillars: string[] = (brandProfile?.messaging_pillars ?? []).filter(Boolean).slice(0, 3);
  const defaultPillars = ["Transparent pricing, no hidden charges", "Verified, quality-checked vehicles", "Support that continues after the sale"];
  const displayPillars = pillars.length > 0 ? pillars : defaultPillars;

  return (
    <div className={`${oswald.variable} font-sans bg-[#FAF8F5] text-[#1C1917]`}>
      {/* Hero */}
      <section className="relative bg-[#122744] text-white overflow-hidden">
        {page.hero_image_url && (
          <div className="absolute inset-0">
            <img src={page.hero_image_url} alt="" className="w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#122744] via-[#122744]/85 to-[#122744]/60" />
          </div>
        )}
        <div className="relative max-w-3xl mx-auto px-6 pt-14 pb-20 sm:pt-20 sm:pb-28">
          <div className="flex items-center gap-2 mb-6">
            {city && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase text-[#D9A441]">
                <MapPin className="w-3.5 h-3.5" /> {city}
              </span>
            )}
          </div>
          <div className="w-14 h-[3px] bg-[#D9A441] mb-6" />
          <h1
            className="text-4xl sm:text-6xl leading-[1.05] mb-5 uppercase tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          >
            {page.headline ?? `${dealershipName}`}
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-lg mb-8 leading-relaxed">
            {page.subheadline ?? (city ? `Serving ${city} with trust and transparency.` : "Your trusted car partner.")}
          </p>
          <a
            href="#get-in-touch"
            className="inline-flex items-center gap-2 bg-[#D9A441] hover:bg-[#c6952f] text-[#122744] font-semibold px-6 py-3.5 rounded-md transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {page.offer_text ?? "Book a Free Test Drive"}
          </a>
        </div>
      </section>

      {/* Why choose us — driven by real Brand Voice pillars, not invented stats */}
      <section className="max-w-3xl mx-auto px-6 py-14 sm:py-16">
        <p className="text-xs font-semibold tracking-widest uppercase text-[#122744]/50 mb-2">Why {dealershipName}</p>
        <div className="w-10 h-[3px] bg-[#D9A441] mb-8" />
        <div className="grid sm:grid-cols-3 gap-5">
          {displayPillars.map((pillar, i) => (
            <div key={i} className="border-t-[3px] border-[#D9A441] pt-4">
              <p className="text-[#1C1917] font-medium leading-snug">{pillar}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Lead capture */}
      <section id="get-in-touch" className="bg-white border-y border-slate-200/70">
        <div className="max-w-3xl mx-auto px-6 py-14 sm:py-16 grid sm:grid-cols-5 gap-10 items-start">
          <div className="sm:col-span-2 space-y-4">
            <h2
              className="text-2xl sm:text-3xl uppercase leading-tight"
              style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "#122744" }}
            >
              Get in touch
            </h2>
            <p className="text-slate-500 leading-relaxed">
              Leave your number and we'll call you back — no pressure, just a real conversation.
            </p>
            <div className="flex items-center gap-2 text-sm text-slate-500 pt-2">
              <ShieldCheck className="w-4 h-4 text-[#D9A441] shrink-0" />
              Your details go only to {dealershipName}
            </div>
          </div>
          <div className="sm:col-span-3">
            <LandingLeadForm slug={slug} />
          </div>
        </div>
      </section>

      <footer className="max-w-3xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-slate-400">
        <span>{dealershipName}{city ? ` · ${city}` : ""}</span>
        <span className="flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5" /> Call to enquire
        </span>
      </footer>

      {/* Mobile sticky CTA — most Indian traffic here is mobile, keep the action one thumb away */}
      <a
        href="#get-in-touch"
        className="sm:hidden fixed bottom-0 inset-x-0 bg-[#D9A441] text-[#122744] text-center py-3.5 font-semibold z-40 uppercase text-sm tracking-wide"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {page.offer_text ?? "Book a Free Test Drive"}
      </a>
      <div className="sm:hidden h-14" />
    </div>
  );
}
