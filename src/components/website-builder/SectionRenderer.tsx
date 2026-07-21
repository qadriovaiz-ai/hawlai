import type { LandingTheme } from "@/lib/landingThemes";
import LandingLeadForm from "@/components/website/LandingLeadForm";
import ProductCatalog from "@/components/website/ProductCatalog";

interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[];
  inventory_count: number | null;
}

export default function SectionRenderer({ sections, theme, slug, products }: { sections: any[]; theme: LandingTheme; slug: string; products?: StorefrontProduct[] }) {
  return (
    <>
      {sections.map((section, i) => (
        <SectionBlock key={i} section={section} theme={theme} slug={slug} products={products} />
      ))}
    </>
  );
}

function SectionBlock({ section, theme, slug, products }: { section: any; theme: LandingTheme; slug: string; products?: StorefrontProduct[] }) {
  switch (section.type) {
    case "product_catalog":
      return <ProductCatalog products={products ?? []} slug={slug} theme={theme} heading={section.heading} />;
    case "hero":
      return (
        <section className="px-6 py-16 sm:py-24 text-center" style={{ backgroundColor: theme.dark }}>
          <h1 className="text-3xl sm:text-5xl font-bold mb-4" style={{ color: theme.bg }}>{section.headline}</h1>
          {section.subheadline && <p className="text-base sm:text-lg max-w-xl mx-auto mb-6 opacity-80" style={{ color: theme.bg }}>{section.subheadline}</p>}
          {section.ctaText && (
            <a href="#contact" className="inline-block px-6 py-3 rounded-full font-semibold" style={{ backgroundColor: theme.accent, color: theme.accentText }}>
              {section.ctaText}
            </a>
          )}
        </section>
      );
    case "text":
      return (
        <section className="px-6 py-12 max-w-2xl mx-auto text-center">
          {section.heading && <h2 className="text-2xl font-bold mb-3" style={{ color: theme.dark }}>{section.heading}</h2>}
          <p className="text-neutral-600 leading-relaxed">{section.body}</p>
        </section>
      );
    case "image_text":
      return (
        <section className="px-6 py-12 max-w-4xl mx-auto">
          <div className={`flex flex-col ${section.imagePosition === "right" ? "sm:flex-row-reverse" : "sm:flex-row"} gap-8 items-center`}>
            <div className="flex-1 aspect-video bg-neutral-100 rounded-xl overflow-hidden">
              {section.imageUrl && <img src={section.imageUrl} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1">
              {section.heading && <h2 className="text-2xl font-bold mb-2" style={{ color: theme.dark }}>{section.heading}</h2>}
              <p className="text-neutral-600 leading-relaxed">{section.body}</p>
            </div>
          </div>
        </section>
      );
    case "features_grid":
      return (
        <section className="px-6 py-12 max-w-4xl mx-auto">
          {section.heading && <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: theme.dark }}>{section.heading}</h2>}
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {(section.items ?? []).map((item: any, i: number) => (
              <div key={i} className="p-5 rounded-xl border border-neutral-200">
                <p className="font-semibold mb-1" style={{ color: theme.dark }}>{item.title}</p>
                <p className="text-sm text-neutral-500">{item.description}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "testimonials":
      return (
        <section className="px-6 py-12 max-w-4xl mx-auto">
          {section.heading && <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: theme.dark }}>{section.heading}</h2>}
          <div className="grid sm:grid-cols-2 gap-5">
            {(section.items ?? []).map((item: any, i: number) => (
              <div key={i} className="p-5 rounded-xl bg-neutral-50">
                <p className="text-neutral-700 italic mb-2">&ldquo;{item.quote}&rdquo;</p>
                <p className="text-sm font-semibold text-neutral-500">— {item.author}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "team_grid":
      return (
        <section className="px-6 py-12 max-w-4xl mx-auto">
          {section.heading && <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: theme.dark }}>{section.heading}</h2>}
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {(section.items ?? []).map((item: any, i: number) => (
              <div key={i} className="text-center">
                <div className="w-20 h-20 rounded-full bg-neutral-100 mx-auto mb-3" />
                <p className="font-semibold" style={{ color: theme.dark }}>{item.name}</p>
                <p className="text-xs text-neutral-400 mb-1">{item.role}</p>
                <p className="text-sm text-neutral-500">{item.bio}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "pricing":
      return (
        <section className="px-6 py-12 max-w-4xl mx-auto">
          {section.heading && <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: theme.dark }}>{section.heading}</h2>}
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {(section.items ?? []).map((item: any, i: number) => (
              <div key={i} className="p-5 rounded-xl border border-neutral-200 text-center">
                <p className="font-semibold mb-1" style={{ color: theme.dark }}>{item.name}</p>
                <p className="text-xl font-bold mb-3" style={{ color: theme.accent }}>{item.price}</p>
                <ul className="text-sm text-neutral-500 space-y-1">
                  {(item.features ?? []).map((f: string, fi: number) => <li key={fi}>{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      );
    case "faq":
      return (
        <section className="px-6 py-12 max-w-2xl mx-auto">
          {section.heading && <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: theme.dark }}>{section.heading}</h2>}
          <div className="space-y-4">
            {(section.items ?? []).map((item: any, i: number) => (
              <div key={i}>
                <p className="font-semibold mb-1" style={{ color: theme.dark }}>{item.question}</p>
                <p className="text-sm text-neutral-500">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "cta_banner":
      return (
        <section className="px-6 py-14 text-center" style={{ backgroundColor: theme.accent }}>
          <h2 className="text-2xl font-bold mb-4" style={{ color: theme.accentText }}>{section.headline}</h2>
          {section.ctaText && (
            <a href="#contact" className="inline-block px-6 py-3 rounded-full font-semibold bg-white" style={{ color: theme.dark }}>
              {section.ctaText}
            </a>
          )}
        </section>
      );
    case "contact_form":
      return (
        <section id="contact" className="px-6 py-14 max-w-md mx-auto">
          {section.heading && <h2 className="text-2xl font-bold mb-5 text-center" style={{ color: theme.dark }}>{section.heading}</h2>}
          <LandingLeadForm slug={slug} theme={theme} />
        </section>
      );
    default:
      return null;
  }
}
