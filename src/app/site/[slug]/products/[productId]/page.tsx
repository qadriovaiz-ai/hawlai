import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { getTheme } from "@/lib/landingThemes";
import { renderRichText } from "@/lib/richText";
import { ProductImageGallery } from "@/components/website/ProductCatalog";
import ProductAddToCart from "@/components/website/ProductAddToCart";
import ProductReviews from "@/components/website/ProductReviews";

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string; productId: string }> }) {
  const { slug, productId } = await params;
  const supabase = createServiceClient();

  const { data: website } = await supabase.from("websites").select("id, theme_key, published, dealership_id").eq("slug", slug).maybeSingle();
  if (!website || !website.published) notFound();

  const { data: product } = await supabase
    .from("products")
    .select("id, name, description, price, compare_at_price, images, inventory_count, is_active")
    .eq("id", productId)
    .eq("dealership_id", website.dealership_id)
    .maybeSingle();
  if (!product || !product.is_active) notFound();

  const theme = getTheme(website.theme_key);
  const outOfStock = product.inventory_count != null && product.inventory_count <= 0;

  return (
    <section className="px-6 py-10 max-w-4xl mx-auto">
      <div className="grid sm:grid-cols-2 gap-8">
        <div className="rounded-xl overflow-hidden border border-neutral-200">
          <ProductImageGallery images={product.images ?? []} alt={product.name} />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: theme.dark }}>{product.name}</h1>
          <div className="flex items-center gap-2 mb-4">
            <p className="text-xl font-bold" style={{ color: theme.accent }}>₹{Number(product.price).toLocaleString("en-IN")}</p>
            {product.compare_at_price && product.compare_at_price > product.price && (
              <p className="text-sm text-neutral-400 line-through">₹{Number(product.compare_at_price).toLocaleString("en-IN")}</p>
            )}
          </div>
          {product.description && <div className="text-sm text-neutral-600 leading-relaxed mb-6">{renderRichText(product.description)}</div>}
          <ProductAddToCart
            slug={slug}
            product={{ id: product.id, name: product.name, price: Number(product.price), image: product.images?.[0] }}
            outOfStock={outOfStock}
            theme={theme}
          />
        </div>
      </div>

      <ProductReviews productId={product.id} />
    </section>
  );
}
