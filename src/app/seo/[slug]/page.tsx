import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServiceClient();
  const { data: page } = await supabase.from("seo_pages").select("title, meta_description").eq("slug", slug).eq("published", true).maybeSingle();
  if (!page) return { title: "Page not found" };
  return { title: page.title, description: page.meta_description ?? undefined };
}

export default async function SeoContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: page } = await supabase
    .from("seo_pages")
    .select("*, dealerships(dealership_name)")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!page) notFound();

  const { data: landingPage } = await supabase.from("landing_pages").select("slug").eq("dealership_id", page.dealership_id).eq("published", true).maybeSingle();
  const dealershipName = (page as any).dealerships?.dealership_name ?? "";

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-14">
        <p className="text-xs font-medium text-purple-600 uppercase tracking-wide mb-3">{dealershipName}</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-8 leading-tight">{page.h1}</h1>
        <div className="space-y-6">
          {(page.sections ?? []).map((s: any, i: number) => (
            <div key={i}>
              <h2 className="text-lg font-semibold text-neutral-800 mb-1.5">{s.heading}</h2>
              <p className="text-neutral-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
        {landingPage?.slug && (
          <div className="mt-10 pt-8 border-t border-neutral-200">
            <Link href={`/p/${landingPage.slug}`} className="inline-block bg-purple-600 hover:bg-purple-500 text-white font-semibold px-6 py-3 rounded-lg">
              Get in touch with {dealershipName}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
