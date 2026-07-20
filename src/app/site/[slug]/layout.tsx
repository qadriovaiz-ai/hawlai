import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTheme } from "@/lib/landingThemes";

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: website } = await supabase
    .from("websites")
    .select("id, slug, theme_key, published, dealerships(dealership_name)")
    .eq("slug", slug)
    .maybeSingle();

  if (!website || !website.published) notFound();

  const { data: pages } = await supabase.from("website_pages").select("slug, title").eq("website_id", website.id).order("order_index", { ascending: true });
  const theme = getTheme(website.theme_key);
  const dealershipName = (website as any).dealerships?.dealership_name ?? "Business";

  return (
    <div style={{ backgroundColor: theme.bg }} className="min-h-screen">
      <nav className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto">
        <Link href={`/site/${slug}`} className="font-bold text-lg" style={{ color: theme.dark }}>{dealershipName}</Link>
        <div className="flex items-center gap-4">
          {(pages ?? []).map((p) => (
            <Link key={p.slug} href={p.slug === "home" ? `/site/${slug}` : `/site/${slug}/${p.slug}`} className="text-sm hover:underline" style={{ color: theme.dark }}>
              {p.title}
            </Link>
          ))}
        </div>
      </nav>
      <main>{children}</main>
      <footer className="text-center text-xs py-8 opacity-50" style={{ color: theme.dark }}>
        © {new Date().getFullYear()} {dealershipName}
      </footer>
    </div>
  );
}
