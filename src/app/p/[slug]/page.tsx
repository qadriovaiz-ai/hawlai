import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { Oswald } from "next/font/google";
import { ShieldCheck, Phone, MapPin, IndianRupee } from "lucide-react";
import LandingLeadForm from "@/components/website/LandingLeadForm";
import ChatWidget from "@/components/website/ChatWidget";
import { getTheme } from "@/lib/landingThemes";
import type { Metadata } from "next";

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });

// Dynamic per-dealer SEO metadata — without this, every dealer's page
// inherited Hawlai's own generic title/description (invisible bug:
// looked fine in the browser, but Google indexing and WhatsApp/
// Facebook link-share previews would all show "Hawlai" instead
// of the dealer's actual business).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServiceClient();
  const { data: page } = await supabase
    .from("landing_pages")
    .select("headline, subheadline, hero_image_url, dealerships(dealership_name, city)")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!page) return { title: "Page not found" };

  const dealership = (page as any).dealerships;
  const name = dealership?.dealership_name ?? "Our Business";
  const title = page.headline ? `${page.headline} | ${name}` : name;
  const description = page.subheadline ?? `Get in touch with ${name}${dealership?.city ? ` in ${dealership.city}` : ""}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: page.hero_image_url ? [page.hero_image_url] : undefined,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: page.hero_image_url ? [page.hero_image_url] : undefined,
    },
  };
}

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
  const theme = getTheme(page.theme);
  const carListings: { name: string; price?: string; image_url?: string }[] = page.car_listings ?? [];

  const { data: brandProfile } = dealership?.id
    ? await supabase.from("brand_profiles").select("messaging_pillars").eq("dealership_id", dealership.id).maybeSingle()
    : { data: null };

  const pillars: string[] = (brandProfile?.messaging_pillars ?? []).filter(Boolean).slice(0, 3);
  const defaultPillars = ["Transparent pricing, no hidden charges", "Verified, quality-checked vehicles", "Support that continues after the sale"];
  const displayPillars = pillars.length > 0 ? pillars : defaultPillars;

  return (
    <div className={`${oswald.variable} font-sans`} style={{ backgroundColor: theme.bg, color: "#1C1917" }}>
      {/* Hero */}
      <section className="relative text-white overflow-hidden" style={{ backgroundColor: theme.dark }}>
        {page.hero_image_url && (
          <div className="absolute inset-0">
            <img src={page.hero_image_url} alt="" className="w-full h-full object-cover opacity-30" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${theme.dark}, ${theme.dark}D9, ${theme.dark}99)` }} />
          </div>
        )}
        <div className="relative max-w-3xl mx-auto px-6 pt-14 pb-20 sm:pt-20 sm:pb-28">
          {city && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase mb-6" style={{ color: theme.accent }}>
              <MapPin className="w-3.5 h-3.5" /> {city}
            </span>
          )}
          <div className="w-14 h-[3px] mb-6" style={{ backgroundColor: theme.accent }} />
          <h1
            className="text-4xl sm:text-6xl leading-[1.05] mb-5 uppercase tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          >
            {page.headline ?? dealershipName}
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-lg mb-8 leading-relaxed">
            {page.subheadline ?? (city ? `Serving ${city} with trust and transparency.` : "Your trusted car partner.")}
          </p>
          <a
            href="#get-in-touch"
            className="inline-flex items-center gap-2 font-semibold px-6 py-3.5 rounded-md transition-opacity hover:opacity-90"
            style={{ backgroundColor: theme.accent, color: theme.accentText, fontFamily: "var(--font-display)" }}
          >
            {page.offer_text ?? "Book a Free Test Drive"}
          </a>
        </div>
      </section>

      {/* Why choose us */}
      <section className="max-w-3xl mx-auto px-6 py-14 sm:py-16">
        <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: `${theme.dark}80` }}>Why {dealershipName}</p>
        <div className="w-10 h-[3px] mb-8" style={{ backgroundColor: theme.accent }} />
        <div className="grid sm:grid-cols-3 gap-5">
          {displayPillars.map((pillar, i) => (
            <div key={i} className="border-t-[3px] pt-4" style={{ borderColor: theme.accent }}>
              <p className="font-medium leading-snug">{pillar}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured cars — optional gallery the dealer adds themselves */}
      {carListings.length > 0 && (
        <section className="max-w-3xl mx-auto px-6 pb-14 sm:pb-16">
          <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: `${theme.dark}80` }}>Featured</p>
          <div className="w-10 h-[3px] mb-8" style={{ backgroundColor: theme.accent }} />
          <div className="grid sm:grid-cols-3 gap-5">
            {carListings.map((car, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden border border-slate-200/70 shadow-sm">
                {car.image_url ? (
                  <img src={car.image_url} alt={car.name} className="w-full h-36 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-slate-100" />
                )}
                <div className="p-3.5">
                  <p className="font-semibold text-sm">{car.name}</p>
                  {car.price && (
                    <p className="text-sm flex items-center gap-0.5 mt-0.5" style={{ color: theme.dark }}>
                      <IndianRupee className="w-3 h-3" /> {car.price}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lead capture */}
      <section id="get-in-touch" className="bg-white border-y border-slate-200/70">
        <div className="max-w-3xl mx-auto px-6 py-14 sm:py-16 grid sm:grid-cols-5 gap-10 items-start">
          <div className="sm:col-span-2 space-y-4">
            <h2
              className="text-2xl sm:text-3xl uppercase leading-tight"
              style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: theme.dark }}
            >
              Get in touch
            </h2>
            <p className="text-slate-500 leading-relaxed">
              Leave your number and we'll call you back — no pressure, just a real conversation.
            </p>
            <div className="flex items-center gap-2 text-sm text-slate-500 pt-2">
              <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
              Your details go only to {dealershipName}
            </div>
          </div>
          <div className="sm:col-span-3">
            <LandingLeadForm slug={slug} theme={theme} />
          </div>
        </div>
      </section>

      <footer className="max-w-3xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-slate-400">
        <span>{dealershipName}{city ? ` · ${city}` : ""}</span>
        <span className="flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5" /> Call to enquire
        </span>
      </footer>

      <a
        href="#get-in-touch"
        className="sm:hidden fixed bottom-0 inset-x-0 text-center py-3.5 font-semibold z-40 uppercase text-sm tracking-wide"
        style={{ backgroundColor: theme.accent, color: theme.accentText, fontFamily: "var(--font-display)" }}
      >
        {page.offer_text ?? "Book a Free Test Drive"}
      </a>
      <div className="sm:hidden h-14" />
      <ChatWidget slug={slug} dealershipName={dealershipName} accentColor={theme.dark} />
    </div>
  );
}
